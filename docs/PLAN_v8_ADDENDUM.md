# PLAN v8 — Addendum innova-backend-serverless

> v8 · 2026-05-18 · Supersede `PLAN_v7_ADDENDUM.md` (v7 quedó implementado en Sprints S1-S5).
> Master plan: `../../docs/MASTER_PLAN_v8.md`. ADRs aplicables: 109-115.
> **Regla #0:** ver `CLAUDE.md §0` — el agente NO ejecuta `pnpm install/add`, `prisma migrate/generate/db seed`, `serverless deploy`, `docker compose up`.

---

## Contexto: dónde estamos

✅ **v7 completado:**

- Schema Prisma con `School`, `Course`, `Subject`, `Curriculum`, `Unit`, `Topic`, `Enrollment`, `Exercise`, `Assignment`, `AttemptStep`, `StudentTopicMastery`, `TeacherAlert`, `ErrorTag` (básico).
- `SupabaseJwtStrategy` reemplaza Cognito.
- 3 rule strategies (`subtraction_borrow`, `addition_carry`, `fraction_same_denom`).
- `AssignmentService.recommendForStudent` con Fisher info.
- `AttemptReprocessWorker` para loop OCR.

🔴 **v8 pendiente:** expansión K-12, taxonomía ≥2540 errores, 40+ rule strategies por subdominio.

---

## Sprint S6 (M14 — Schema extension v8 aditivo)

### S6.1 Migración Prisma `v8_full_k12_taxonomy`

Cambios:

```prisma
model Domain {
  id        String     @id @default(uuid())
  code      String     @unique  // 'ARITH', 'INT', 'FRACT', ..., 'TRANSV'
  name      String
  description String?
  subdomains Subdomain[]
  topics    Topic[]
  errorTags ErrorTag[]
}

model Subdomain {
  id        String   @id @default(uuid())
  domainId  String
  domain    Domain   @relation(fields: [domainId], references: [id])
  code      String   // 'ADD', 'SUB', 'MUL', 'COMPARE', etc.
  name      String
  topics    Topic[]
  errorTags ErrorTag[]
  @@unique([domainId, code])
}

model Topic {
  // existente...
  subdomainId String?   // NUEVO — vínculo a Subdomain
  subdomain   Subdomain? @relation(fields: [subdomainId], references: [id])
  oaCodes     OfficialOACode[]
}

model OfficialOACode {
  id       String @id @default(uuid())
  code     String @unique  // 'MA03 OA 06'
  description String
  grade    Int
  topics   Topic[] @relation(references: [id])
}

model ErrorTag {
  // existente: id, code, name, description
  // NUEVOS:
  domainId         String
  domain           Domain     @relation(fields: [domainId], references: [id])
  subdomainCode    String
  source           ErrorSource @default(CURATED)
  status           ErrorStatus @default(ACTIVE)
  severity         ErrorSeverity @default(MED)
  applicableGrades Int[]
  evidenceRequired String[]    // ['rawSteps', 'finalAnswer', 'OCR']
  diagnosticHint   String?
  remediation      String?
  references       String[]    // 'Brown-VanLehn 1980'
  deprecatedById   String?
  deprecatedBy     ErrorTag?   @relation("Deprecation", fields: [deprecatedById], references: [id])
  successors       ErrorTag[]  @relation("Deprecation")
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
}

enum ErrorSource { CURATED  LLM_GENERATED  FIELD_REPORTED }
enum ErrorStatus { ACTIVE  DRAFT  DEPRECATED }
enum ErrorSeverity { LOW  MED  HIGH  CRITICAL }

model Exercise {
  // existente...
  targetErrorTags ErrorTag[]  // NUEVO — qué errores se quiere provocar/detectar
}

model AttemptStep {
  // existente...
  errorTagId String?
  errorTag   ErrorTag? @relation(fields: [errorTagId], references: [id])
}
```

Comando para Victor:

```bash
cd innova-backend-serverless
pnpm prisma migrate dev --name v8_full_k12_taxonomy --create-only
# revisar SQL, agregar índices manualmente sobre ErrorTag(domainId, status), ErrorTag(source)
pnpm prisma migrate dev
pnpm prisma generate
```

### S6.2 Seeds estructurales

- `prisma/seeds/domains.ts` — 19 dominios fijos.
- `prisma/seeds/subdomains.ts` — ~120 subdominios totales.
- `prisma/seeds/curriculum-full.ts` — consume `curriculum-{g1..g12m}.json` generado por `innova-ai-engine`.
- `prisma/seeds/official-oa-codes.ts` — consume `oa-mapping.json` scrapeado de curriculumnacional.cl.

