# Auth Integration — Supabase JWT (v7)

> Reemplaza el doc previo de Cognito (se borra en el mismo PR).
> Referencia: `../../docs/MASTER_PLAN_v7.md` ADR-101.
> **Regla #0:** los comandos de instalación los corre Victor.
> **Contexto:** no hay producción ni usuarios reales. Cutover es un único PR — sin coexistencia con Cognito, sin auto-link por email para usuarios pre-existentes, sin fallback HS256.

---

## 1. Resumen

- Cliente (web + mobile) hace login con Supabase Auth, obtiene `access_token` (JWT RS256).
- Cliente envía `Authorization: Bearer <access_token>` al backend NestJS en `api.superprofes.app`.
- Backend valida el JWT contra Supabase JWKS público (`/auth/v1/.well-known/jwks.json`).
- Backend extrae `sub` (UUID de `auth.users.id`), `email`, `app_metadata.role` y hace `upsert` del `User` local por `supabase_uid`.

---

## 2. Verificación del JWT — JWKS RS256

Supabase expone JWKS público en:
```
https://<project>.supabase.co/auth/v1/.well-known/jwks.json
```

Instalación (Victor corre):
```bash
cd innova-backend-serverless
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt jwks-rsa
pnpm add -D @types/passport-jwt
```

`src/modules/auth/supabase-jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

interface SupabaseJwtPayload {
  sub: string;        // auth.users.id (UUID)
  email: string;
  aud: string;
  exp: number;
  iat: number;
  role?: string;
  app_metadata?: { role?: string; provider?: string; [k: string]: unknown };
  user_metadata?: Record<string, unknown>;
}

@Injectable()
export class SupabaseJwtStrategy extends PassportStrategy(Strategy, 'supabase-jwt') {
  constructor(config: ConfigService) {
    const supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      audience: 'authenticated',
      issuer: `${supabaseUrl}/auth/v1`,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      }),
    });
  }

  validate(payload: SupabaseJwtPayload) {
    return {
      supabaseUid: payload.sub,
      email: payload.email,
      role: payload.app_metadata?.role ?? 'student',
    };
  }
}
```

---

## 3. Guard + Roles decorator

`src/modules/auth/guards/supabase-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class SupabaseAuthGuard extends AuthGuard('supabase-jwt') {}
```

`src/modules/auth/decorators/roles.decorator.ts` — reutilizar el existente.

`src/modules/auth/guards/roles.guard.ts` — lee rol desde `req.user.role` (ya normalizado por `validate()`).

Uso en controllers:
```typescript
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('TEACHER')
@Get('courses/mine')
listMyCourses(@CurrentUser() user: SupabaseUser) {
  return this.coursesService.listByTeacher(user.supabaseUid);
}
```

---

## 4. Upsert de User local

`src/modules/auth/user-linker.service.ts`. Como no hay usuarios pre-existentes, basta con `upsert` por `supabaseUid`:

```typescript
async ensureUser(payload: { supabaseUid: string; email: string; role: string }) {
  return this.prisma.user.upsert({
    where: { supabaseUid: payload.supabaseUid },
    create: {
      supabaseUid: payload.supabaseUid,
      email: payload.email,
    },
    update: {},
  });
}
```

Para roles `STUDENT` / `TEACHER` / `PARENT`, crear el row tipado correspondiente (`Student`, `Teacher`, `Parent`) en el mismo paso si no existe. La elección del role-row depende de `payload.role`.

> **Nota:** el linking por email **sólo** se usa en el caso de roster sync de Google Classroom (§6), donde el `Student` se creó antes de que el alumno hiciera login. No es un mecanismo de migración legacy.

---

## 5. Custom claim `role` — visible en el JWT

El claim viene en `payload.app_metadata.role`. Lo setea el trigger Postgres `set_default_role` documentado en `innova-clients/docs/SUPABASE_AUTH.md` §5. Para cambiar el rol de un usuario, usar Admin API desde el backend:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

