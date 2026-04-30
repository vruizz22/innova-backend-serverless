## Session: 2026-04-30 — TODO Implementation + AWS Setup + YAML Fixes

**Prompt:**
Aplicar TODO list de prompt-claude.md (excepto TODO-15), corregir errores YAML en deploy.yml y serverless.yml, y proporcionar tutorial de configuración AWS (SQS, Cognito, GitHub Secrets).

**Output:**

### YAML Fixes aplicadas

- `serverless.yml`: Convertidos todos los `!Ref` y `!GetAtt` YAML tags a forma larga JSON (`{"Ref": "X"}`, `{"Fn::GetAtt": ["X", "Y"]}`) para eliminar warnings del linter YAML de VSCode. Los warnings eran falsos positivos del schema validator que no reconoce YAML custom tags de CloudFormation.
- `deploy.yml`: Añadidas comillas en campo `args` del step `serverless/github-action` (`args: "deploy --stage ..."`) para resolver warning de tipo string esperado.

### TODO-1 — Repositorios Prisma reales (en progreso al momento del compact)

**MasteryService** (`src/modules/mastery/mastery.service.ts`) — COMPLETADO:

- Reemplazado `Map<string, MasteryState>` in-memory por Prisma real
- `applyAttempt()` → `prisma.skill.findUnique({ include: { bktParams: true } })` para leer params BKT de DB
- `prisma.studentSkillMastery.upsert()` con `@@unique([studentId, skillId])`
- Defaults: `pL0=0.3, pT=0.1, pS=0.1, pG=0.2` cuando skill no existe en DB
- `getStudentMastery()` → `prisma.studentSkillMastery.findMany({ include: { skill: true } })`

**AttemptsService** (`src/modules/attempts/attempts.service.ts`) — COMPLETADO:

- `prisma.attempt.create()` real con todos los campos del schema
- Función helper `toPrismaErrorType()` que mapea tipos del rule engine → `ErrorType` enum de Prisma
  - `BORROW_OMITTED_TENS/HUNDREDS` → `BORROW_OMITTED` (consolidación)
  - `DIGIT_TRANSPOSITION` → `UNCLASSIFIED` (no existe en schema aún)
  - `CORRECT` → `null` (no es error)
- `rawSteps` cast vía `JSON.parse(JSON.stringify(...))` para compatibilidad con `InputJsonValue` de Prisma
- Retorna `attempt.id` real de DB (antes era `randomUUID()` efímero)

**SkillsService** (`src/modules/skills/skills.service.ts`) — COMPLETADO:

- CRUD completo contra `prisma.skill`: create, findAll, findOne, update, remove
- Retorna tipos `Skill` de `@prisma/client` directamente (sin redefinir)
- `getPrerequisites()` retorna `[]` (no modelado en schema MVP)

**ItemsService** (`src/modules/items/items.service.ts`) — COMPLETADO:

- `prisma.item.create()` con validación Zod del content schema `{ prompt: string }`
- `findAll()` y `getIrtParams()` contra Prisma

**AlertsService** (`src/modules/alerts/alerts.service.ts`) — COMPLETADO:

- `create(classroomId, message, teacherId)` → `prisma.teacherAlert.create()`
- `teacherId` es requerido (FK al modelo Teacher en schema)
- `findByClassroom()` filtra por `resolved: false` + ordena por `createdAt: desc`
- AlertsController actualizado para pasar `teacherId` en body

### TODO-2 — Seed script (`prisma/seed.ts`) — COMPLETADO

- 1 School, 1 Classroom (3° Básico A)
- 1 Teacher (seed-teacher-001), 5 Students (seed-student-001 a 005)
- 1 Skill: `subtraction_borrow` con SkillBKTParams: `pL0=0.3, pT=0.1, pS=0.1, pG=0.2`
- 30 Items canónicos distribuidos en 8 error types (4 por tipo)
- `package.json` → `"prisma": { "seed": "ts-node -r tsconfig-paths/register prisma/seed.ts" }`

### TODO-3 — Cognito JWT Guard real — EN PROGRESO al compact