### S6.3 Script de codegen

`scripts/codegen-error-tags.ts`:

- Lee `ErrorTag` con `status=ACTIVE` de DB.
- Genera `src/shared/domain/error-tags.generated.ts` con enum tipado + helpers (`getDomain(tag)`, `isDeprecated(tag)`).
- Pre-commit hook: si la migración Prisma cambió, regenera y exige que el `.generated.ts` esté en el commit.
- CI workflow `codegen-error-tags.yml` valida que el archivo esté sincronizado.

**DoD:** `prisma migrate deploy` corre limpio en staging. `pnpm run codegen:error-tags` genera enum con ~2540 entries. Tests existentes pasan (no breaking changes).

---

## Sprint S7 (M15 — Importar catálogo de errores)

Consume `error_catalog.jsonl` generado por `innova-ai-engine/scripts/error_catalog_generator.py`.

1. `prisma/seeds/error-tags.ts` carga el JSONL al `ErrorTag`.
2. Idempotente: usa `upsert` por `code` (PK natural).
3. Validación pre-seed: cada entry pasa schema Zod (`code` matches `<DOMAIN>_<SUB>_<NAME>_<GRADE>?`, `domainCode` existe, `subdomainCode` existe).
4. Reporta:

   - # errors loaded por dominio

   - # duplicates rejected

   - # DRAFT vs ACTIVE

Comando:

```bash
cd innova-backend-serverless
pnpm tsx scripts/import-error-catalog.ts --input ../innova-ai-engine/out/error_catalog.jsonl
```

**DoD:** tabla `ErrorTag` con ≥2400 entries `ACTIVE` (curated + generated post-review). 0 violaciones de schema.

---

## Sprint S8 (M16 — 40+ Rule strategies por subdominio)

### S8.1 Refactor del factory

`RuleEngineFactory.forTopic(topic: Topic)`:

- Antes: switch sobre `topic.code`.
- Ahora: lee `topic.subdomain.code` → busca strategy en registry.

```typescript
// src/modules/attempts/rule-engine/factory.ts
const REGISTRY: Record<string, RuleEngineStrategy> = {
  'ARITH_ADD': new ArithAddStrategy(),
  'ARITH_SUB': new ArithSubStrategy(),
  'ARITH_MUL': new ArithMulStrategy(),
  'INT_ADD': new IntAddStrategy(),
  // ... 40+
};
```

### S8.2 Scaffold

`scripts/scaffold-strategy.ts --subdomain=<code>`:

- Genera `src/modules/attempts/rule-engine/strategies/<code>.strategy.ts` con esqueleto.
- Genera `<code>.strategy.spec.ts` con tabla de fixtures.
- Genera `golden-tests/<code>.golden.json`.

### S8.3 Subdominios prioritarios (orden de implementación)

Orden por volumen esperado de attempts en piloto:

1. **G1-G2** (semana 1): `ARITH_ADD`, `ARITH_SUB`, `ARITH_COUNT`, `ARITH_PLACE_VALUE`
2. **G3-G4** (semana 2): `ARITH_MUL`, `ARITH_DIV`, `FRACT_REPR`, `GEOM_AREA`
3. **G5-G6** (semana 3): `FRACT_ADDSUB`, `FRACT_MUL`, `DEC_ALL`, `RATIO_PERCENT`
4. **G7-G8** (semana 4): `INT_ALL` (5 substrategies), `ALGEBRA_EXPR`, `ALGEBRA_EQ_LINEAR`, `POW_POWER`
5. **G9M-G10M** (semana 5): `ALGEBRA_QUAD`, `ALGEBRA_SYSTEM`, `POW_ROOT`, `FUNC_LINEAR`, `FUNC_QUAD`, `GEOM_SIMILARITY`
6. **G11M-G12M** (semana 6): `TRIG`, `LOG`, `FUNC_EXP`, `STAT`, `COORD`, `GEOM3D`

Cobertura objetivo: rule engine clasifica ≥60% de attempts canónicos. Lo demás → LLM classifier.

### S8.4 Golden tests

Por cada subdominio: ≥20 attempts canónicos con error esperado conocido. CI corre `pnpm test:golden` y reporta cobertura por subdominio.

**DoD:** 40+ strategies con golden tests passing. Cobertura ≥60% en suite sintética.

---

## Sprint S9 (M17 — Integración LLM con domain context)

### S9.1 SQS enriquecido

`AttemptsService` cuando publica a `llm-classify-queue`:

