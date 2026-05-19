# CLAUDE.md — innova-backend-serverless

> Repo-specific instructions for Claude Code. Inherits all rules from `~/.claude/CLAUDE.md`.
> **Plan vigente:** ver `../docs/MASTER_PLAN_v7.md` y `./docs/PLAN_v7_ADDENDUM.md`.
> Stack v7: NestJS + TypeScript strict + Prisma + Mongoose + AWS Lambda + SQS + **Supabase Auth (JWKS)** + **Supabase Postgres** (post-M12).

## [0] REGLA OPERATIVA — install-by-user (CRÍTICA)

El agente **NO ejecuta**: `pnpm install/add`, `prisma migrate/generate/db seed`, `serverless deploy/remove`, `docker compose up`, builds NestJS, tests E2E completos. Los entrega en bloque ` ```bash ` para que Victor los corra y pegue output. **Sí ejecuta**: `Read`/`grep`/`git status|log|diff`, edición de archivos, tests unitarios cortos (`pnpm jest path/file.spec.ts`).

---

## [1] Domain context

This repo is the **core API backend** for the Innova EdTech platform (procedural math error detection, 3°–6° básico chileno). It orchestrates:

- **Attempt ingestion** — receive student attempts (digital steps or OCR-extracted text), validate, classify via rule engine, trigger async LLM when needed.
- **Mastery tracking** — BKT online update (closed-form Bayesian) per (student, skill).
- **Item recommendation** — Fisher information item picker using IRT params from DB.
- **Teacher alerts** — nightly + hourly cron detecting at-risk students.
- **Practice assignment** — queue recommended items + notify parent.

The BKT calibration (Python) and IRT calibration (Python) live in `innova-ai-engine`; this repo **invokes those Lambdas via AWS SDK or delegates via SQS**.

---

## [2] Module structure

```
src/
├── attempts/         # POST /attempts — ingestion + rule engine + BKT update
├── mastery/          # GET /mastery/:studentId — current p_known per skill
├── items/            # CRUD item bank + IRT params
├── skills/           # CRUD skill catalog + prerequisites
├── alerts/           # Teacher dashboard — alert CRUD + mark resolved
├── practice/         # PracticeAssignment generation + parent notification
├── rules-engine/     # Strategy + Factory per topic (see §5)
├── adapters/
│   ├── anthropic/    # Anthropic SDK wrapper — NOT called directly in this repo
│   └── cognito/      # JWT validation guard
├── workers/
│   └── telemetry/    # SQS FIFO consumer → MongoDB + S3
└── shared/
    ├── prisma/        # PrismaService (singleton, onModuleInit)
    ├── mongoose/      # MongooseModule.forRootAsync
    ├── sqs/           # SqsProducerService (typed)
    └── config/        # ConfigModule with Joi schema validation