await supabaseAdmin.auth.admin.updateUserById(supabaseUid, {
  app_metadata: { role: 'teacher' },
});
```

Esto es típico cuando un alumno se promueve a "monitor", o cuando el admin del colegio designa profes durante el sync de Classroom.

---

## 6. SSO con Google/Microsoft (integración SIS — ADR-108)

Cuando un alumno entra vía Google SSO:
- Supabase devuelve `payload.app_metadata.provider = 'google'`, `payload.email`, `payload.sub`.
- Backend ejecuta `ensureUser` normal.
- **Plus:** si `email` matchea con `external_id_map` (provider=GOOGLE_CLASSROOM, external_id=email, external_entity_type=STUDENT), entonces liga el `User.supabase_uid` al `Student` preexistente del roster sync.

Pseudo-código en `user-linker.service.ts`:
```typescript
async function maybeLinkExternalRoster(user: User, email: string) {
  const externalMapping = await prisma.externalIdMap.findFirst({
    where: {
      provider: 'GOOGLE_CLASSROOM',
      externalEntityType: 'STUDENT',
      externalId: email,
      deletedAt: null,
    },
  });
  if (!externalMapping) return;

  await prisma.student.update({
    where: { id: externalMapping.internalEntityId },
    data: { userId: user.id },
  });
}
```

---

## 7. Cutover (un único PR)

No hay producción, no hay coexistencia. Un solo PR:

1. Crear proyecto Supabase, configurar trigger `set_default_role` (ver `innova-clients/docs/SUPABASE_AUTH.md` §5).
2. Setear secrets en repo (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`).
3. `git rm` archivos Cognito: `src/modules/auth/cognito-jwt.strategy.ts`, `src/adapters/cognito/`, docs `docs/auth-integration.md` y `docs/auth-testing-status.md`.
4. Agregar `SupabaseJwtStrategy`, `SupabaseAuthGuard`, `UserLinkerService` y registrarlos en `AuthModule`.
5. Reemplazar `@UseGuards(CognitoGuard)` → `@UseGuards(SupabaseAuthGuard)` en todos los controllers.
6. Borrar envs `COGNITO_*` de `.env.example` y de la config (Joi schema).
7. Smoke test manual: `curl -H "Authorization: Bearer <jwt>" https://api.superprofes.app/auth/me` → `{ id, email, role }`.

---

## 8. Tests

- `test/auth/supabase-jwt.strategy.spec.ts`: mock JWKS endpoint, verificar que JWT inválido → 401, JWT válido → user normalizado.
- `test/auth/user-linker.service.spec.ts`: dos casos — primer login (crea User) y login subsecuente (upsert idempotente). Tercer caso: linking con `ExternalIdMap` (ADR-108).
- `test/auth/roles.guard.spec.ts`: matrix role × endpoint, verificar 403 en role incorrecto.
- E2E: smoke test con JWT real generado por `supabase auth sign-in` (test user en staging).

Comando para Victor:
```bash
pnpm jest test/auth --runInBand
```

---

## 9. Variables de entorno

```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from-dashboard>   # para Admin API (updateUserById)
SUPABASE_ANON_KEY=<from-dashboard>           # opcional, sólo si el backend hace queries directas Supabase
```

No se usa `SUPABASE_JWT_SECRET` — la verificación es JWKS RS256 (asimétrico). No hay envs Cognito.

---

## 10. Seguridad

- **Nunca** loggear el JWT completo. Loggear `sub` (UUID) y `email` (con mask).
- **Nunca** confiar en `user_metadata` para autorización — sólo `app_metadata` es server-controlled.
- Rotar `SUPABASE_SERVICE_ROLE_KEY` si se filtra (regenera en dashboard).
- Rate-limit en `/auth/me` y endpoints públicos (Upstash Redis post-MVP).
- CORS: permitir sólo `https://app.superprofes.app` y `https://superprofes.app` en prod.
- Borrado de cuenta: borrar `auth.users` via Admin API + cascade en `User` local (manejarlo en service; la FK no existe en Prisma).
