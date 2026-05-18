# Auth Integration — Supabase JWT (v7)

> Reemplaza `auth-integration.md` (Cognito), que se archiva como `archive/auth-integration-cognito.md` al cortar M9.
> Referencia: `../../docs/MASTER_PLAN_v7.md` ADR-101.
> **Regla #0:** los comandos de instalación los corre Victor.

---

## 1. Resumen

- Cliente (web + mobile) hace login con Supabase Auth, obtiene `access_token` (JWT).
- Cliente envía `Authorization: Bearer <access_token>` al backend NestJS en `api.superprofes.app`.
- Backend valida el JWT contra Supabase JWKS (preferido) o HS256 con `SUPABASE_JWT_SECRET` (fallback).
- Backend extrae `sub` (UUID de `auth.users.id`), `email`, `app_metadata.role` y mapea a `User` local via `supabase_uid` (auto-link por email si no existe).

---

## 2. Verificación del JWT

### 2.1 Estrategia recomendada: JWKS asimétrico (RS256)

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

### 2.2 Fallback: HS256 simétrico (si el plan Supabase no expone JWKS)

Sólo si JWKS no está disponible. Usar `SUPABASE_JWT_SECRET` (visible en Supabase dashboard → Project Settings → API).

```typescript
super({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  ignoreExpiration: false,
  algorithms: ['HS256'],
  secretOrKey: config.getOrThrow<string>('SUPABASE_JWT_SECRET'),
});
```

**Tradeoff:** HS256 acopla el backend al secret (rotación obliga a redeploy). JWKS RS256 es la opción correcta a futuro.

---

## 3. Guard + Roles decorator

`src/modules/auth/guards/supabase-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class SupabaseAuthGuard extends AuthGuard('supabase-jwt') {}
```

`src/modules/auth/decorators/roles.decorator.ts` (sin cambios, reusar el existente).

`src/modules/auth/guards/roles.guard.ts` — leer rol desde `req.user.role` (ya viene normalizado por `validate()`).

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

## 4. Auto-linking de User local

`src/modules/auth/user-linker.service.ts` corre en un interceptor o se llama desde `validate()`:

```typescript
async ensureUser(payload: { supabaseUid: string; email: string; role: string }) {
  let user = await this.prisma.user.findUnique({
    where: { supabaseUid: payload.supabaseUid },
  });
  if (user) return user;

  // Auto-link por email (caso roster sync que creó Student/Teacher sin supabase_uid)
  user = await this.prisma.user.findUnique({ where: { email: payload.email } });
  if (user) {
    return this.prisma.user.update({
      where: { id: user.id },
      data: { supabaseUid: payload.supabaseUid },
    });
  }

  // Caso totalmente nuevo (signup directo sin pasar por roster sync)
  return this.prisma.user.create({
    data: {
      supabaseUid: payload.supabaseUid,
      email: payload.email,
    },
  });
}
```

Para roles `STUDENT` / `TEACHER` / `PARENT`, crear el row tipado correspondiente (`Student`, `Teacher`, `Parent`) en el mismo paso, sólo si no existe. La elección del role-row depende de `payload.role`.

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

## 7. Plan de corte Cognito → Supabase

| Día | Acción | Quien |
|---|---|---|
| D-7 | Deploy `SupabaseJwtStrategy` en paralelo a `CognitoJwtStrategy` (header `Authorization-Provider` decide cuál usar) | backend deploy |
| D-3 | Clientes migran a Supabase Auth (M9 web, M13 mobile) | clients deploy |
| D-1 | Verificar que <1% de requests aún usan Cognito JWT (CloudWatch metric custom) | observación |
| D+0 | Remover `CognitoJwtStrategy`, `CognitoGuard`, `cognito.adapter.ts`, envs `COGNITO_*` | PR de corte |
| D+7 | Eliminar User Pool en AWS Cognito | manual console |

---

## 8. Tests

- `test/auth/supabase-jwt.strategy.spec.ts`: mock JWKS endpoint, verificar que JWT inválido → 401.
- `test/auth/user-linker.service.spec.ts`: verificar 3 casos (existe, auto-link por email, crear nuevo) + caso roster sync.
- `test/auth/roles.guard.spec.ts`: matrix role × endpoint, verificar 403 en role incorrecto.
- E2E: smoke test desde Postman/curl con JWT real generado por `supabase auth sign-in` (mock o real test user).

Comando para Victor:
```bash
pnpm jest test/auth --runInBand
```

---

## 9. Variables de entorno

```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_JWT_SECRET=<from-dashboard>         # solo si fallback HS256
SUPABASE_SERVICE_ROLE_KEY=<from-dashboard>   # para Admin API (updateUserById)
SUPABASE_ANON_KEY=<from-dashboard>           # opcional, sólo si el backend hace queries directas Supabase
```

Deprecadas:
```env
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_REGION=
```

---

## 10. Seguridad

- **Nunca** loggear el JWT completo. Loggear `sub` (UUID) y `email` (con mask).
- **Nunca** confiar en `user_metadata` para autorización — sólo `app_metadata` es server-controlled.
- Rotar `SUPABASE_SERVICE_ROLE_KEY` si se filtra (regenera en dashboard).
- Rate-limit en `/auth/me` y endpoints públicos (Upstash Redis post-MVP).
- CORS: permitir sólo `https://app.superprofes.app` y `https://superprofes.app` en prod.
- Si el cliente quiere borrar su cuenta: borrar `auth.users` via Admin API + cascade en `User` local (`onDelete: Cascade` en Prisma para `User.supabaseUid` no aplica porque la FK no existe — hacerlo en service).