```

---

## [3] Strict TypeScript rules

- `strict: true`, `noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes` in tsconfig.
- **NEVER `any`** — use `unknown + type guards`, generics, or discriminated unions.
- Every NestJS handler must receive a typed DTO (class-validator + class-transformer).
- `req.body` access is **forbidden** without a typed pipe — always use `@Body() dto: CreateAttemptDto`.
- Prisma types from `@prisma/client` must be used directly; do not redefine Prisma-generated types.
- `Result<T, E>` pattern for domain service responses — avoid throwing in service layer.

---

## [4] Prisma conventions

- Migration: `pnpm prisma migrate dev --name <descriptive-name>` for local; `pnpm prisma migrate deploy` in CI.
- **NEVER `sync: true` in production** (`datasource db { url = env("DATABASE_URL") }`).
- Schema lives at `prisma/schema.prisma`. Do not split schemas.
- Seed file: `prisma/seed.ts` — run with `pnpm prisma db seed`. Seeds ~10 skills + ~50 items for local dev.
- All Prisma queries in `*.repository.ts` files. Repositories inject `PrismaService` directly.
- No raw SQL unless justified by performance (document in a comment with the query plan).

**Modelo de datos v7 (post-M10, ver master plan §4):**

- `School`, `Subject`, `Curriculum`, `Unit`, `Topic` (+ prerequisites, kc_ids) — currículo escalable multi-materia.
- `Course` (ex-`Classroom`, ahora con `subjectId, gradeLevel, academicYear`), `CourseTeacher`, `Enrollment` (alumno↔curso↔año).
- `Exercise` (ex-`Item`, con `source: SYSTEM|TEACHER_AUTHORED|LLM_GENERATED`, `topicId`, `irtA, irtB`).
- `Assignment` (ex-`PracticeAssignment`, ahora persistido real: `createdByTeacherId`, `courseId|studentIds[]`, `dueAt`, `reason: TEACHER_MANUAL|PRACTICE_RECOMMENDER`).
- `Attempt` (+ `assignmentId, courseId, inputMode: DIGITAL|PHOTO_OCR, ocrConfidence?, status`).
- `AttemptStep` (nuevo) — desglose paso a paso, reemplaza `Attempt.rawSteps Json`.
- `StudentTopicMastery` (ex-`StudentSkillMastery`, + `trend7d` para alerts).
- `TeacherAlert` (+ `topicId?, studentId?, severity: LOW|MED|HIGH`).
- `ErrorTag` (nuevo) — fuente de verdad de tipos de error, sincronizada con ai-engine via export.
- `User.supabase_uid` (reemplaza `cognitoSub`).

Source of truth documental: `docs/postgresql.dbml` (debe reescribirse **antes** de la migración Prisma v7).

---

## [5] Rule Engine conventions

Path: `src/rules-engine/`

- One **Strategy class per topic**: `SubtractionBorrowStrategy`, `AdditionCarryStrategy`, `FractionSameDenomStrategy`, etc.
- Each implements `RuleStrategy` interface: `classify(attempt: NormalizedAttempt): ErrorClassification`.
- `RuleEngineFactory` maps `topic.code → RuleStrategy` (Factory pattern). En v7 el mapping es `Topic` (no `Skill`).
- Error types: enum en `src/shared/domain/error-types.ts` sincronizado con tabla `ErrorTag` y con la taxonomía del ai-engine (`docs/error-taxonomy.md`). **Single source of truth.**
- Coverage target: **≥75% of real attempts** clasificados como non-UNCLASSIFIED.
- **No LLM calls in this module** — UNCLASSIFIED sale a SQS `llm-classify-queue`.
- **3 strategies obligatorias en M11**: `subtraction_borrow`, `addition_carry`, `fraction_same_denom`. Sin ellas el rule engine no clasifica.

---

## [6] BKT online update (TypeScript)

Implemented as `MasteryService.updateBkt()` — closed-form Bayesian update:

```typescript
// After observing correct (obs=1) or incorrect (obs=0):
// P(Ln | obs) = P(obs | known) * P(Ln-1) / P(obs)
// P(known | obs=1) = (1-pSlip)*pKnown / ((1-pSlip)*pKnown + pGuess*(1-pKnown))
// Then apply transition: P(Ln) = P(Ln-1) + (1-P(Ln-1)) * pTransit
```

- Parameters come from `StudentSkillMastery.pSlip / pGuess / pTransit`.
- Default init: `p_L0=0.3, p_T=0.1, p_S=0.1, p_G=0.2` (Corbett & Anderson 1995).
- Nightly recalibration updates these params (written by `innova-ai-engine` Lambda back to DB).
- `pKnown` is persisted to `StudentSkillMastery` after every attempt.

---

## [7] Event-driven patterns

```
SQS FIFO (attempt-stream):
  producer: AttemptsService after every attempt (telemetry)
  consumer: TelemetryPersisterWorker → MongoDB + S3

SQS Standard (llm-classify-queue):
  producer: AttemptsService when errorType = UNCLASSIFIED
  consumer: innova-ai-engine LLM Classifier Lambda (separate repo)
  MessageAttributes: { trace_id, attempt_id, student_uuid, topic }

SQS Standard (ocr-queue):
  producer: S3 event trigger (from upload presigned URL)
  consumer: innova-ai-engine OCR Worker Lambda (separate repo)