- Añade `domainId` y `subdomainId` al body (no solo `topicId`).
- AI engine usa esto para enrutar al prompt correcto sin query adicional.

### S9.2 Endpoint admin `POST /admin/error-tags`

- Crea entries con `status=DRAFT`, `source=FIELD_REPORTED`.
- Solo `role=admin` o `role=teacher` (post-review).
- Cuerpo: `{ code?, name, description, domainCode, subdomainCode, applicableGrades, diagnosticHint, remediation }`.
- Si `code` no se da, genera uno temporal `DRAFT_<uuid>` hasta que admin lo apruebe.

### S9.3 Endpoint admin `PATCH /admin/error-tags/:id/approve`

- Cambia `status: DRAFT → ACTIVE`.
- Asigna `code` final si era `DRAFT_<uuid>`.
- Trigger codegen (CI).

**DoD:** end-to-end: profe reporta error desde dashboard → backend crea DRAFT → admin aprueba → next CI deploy regenera enum y catálogo en clients.

---

## Sprint S10 (M18 — UI admin error catalog)

Endpoints REST para `/admin/error-catalog`:

- `GET /admin/error-tags?domain=&status=&search=` — paginado.
- `GET /admin/error-tags/:id` — detalle + ejemplos de attempts donde se asignó.
- `PATCH /admin/error-tags/:id` — editar (solo admin).
- `DELETE /admin/error-tags/:id` — soft-delete (marca `DEPRECATED`, opcionalmente `deprecatedById`).

UI vive en `apps/web/(admin)/error-catalog` (innova-clients). Backend solo expone API.

---

## Endpoints clave nuevos v8

```
# Currículo y dominios
GET    /domains
GET    /subdomains?domainId=
GET    /curriculum?gradeLevel=
GET    /topics?subdomainId=&gradeLevel=

# Catálogo errores
GET    /error-tags?domain=&status=&grade=
GET    /error-tags/:code               # consulta por código estable
POST   /admin/error-tags               # crear DRAFT
PATCH  /admin/error-tags/:id/approve   # admin aprueba DRAFT → ACTIVE
PATCH  /admin/error-tags/:id/deprecate # admin deprecia (con successor opcional)

# Exercise bank con filtros
GET    /exercises?domainId=&subdomainId=&topicId=&gradeLevel=&difficulty=
POST   /exercises/generate             # request LLM-generated exercise para topic+dificultad

# Heatmap multi-grado
GET    /teacher/courses                # cursos del profe (multi-grado, multi-materia)
GET    /teacher/courses/:id/heatmap-by-unit    # heatmap colapsado por Unit
GET    /teacher/courses/:id/units/:unitId/topics-mastery   # drill-down a Topics
```

---

## Backlog técnico v8

- [ ] Auditoría de queries N+1 en `/teacher/courses/:id/heatmap-by-unit` (Prisma `include` con cuidado).
- [ ] Rate limiting con Redis (Upstash free tier) para `/admin/error-tags` (max 10 drafts/profe/día).
- [ ] Caché de catálogo en `@nestjs/cache-manager` con TTL 5 min (invalida al aprobar/deprecar).
- [ ] Webhook a Slack cuando se crea DRAFT (notifica al equipo para review).
- [ ] Export CSV del catálogo desde `/admin/error-catalog`.

---

## Resumen de archivos a tocar

**Crear:**

- `prisma/migrations/<timestamp>_v8_full_k12_taxonomy/migration.sql` (la genera Victor)
- `prisma/seeds/domains.ts`, `subdomains.ts`, `curriculum-full.ts`, `official-oa-codes.ts`, `error-tags.ts`
- `scripts/codegen-error-tags.ts`
- `scripts/scaffold-strategy.ts`
- `scripts/import-error-catalog.ts`
- `src/modules/attempts/rule-engine/strategies/*.strategy.ts` (40+ archivos)
- `src/modules/error-tags/` (módulo nuevo: controller + service)
- `src/modules/admin/error-catalog.controller.ts`

**Modificar:**

- `prisma/schema.prisma`
- `src/modules/attempts/rule-engine/factory.ts`
- `src/modules/attempts/rule-engine/strategy.interface.ts` (importa errorType desde `error-tags.generated.ts`, no string union literal)
- `src/modules/attempts/attempts.service.ts` (enriquecer SQS con domainId)
- `docs/postgresql.dbml` (reescribir reflejando schema v8)
- `.github/workflows/codegen-error-tags.yml` (NUEVO)
- `.github/workflows/validate-catalog.yml` (NUEVO)
