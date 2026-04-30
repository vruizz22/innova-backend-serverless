# CLAUDE.md — innova-backend-serverless

> Repo-specific instructions for Claude Code. Inherits all rules from `~/.claude/CLAUDE.md`.
> Stack: NestJS + TypeScript strict + Prisma + Mongoose + AWS Lambda + SQS.

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

Key tables (from `docs/postgresql.dbml`):
- `Skill` — `id, topic, gradeLevel, prerequisites[], description`
- `Item` — `id, skillId, content (Json), irtDifficulty, irtDiscrimination`
- `Attempt` — `id, studentId, itemId, rawSteps (Json), finalAnswer, isCorrect, errorType?, classifierSource, confidence?, llmJobId?`
- `StudentSkillMastery` — `@@id([studentId, skillId])`, `pKnown, pSlip, pGuess, pTransit, attemptsCount`
- `TeacherAlert` — `alertType, classroomId, payload (Json)`
- `PracticeAssignment` — `studentId, itemIds[], reason, assignedAt`

---

## [5] Rule Engine conventions

Path: `src/rules-engine/`

- One **Strategy class per topic**: `SubtractionBorrowStrategy`, `AdditionCarryStrategy`, etc.
- Each implements `RuleStrategy` interface: `classify(attempt: NormalizedAttempt): ErrorClassification`.
- `RuleEngineFactory` maps `skill.topic → RuleStrategy` (Factory pattern).
- Error types: string literal union defined in `src/shared/domain/error-types.ts` (single source of truth, shared with `innova-ai-engine` via docs).
- Coverage target: **≥75% of real attempts** classified as non-UNCLASSIFIED.
- **No LLM calls in this module** — UNCLASSIFIED exits to SQS `llm-classify-queue`.

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

## [8] Cognito JWT guard

- `CognitoGuard` implements `CanActivate`, validates `Authorization: Bearer <token>` via Cognito JWKS endpoint.
- User pool and client ID from `ConfigService` (not hardcoded).
- `@Roles('STUDENT' | 'TEACHER' | 'PARENT' | 'ADMIN')` decorator enforces authorization.
- `@CurrentUser()` param decorator extracts typed `CognitoUser` from request.

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
DATABASE_URL=           # Neon Postgres connection string
MONGODB_URI=            # MongoDB Atlas M0 connection string
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_REGION=
SQS_ATTEMPT_STREAM_URL=
SQS_LLM_CLASSIFY_URL=
SQS_OCR_QUEUE_URL=
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

- Do not add `@ts-ignore` or `as any` — fix the root cause.
- Do not call Anthropic SDK from this repo — enqueue to SQS and let `innova-ai-engine` handle it.
- Do not run synchronous DB calls in async handlers — always `await prisma.*`.
- Do not hardcode AWS region or account ID — use `ConfigService`.
- Do not add features beyond what the current milestone requires (see `docs/milestones.md`).