```

- `SqsProducerService` wraps `@aws-sdk/client-sqs` with typed `sendMessage<T>(queue, body, attrs)`.
- `trace_id` is generated in `AttemptsController` and propagated to all SQS messages.
- No message body should contain PII — only `student_uuid` (UUID, not name/email).

---

## [8] Supabase JWT guard (v7, reemplaza Cognito)

- `SupabaseJwtStrategy` implementa `CanActivate`, valida `Authorization: Bearer <token>` contra JWKS de Supabase: `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`. Sólo RS256 — no se usa HS256 ni `SUPABASE_JWT_SECRET`.
- `SUPABASE_URL` desde `ConfigService` (no hardcodear).
- `@Roles('STUDENT' | 'TEACHER' | 'PARENT' | 'ADMIN')` lee `role` desde `user.app_metadata.role` (custom claim seteado por trigger Postgres en `auth.users` en signup).
- `@CurrentUser()` extrae `SupabaseUser { id (sub UUID), email, role, metadata }`.
- **Upsert de User local**: `prisma.user.upsert({ where: { supabaseUid } })`. No hay auto-link por email para usuarios pre-existentes (cero prod). El linking por email aplica **sólo** para roster sync de Google Classroom (ADR-108) vía `ExternalIdMap`.
- Cognito (`CognitoGuard`, `cognito.adapter.ts`, envs `COGNITO_*`) ya fue borrado en el PR de corte M8 — no debe reaparecer.

Doc detallado: `docs/auth-integration-supabase.md`.

---

## [9] Testing matrix

- **Unit tests**: `src/**/*.spec.ts` — mock all external I/O (Prisma, SQS, Anthropic).
- **Integration tests**: `test/*.e2e-spec.ts` — use `@nestjs/testing` + real Neon DB via `DATABASE_URL_TEST`.
- Coverage gate: **≥75% lines** (`jest --coverage`).
- Key test suites:
  - `RuleEngineFactory` — golden set of 200 attempts, one per error type, assert classification.
  - `MasteryService.updateBkt()` — property tests: `pKnown ∈ [0,1]`, monotonically increases under repeated correct answers.
  - `AttemptsController` — E2E: POST attempt → verify DB row, verify SQS message sent.
  - `TelemetryPersisterWorker` — mock SQS event, verify MongoDB write.

See `docs/prompt/01-innova-backend-serverless-testing.md` for full test spec.

---

## [10] Environment variables (validated at boot)

```env
DATABASE_URL=                 # Supabase Postgres desde M8 (sin Neon)
MONGODB_URI=                  # MongoDB Atlas M0
SUPABASE_URL=                 # https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=    # server-only, admin operations + bypass RLS
SUPABASE_ANON_KEY=            # opcional, queries directas desde el backend
SQS_ATTEMPT_STREAM_URL=
SQS_LLM_CLASSIFY_URL=
SQS_OCR_QUEUE_URL=
SQS_ATTEMPT_REPROCESS_URL=    # loop OCR→Attempts
AWS_REGION=
LOG_LEVEL=info
```

Validated via `ConfigModule.forRoot({ validationSchema: Joi.object({...}) })` in `AppModule`.

---

## [11] Deployment

- Serverless Framework (`serverless.yml`) — Lambda container images per handler.
- Warm-up: `serverless-plugin-warmup` to avoid cold starts on API Gateway routes.
- CI/CD: `.github/workflows/ci.yml` (test + lint + type-check) + `.github/workflows/deploy.yml` (deploy on merge to main).
- Branch: `feature/profile-ci/cd` → PR → 2 reviewers → merge.

---

## [12] What NOT to do

- No ejecutar `prisma migrate/generate`, `serverless deploy`, `pnpm install` desde el agente — ver §[0]. Tampoco crees las migraciones `migration.sql` a mano, yo ejecutare `prisma migrate dev` localmente para generarlas correctamente.
- No volver a `CognitoGuard` ni a JWT custom — auth es Supabase (§[8]).
- Do not add `@ts-ignore` or `as any` — fix the root cause.
- Do not call Anthropic SDK from this repo — enqueue to SQS and let `innova-ai-engine` handle it.
- Do not run synchronous DB calls in async handlers — always `await prisma.*`.
- Do not hardcode AWS region or account ID — use `ConfigService`.
- Do not add features beyond what the current milestone requires (see `docs/milestones.md`).
- Do not use realtive routes in imports — always use absolute paths from `src/` (configured in `tsconfig.json`).
Examples:

```typescript
"paths": {
  "@/*": ["src/*"],
  "@adapters/*": ["src/adapters/*"],
  "@infrastructure/*": ["src/infrastructure/*"],
  "@modules/*": ["src/modules/*"],
  "@shared/*": ["src/shared/*"]
  ...
  ...
}
```
