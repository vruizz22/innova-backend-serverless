# Testing Strategy — innova-backend-serverless

> Detección temprana de errores procedurales en matemáticas — 3°–6° básico chileno.
> Framework: NestJS + TypeScript strict + Prisma + Mongoose. Cloud: AWS Serverless.

---

## Tabla de contenidos

- [1. Arquitectura de tests](#1-arquitectura-de-tests)
- [2. Pirámide de cobertura](#2-pirámide-de-cobertura)
- [3. Unit Tests](#3-unit-tests)
  - [3.1 Rule Engine (Strategy)](#31-rule-engine-strategy)
  - [3.2 MasteryService (BKT)](#32-masteryservice-bkt)
  - [3.3 AttemptsService](#33-attemptsservice)
  - [3.4 Adapters](#34-adapters)
  - [3.5 Guards e Interceptors](#35-guards-e-interceptors)
- [4. Integration Tests (Repository Layer)](#4-integration-tests-repository-layer)
- [5. E2E Tests](#5-e2e-tests)
- [6. Pipeline CI/CD](#6-pipeline-cicd)
- [7. Coverage Gate](#7-coverage-gate)
- [8. Anti-patrones bloqueados en CI](#8-anti-patrones-bloqueados-en-ci)

---

## 1. Arquitectura de tests

```mermaid
flowchart TD
  subgraph E2E["E2E (supertest)"]
    HTTP["HTTP Request"] --> GUARD["JWT Guard (mocked Cognito)"]
    GUARD --> CTRL["Controller"]
    CTRL --> SVC["Service"]
    SVC --> REPO["Repository"]
    REPO --> TESTDB[("Test Postgres\ntestcontainers")]
  end

  subgraph UNIT["Unit Tests (jest + mocks)"]
    USVC["Service"] -->|jest-mock-extended| MPRISMA["MockPrismaClient"]
    USVC -->|jest.fn| MSQS["MockSqsAdapter"]
    USTRAT["RuleStrategy"] --> INPUT["AttemptInput fixture"]
    UBKT["MasteryService"] --> FAST["fast-check\nproperty tests"]
  end

  subgraph INT["Integration (Repository Layer)"]
    REPO2["Repository"] --> PGREAL[("Postgres 16\ntestcontainers")]
    REPO2 --> MONGO[("MongoDB\nin-memory")]
  end

  E2E -.uses real DB.-> TESTDB
  UNIT -.no I/O.-> MPRISMA
  INT -.real ORM test DB.-> PGREAL
```

---

## 2. Pirámide de cobertura

| Tipo | Framework | DB | Velocidad | Coverage objetivo |
|------|----------|----|-----------|------------------|
| Unit | `jest` + `jest-mock-extended` | Mock | <5s | ≥75% lines/branches |
| Integration | `@testcontainers/postgresql` + `mongodb-memory-server` | Real test | <60s | Repositorios y transacciones |
| E2E | `supertest` + `Test.createTestingModule()` | Real test | <120s | Flows críticos |

---

## 3. Unit Tests

### 3.1 Rule Engine (Strategy)

**Archivo:** `src/modules/attempts/rule-engine/strategies/subtraction-borrow.strategy.spec.ts`

Cada `error_type` tiene 1 test con fixture canónica. Formato BDD:

```typescript
describe('SubtractionBorrowStrategy', () => {
  it('classifies CORRECT — 53-26, student writes 27', () => { ... });
  it('classifies SUBTRAHEND_MINUEND_SWAPPED — 53-26, student writes -27', () => { ... });
  it('classifies BORROW_OMITTED_TENS — 53-26, student writes 33', () => { ... });
  it('classifies BORROW_OMITTED_HUNDREDS — 423-156, student writes 333', () => { ... });
  it('classifies BORROW_FROM_ZERO_INCORRECT — 100-27, student writes 83', () => { ... });
  it('classifies STOP_BORROW_PROPAGATION — 1000-1, student writes 999', () => { ... });
  it('classifies DIGIT_TRANSPOSITION — 53-26, student writes 72', () => { ... });
  it('classifies ARITHMETIC_FACT_ERROR — answer off by 1-2', () => { ... });
  it('classifies UNCLASSIFIED — incoherent answer', () => { ... });
});
```

**Regla:** confidence ≥ 0.85 para los tipos deterministas (SWAPPED, BORROW_OMITTED_*, DIGIT_TRANSPOSITION).

**Golden set:** `test/fixtures/golden_attempts.json` — 200 attempts canónicos. Todos deben clasificar correctamente via `RuleEngine`.

---

### 3.2 MasteryService (BKT)

**Archivo:** `src/modules/mastery/mastery.service.spec.ts`

Property-based tests con `fast-check`:

```typescript
describe('MasteryService — BKT properties', () => {
  it('pKnown stays in [0, 1] after correct answer — for any valid params', () =>
    fc.assert(fc.property(
      fc.float({ min: 0.01, max: 0.99 }),
      fc.float({ min: 0.01, max: 0.49 }),
      (pKnown, pSlip) => {
        const result = applyBKT(pKnown, pSlip, 0.2, 0.1, true);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
      }
    )));

  it('pKnown monotonically increases under N consecutive correct (pSlip < 0.5)', () => { ... });
  it('pKnown=1 stays 1 after correct answer (near-ceiling idempotency)', () => { ... });
  it('pKnown decreases under N consecutive incorrect (pGuess < 0.5)', () => { ... });
  it('getStudentMastery returns only records for given student', () => { ... });
});
```

---

### 3.3 AttemptsService

**Archivo:** `src/modules/attempts/attempts.service.spec.ts`

Mock de `PrismaService` via `jest-mock-extended`. **Nunca hit a DB real** en este nivel.

| Scenario | Expectation |
|---------|-------------|
| Happy path — classified | `prisma.attempt.create()` called, SQS FIFO published, mastery updated |
| UNCLASSIFIED | SQS Standard published con `{attemptId}`, NOT FIFO |
| Item not found | `NotFoundException` thrown |
| DTO validation failure | `BadRequestException` (a nivel de pipe) |
| DB transaction rollback | State unchanged, error propagated |

```typescript
describe('AttemptsService.create', () => {
  it('classifies and saves — BORROW_OMITTED_TENS for 53-26', async () => {
    mockPrisma.item.findUniqueOrThrow.mockResolvedValue(mockItem);
    mockPrisma.attempt.create.mockResolvedValue({ id: 'att-1', ...mockAttempt });

    const result = await service.create(dto);

    expect(result.errorType).toBe('BORROW_OMITTED_TENS');
    expect(mockSqs.publishFifo).toHaveBeenCalled();
    expect(mockSqs.publishStandard).not.toHaveBeenCalled();
  });

  it('enqueues to LLM Standard when UNCLASSIFIED', async () => { ... });
  it('throws NotFoundException when item not found', async () => { ... });
});
```

---

### 3.4 Adapters

**AnthropicAdapter** (`src/adapters/anthropic.adapter.spec.ts`):
- `cache_control: {type: "ephemeral"}` presente en system block.
- `tool_choice: {type: "tool", name: "classify_errors_batch"}` forzado.
- Retry con exponential backoff en 429 (mock 3 fallos → éxito en 4°).
- Killswitch: cuando SSM `LLM_PAUSED=true` → lanza `ServiceUnavailableException` sin llamar Anthropic.

**MathOCROrchestrator** (`src/adapters/math-ocr/math-ocr.orchestrator.spec.ts`):
- Gemini confidence ≥ 0.85 → retorna Gemini sin llamar Claude.
- Gemini confidence < 0.85 → llama Claude fallback.
- Retorna el resultado con mayor confidence entre los dos.

**SqsAdapter** (`src/adapters/sqs.adapter.spec.ts`):
- `publishFifo`: verifica `MessageGroupId = studentId`, `MessageDeduplicationId` generado.
- `publishStandard`: verifica `MessageAttributes.trace_id` propagado.

---

### 3.5 Guards e Interceptors

**JwtAuthGuard**:
- Token válido con grupo `STUDENT` → `canActivate = true`.
- Token expirado → `UnauthorizedException`.
- Sin header `Authorization` → `UnauthorizedException`.

**ResponseInterceptor**:
- Respuesta wrappea en `{ statusCode, data, timestamp, path, traceId }`.
- `traceId` viene de `x-trace-id` header o se genera UUID.

---

## 4. Integration Tests (Repository Layer)

**Framework:** `@testcontainers/postgresql` + `mongodb-memory-server`.

```typescript
describe('StudentSkillMastery Repository (Integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const container = await new PostgreSqlContainer('postgres:16-alpine').start();
    prisma = new PrismaClient({ datasources: { db: { url: container.getConnectionUri() } } });
    await execSync('pnpm prisma migrate deploy', { env: { DATABASE_URL: container.getConnectionUri() } });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('upsert creates new record on first attempt', async () => { ... });
  it('upsert increments attemptsCount on subsequent attempts', async () => { ... });
  it('$transaction rolls back if mastery update fails mid-transaction', async () => { ... });
});
```

Tests requeridos:
- `StudentSkillMastery` upsert — create vs update semántica
- `TeacherAlert` query — filtra por `classroomId` y `resolvedAt IS NULL`
- `Attempt` con índices — queries sobre `@@index([studentId, createdAt])`
- `Prisma.$transaction` rollback — si BKT update falla, Attempt NO se persiste

---

## 5. E2E Tests

**Framework:** `supertest` + `Test.createTestingModule()`. App levanta completa con stubs solo para APIs externas (Cognito JWKS, Anthropic, Gemini).

### Flows requeridos

| Flow | Endpoint | Verifica |
|------|---------|----------|
| Attempt digital | `POST /attempts` | 201, DB row + SQS message |
| UNCLASSIFIED → SQS LLM | `POST /attempts` (incoherent) | errorType=UNCLASSIFIED, SQS Standard published |
| Mastery readback | `GET /mastery/:studentId` | Refleja BKT update post-attempt |
| Teacher dashboard | `GET /alerts?classroomId=X` | Alertas activas, formato correcto |
| Practice assign | `POST /practice/assign` | PracticeAssignment creado en DB |
| JWT invalid | `POST /attempts` sin token | 401 Unauthorized |

```typescript
describe('POST /attempts (E2E)', () => {
  it('classifies BORROW_OMITTED_TENS and persists', async () => {
    const res = await request(app.getHttpServer())
      .post('/attempts')
      .set('Authorization', `Bearer ${studentJwt}`)
      .send({ itemId: 'item-subtraction-1', finalAnswer: '33', rawSteps: [] });

    expect(res.status).toBe(201);
    expect(res.body.data.errorType).toBe('BORROW_OMITTED_TENS');

    const dbRow = await prisma.attempt.findUnique({ where: { id: res.body.data.attemptId } });
    expect(dbRow).not.toBeNull();
  });
});
```

---

## 6. Pipeline CI/CD

```mermaid
flowchart LR
  PR["Pull Request"] --> LINT["pnpm lint\n0 errores"]
  LINT --> TSC["tsc --noEmit\n0 type errors"]
  TSC --> FMT["prettier --check\n0 diff"]
  FMT --> UNIT["pnpm test:cov\ncoverage ≥ 75%"]
  UNIT --> E2E["pnpm test:e2e\nsuites verdes"]
  E2E --> MERGE["✅ Merge habilitado"]
  MERGE --> DEPLOY["serverless deploy\n--stage prod"]
```

```yaml
# .github/workflows/ci.yml (fragmento)
services:
  postgres:
    image: postgres:16-alpine
    env: { POSTGRES_PASSWORD: test, POSTGRES_DB: innova_test }
    options: --health-cmd pg_isready --health-interval 5s --health-retries 5
  mongo:
    image: mongo:7
    options: --health-cmd "mongosh --eval 'db.adminCommand({ping:1})'"
steps:
  - run: pnpm install --frozen-lockfile
  - run: pnpm exec eslint . --max-warnings=0
  - run: pnpm exec prettier --check .
  - run: pnpm exec tsc --noEmit
  - run: pnpm prisma migrate deploy
    env: { DATABASE_URL: postgresql://postgres:test@localhost:5432/innova_test }
  - run: pnpm test:cov
  - name: Coverage gate ≥75%
    run: node scripts/check-coverage.mjs --threshold 75
  - run: pnpm test:e2e
```

---

## 7. Coverage Gate

| Módulo | Objetivo |
|--------|---------|
| `src/modules/attempts/` (Rule Engine + Service) | ≥85% |
| `src/modules/mastery/` | ≥80% |
| `src/adapters/` | ≥75% |
| `src/infrastructure/workers/` | ≥70% |
| `src/shared/` | ≥75% |
| **Total** | **≥75% lines/branches/statements/functions** |

CI falla si cualquier métrica está bajo 75%.

---

## 8. Anti-patrones bloqueados en CI

| Anti-patrón | Herramienta | Nivel |
|------------|-------------|-------|
| `any` en código productivo | ESLint `@typescript-eslint/no-explicit-any` | error |
| `it.skip` / `xit` commitados | ESLint `jest/no-disabled-tests` | error |
| `console.log` fuera de `Logger` | ESLint `no-console` | error |
| Llamadas de red reales en tests | `nock.disableNetConnect()` en setup global | throws |
| Tests sin `expect()` assertions | ESLint `jest/expect-expect` | error |
| E2E sin teardown `afterAll` | Manual review en PR | blocks merge |
| Imports relativos (`../../../`) | ESLint `no-restricted-imports` | error (usar `@modules/*`) |