- Reescrito `jwt-auth.guard.ts` para usar `@nestjs/passport` + `AuthGuard('jwt')`
- Creado `jwt.strategy.ts` con `PassportStrategy(Strategy)` usando `passport-jwt` + `jwks-rsa`
- JWKS URI: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`
- Cache habilitado: `cacheMaxAge: 600_000ms`, `jwksRequestsPerMinute: 10`
- Auth module actualizado para proveer JwtStrategy

### Fix adicional: prisma-profile.repository.ts

- Archivo v1 FSLSM que referenciaba modelo `FslsmProfile` (eliminado del schema post-pivot)
- Reemplazado con stub `NotImplementedException` para que compile sin borrar el archivo
- Pendiente limpieza completa en TODO-15

### Fix crítico: Prisma 7 datasource URL

- Prisma 7.x NO soporta `url = env("DATABASE_URL")` en `schema.prisma`
- URL se configura en `prisma.config.ts` (ya existía con `datasource: { url: process.env['DATABASE_URL'] }`)
- Schema.prisma tiene solo `datasource db { provider = "postgresql" }`

**Decisión:**

- Usar `{"Ref": "X"}` en lugar de `!Ref X` en serverless.yml para evitar YAML linter warnings de VSCode (falsos positivos por custom tags CloudFormation)
- JWT guard implementado con passport-jwt + jwks-rsa (ya instalados) en lugar de importar jsonwebtoken directamente → menos dependencias, patrón NestJS estándar
- `toPrismaErrorType()` como función helper pura para separar la lógica de mapeo del método `create()`

**Tradeoffs considerados:**

- `!Ref` vs `{"Ref": "..."}`: ambas son válidas en Serverless Framework. La forma JSON elimina los warnings del YAML linter sin cambiar comportamiento en deploy.
- Passport strategy vs guard custom: Passport es el patrón estándar NestJS para auth, reutilizable y testeable.
- `rawSteps` cast: `JSON.parse(JSON.stringify(...))` es la forma más segura de convertir a `InputJsonValue` de Prisma sin perder datos.

**Archivos modificados:**

- `serverless.yml` — !Ref/!GetAtt → JSON form
- `.github/workflows/deploy.yml` — comillas en args
- `prisma/schema.prisma` — revertido url (Prisma 7 usa prisma.config.ts)
- `src/modules/mastery/mastery.service.ts` — real Prisma
- `src/modules/mastery/mastery.service.spec.ts` — mock PrismaService con store stateful
- `src/modules/attempts/attempts.service.ts` — real prisma.attempt.create()
- `src/modules/skills/skills.service.ts` — real Prisma CRUD
- `src/modules/items/items.service.ts` — real Prisma CRUD
- `src/modules/alerts/alerts.service.ts` — real Prisma
- `src/modules/alerts/alerts.controller.ts` — teacherId en body
- `src/modules/auth/jwt-auth.guard.ts` — reescrito con AuthGuard('jwt')
- `src/modules/auth/jwt.strategy.ts` — NUEVO: PassportStrategy con JWKS
- `src/modules/auth/auth.module.ts` — añadido JwtStrategy como provider
- `src/infrastructure/database/prisma-profile.repository.ts` — stub NotImplemented
- `prisma/seed.ts` — NUEVO: seed completo 30 items
- `package.json` — añadido prisma.seed config

**Tests agregados/modificados:**

- `src/modules/mastery/mastery.service.spec.ts` — mock PrismaService stateful (Map en closure por test)

---

## Estado al momento del compact (lo que falta para terminar la sesión)

### Pendiente inmediato (misma sesión)

1. **TODO-3 completar**: Verificar que `jwt-auth.guard.ts` + `jwt.strategy.ts` + `auth.module.ts` compilan sin errores
2. **`pnpm tsc --noEmit` 0 errores**: Quedan errores de tipos en jwt.strategy.ts (passport-jwt types) y mastery.service.ts (parámetro `r` implicitly any)
3. **`pnpm test` 29+ tests pasando**: Verificar que tests existentes no rompieron

### Pendiente para próxima sesión

- **TODO-4**: Verificar docker-compose + levantar API localmente (docker compose up -d → prisma migrate dev → start:dev)
- **TODO-5 a TODO-14**: Ver prompt-claude.md
- **AWS setup tutorial**: Pendiente explicar cómo obtener credenciales AWS, SQS URLs, Cognito User Pool ID/Client ID, y configurar GitHub Secrets
- **TODO-15**: Cleanup v1 FSLSM (rama chore/remove-v1-fslsm) — NO hacer hasta que el usuario lo pida explícitamente

### Comandos para retomar

```bash
cd innova-backend-serverless
pnpm tsc --noEmit          # verificar 0 errores antes de continuar
pnpm test                  # verificar tests verdes
pnpm prisma generate       # si es necesario regenerar client
docker compose up -d
pnpm prisma migrate dev
pnpm start:dev
curl http://localhost:3000/health
```
