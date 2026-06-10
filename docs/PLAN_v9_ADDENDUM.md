# PLAN v9 — Addendum innova-backend-serverless

> v9 · 2026-06-10 · Supersede `PLAN_v8_ADDENDUM.md` (los pendientes v8 quedan embebidos como **track paralelo** en cada sprint).
> Master plan: `../../docs/MASTER_PLAN_v9.md`. ADRs aplicables: 116-125 (y 101-115 vigentes).
> **Regla #0:** ver `CLAUDE.md §0` — el agente NO ejecuta `pnpm install/add`, `prisma migrate/generate/db seed`, `serverless deploy`, `docker compose up`.

---

## Contexto: dónde estamos

✅ **v8 cerrado en este repo (rama `feature/plan_V8`):**

- Migración `v8_full_k12_taxonomy` aplicada: `Domain`, `Subdomain`, `OfficialOACode`, `ErrorTag` extendida (source/status/severity/applicableGrades/remediation/deprecation), `Exercise.targetErrorTags`, `AttemptStep.errorTagId`.
- Catálogo importado: **341 error tags** + `codegen-error-tags.ts` generando el enum TS.
- Rule engine: **19 subdominios cubiertos por 11 archivos de strategy** (ARITH ADD/SUB/MUL/DIV, INT ADD/SUB/MUL, FRACT ADDSUB/MUL/DIV, DEC ×4, RATIO ×2, POW ×2, ALGEBRA_EQ_LINEAR). 112 tests verdes.
- Scripts: `import-error-catalog.ts`, `scaffold-strategy.ts`, `codegen-error-tags.ts`.

🔴 **v8 pendiente (ahora track paralelo v9):** catálogo 341 → ≥2400 ACTIVE, strategies 19 → ≥40 subdominios, endpoints heatmap C2, endpoints admin error catalog.

🟡 **v9 nuevo:** módulo `guides` + `guide-submissions`, pipeline de corrección de entregas, endpoints por rol (alumno/profe/apoderado), heatmap completo.

---

## Sprint S11 (M22 — Schema v9 + infra)

### S11.1 Migración Prisma `v9_guides_pipeline`

Aditiva sobre v8, **sin renames**. Modelos completos en master plan §3:

- Enums: `GuideStatus`, `GuideQuestionStatus`, `SolutionSource`, `SubmissionStatus`.
- Tablas: `Guide`, `GuideQuestion`, `GuideSolution`, `GuideSubmission` (con `@map(snake_case)` e índices del master plan).
- Extensiones: `Assignment.kind String @default("EXERCISES")`, back-relations en `Teacher/Course/Student/Topic/Exercise/Attempt/Assignment`.
- Valores nuevos en campos String existentes (sin migración de enum): `Exercise.source='GUIDE_EXTRACTED'`, `Attempt.inputMode='PHOTO_GUIDE'`, `TeacherAlert.alertType ∈ {GUIDE_READY_FOR_REVIEW, GUIDE_GRADING_COMPLETE, GUIDE_COMMON_ERROR}`.

Comando para Victor:

```bash
cd innova-backend-serverless
pnpm prisma migrate dev --name v9_guides_pipeline --create-only
# revisar SQL (índices guides(course_id,status), guide_submissions(status), etc.)
pnpm prisma migrate dev
pnpm prisma generate
```

### S11.2 Config / env (Joi schema)

```env
SQS_GUIDE_INGEST_URL=
SQS_SOLUTION_GEN_URL=
SQS_SUBMISSION_GRADE_URL=
S3_GUIDES_BUCKET=            # PDFs + .tex + figuras (retención 1 año en uploads/)
S3_SUBMISSIONS_BUCKET=       # fotos alumnos, lifecycle 30 días (ADR-123)
GUIDES_PRESIGNED_PUT_TTL=600 # 10 min
GUIDES_PRESIGNED_GET_TTL=300 # 5 min
```

### S11.3 `SqsProducerService` — tipos de mensaje nuevos

```typescript
interface GuideIngestMessage   { guideId: string; sourcePdfKey: string; courseGradeLevel: number; traceId: string; }
interface SolutionGenMessage   { guideId: string; guideQuestionId?: string; traceId: string; } // sin questionId = toda la guía
interface SubmissionGradeMessage { guideSubmissionId: string; guideQuestionId: string; solutionVersion: number; photoKeys: string[]; traceId: string; }
```

Sin PII en bodies — solo UUIDs (regla §7 de CLAUDE.md).

### S11.4 Contrato extendido de `attempt-reprocess-queue` (retro-compatible)

Campos opcionales nuevos: `guide_submission_id`, `guide_question_id`, `alignment_summary { path, first_error_checkpoint, score_0_1 }`. Los mensajes del OCR loop v7 siguen funcionando sin cambios. Contrato completo en `.github/instructions/06c-guide-pipeline.md`.

### S11.5 Track paralelo v8

- Importar **lote 1** del catálogo (+~440 entries, `pnpm import:catalog`).
- +4 strategies: `FRACT_ADDSUB` (distinto denominador), `ALGEBRA_EXPR`, `ARITH_COUNT`, `ARITH_PLACE_VALUE` (scaffold con `scripts/scaffold-strategy.ts`).

**DoD S11:** migración limpia en staging, `docs/postgresql.dbml` actualizado, tests existentes verdes, codegen OK.

---

## Sprint S12 (M23/M24 — Módulo `guides`, lado profesor)

Nuevo módulo `src/modules/guides/` (controller + service + repository + DTOs tipados con class-validator).

### S12.1 Endpoints

```
POST   /guides                            { courseId, title, description?, dueAt? }
                                          → { guideId, presignedPutUrl }       # PUT del PDF a S3
POST   /guides/:id/ingest                 → 202; encola guide-ingest-queue (idempotente por status)
GET    /guides?courseId=&status=          → lista del profe (paginada)
GET    /guides/:id                        → status + preguntas + pauta current (preview wizard)
PATCH  /guides/:id                        { title?, description?, dueAt?, maxResubmissions?, showSolutionAfterGrade? }
PATCH  /guides/:id/questions/:qid         { statementLatex?, label?, points?, topicId?, status? }  # status: APPROVED|EXCLUDED
PATCH  /guides/:id/questions/:qid/solution { finalAnswer, stepsJson, ... }
                                          → crea GuideSolution version+1, source=TEACHER_EDITED, isCurrent=true
POST   /guides/:id/questions/:qid/regenerate-solution → re-encola solution-generation solo para esa pregunta
POST   /guides/:id/publish                → valida: toda pregunta APPROVED|EXCLUDED y topics confirmados (o flag "sin topic" explícito)
                                          → transacción: Exercise[] GUIDE_EXTRACTED + Assignment(kind=GUIDE) + AssignmentTarget[]
                                          → status=PUBLISHED, publishedAt=now()
DELETE /guides/:id                        → archive (directo si no PUBLISHED; con confirmación si PUBLISHED)
```

### S12.2 Reglas de negocio

- Guards: `@Roles('TEACHER')` + ownership vía `CourseTeacher` (el profe solo opera guías de sus cursos).
- Máquina de estados (ADR-119): transiciones válidas explícitas en el service; `EXTRACTION_FAILED`/`GENERATION_FAILED` permiten re-ingest.
- Publish (ADR-116): materializa `Exercise(topicId, source='GUIDE_EXTRACTED', irtA=1.0, irtB=0.0)` por pregunta APPROVED y setea `GuideQuestion.exerciseId`. Todo en una transacción Prisma.
- `TeacherAlert(GUIDE_READY_FOR_REVIEW)` la inserta el ai-engine al terminar la generación (ver addendum A7).

### S12.3 Track paralelo v8

Lote 2 catálogo (+~440) · +4 strategies: `ALGEBRA_QUAD`, `ALGEBRA_SYSTEM`, `FUNC_LINEAR`, `GEOM_AREA`.

**DoD S12:** flujo profe completo contra staging (upload → ingest → REVIEW → edición → publish) verificado vía REST (sin UI aún). Swagger actualizado.

---

## Sprint S13 (M24/M25 — Quiz alumno + submissions + cierre de corrección)

Nuevo módulo `src/modules/guide-submissions/`.

### S13.1 Endpoints alumno

```
GET    /student/guides                                   → guías PUBLISHED de mis cursos + progreso por guía
GET    /student/guides/:id                               → quiz view: preguntas (SIN pauta) + mis submissions/estados
POST   /student/guides/:id/questions/:qid/submissions    { photoCount: 1..3 }
                                                         → { submissionId, presignedPutUrls[] }
POST   /student/submissions/:id/complete                 → valida fotos en S3 → status=UPLOADED → encola submission-grade-queue
GET    /student/submissions/:id/status                   → { status, score?, isCorrect?, errorTag?, feedback? }   # polling 5s
GET    /student/guides/:id/results                       → resultados por pregunta (SOLO propios)
```

Reglas:
- Solo el dueño (`studentId` del JWT) ve/crea sus submissions. La pauta **nunca** se expone antes de `gradedAt` (y solo si `Guide.showSolutionAfterGrade=true`).
- Re-entrega: `attemptNumber+1` hasta `Guide.maxResubmissions` (default 2).
- Entrega fuera de plazo (`dueAt`): se acepta con flag `late=true` (visible al profe); configurable post-MVP.

### S13.2 Extensión `AttemptReprocessWorker` (pieza central ADR-120/121)

Cuando el mensaje trae `guide_submission_id`:

1. Carga `GuideSubmission` + `GuideQuestion` (+ `exerciseId`, `topicId`).
2. Crea `Attempt(inputMode='PHOTO_GUIDE', exerciseId, studentId, courseId, assignmentId)` + `AttemptStep[]` desde `latex_steps`.
3. Corre rule engine (factory por `topic.subdomain.code`) — si hay strategy, clasifica gratis.
4. `UNCLASSIFIED` → encola `llm-classify-queue` con `domain_id` (flujo v8 existente, sin cambios).
5. Actualiza BKT vía `MasteryService.updateBkt()` **solo si** la pregunta tiene `topicId` confirmado (ADR-122).
6. Cierra: `GuideSubmission { status=GRADED, attemptId, score, isCorrect, gradedAt }` — transaccional e idempotente por `traceId` (reintentos SQS no duplican Attempts).

Mensajes sin `guide_submission_id` siguen el flujo OCR v7 sin cambios.

### S13.3 Track paralelo v8

Lote 3 catálogo (+~440) · +4 strategies: `GEOM_PERIMETER`, `GEOM_SIMILARITY`, `FUNC_QUAD`, `SEQ_PATTERN`.

**DoD S13:** E2E en staging: submission con fotos sintéticas → GRADED con errorTagId y BKT actualizado. Test de idempotencia del worker. p95 medido (target <90s se valida en M25 con el grader real).

---

## Sprint S14 (M26 — Resultados por rol + heatmap completo)

### S14.1 Endpoints profesor

```
GET /teacher/guides/:id/results                          → matriz Student × Question { score, errorTagCode, status, late }
GET /teacher/guides/:id/summary                          → por pregunta: distribución top-N de error tags + % correctas
GET /teacher/courses                                     → cursos del profe (pendiente C2 v8)
GET /teacher/courses/:id/heatmap-by-unit                 → Student[] × Unit[] con p_known_avg (pendiente C2 v8)
GET /teacher/courses/:id/units/:unitId/topics-mastery    → drill-down a Topic (pendiente C2 v8)
GET /teacher/courses/:id/students/:studentId/overview    → mastery por unit + historial guías + errores frecuentes
```

### S14.2 Endpoints apoderado

```
GET /parent/children                                     → hijos vinculados (ParentLink confirmado)
GET /parent/children/:studentId/summary                  → mastery agregado por Unit (sin números crudos) + últimas guías + alertas suaves
POST /parent/devices                                     { expoPushToken }      # para push C14
```

### S14.3 Authz por rol (documentar en `src/shared/authz/README.md`)

| Rol | Alcance |
|---|---|
| STUDENT | solo `studentId === jwt.sub` (submissions, resultados, guías de sus cursos) |
| TEACHER | solo cursos vía `CourseTeacher` (guías, resultados, heatmap, alumnos) |
| PARENT | solo hijos con `ParentLink.confirmedAt != null` (resúmenes, sin fotos ni detalle de pasos) |
| ADMIN | scope organización |

Garantía en service layer (como hoy); RLS Supabase real solo para tablas leídas client-side vía supabase-js.

### S14.4 Track paralelo v8

Lote 4 catálogo (+~440) · +4 strategies: `TRIG_RATIO`, `LOG_PROPERTY`, `STAT_CENTRAL`, `DATA_GRAPH`.

**DoD S14:** los 9 endpoints responden con data real de staging; heatmap p95 <500ms con curso de 35 alumnos × 8 units (sin N+1).

---

## Sprint S15 (M27 — Hardening)

- Rate limiting: 10 guías/profe/día, 60 fotos/alumno/hora (Upstash o in-memory por Lambda).
- Auditoría N+1 en heatmap y results (Prisma `include` cuidadoso, queries agregadas SQL si hace falta — documentar query plan).
- Regenerar OpenAPI → Victor corre `pnpm run codegen:api-client` en innova-clients.
- Métricas CloudWatch: `guides.time_to_review`, `guides.ingest_failures`, `submissions.p95_grade_latency`, `submissions.unaligned_rate`, `submissions.dlq_count`.
- Soporte load test M27 (datos sintéticos: 35 alumnos × 20 preguntas).
- **Track paralelo v8 (cierre):** lote 5 catálogo → **≥2400 ACTIVE** · strategies restantes → **≥40 subdominios** con golden tests · `codegen:error-tags` final.

**DoD S15:** curso sintético corregido sin DLQ; killswitches probados; auditoría authz pasada; OpenAPI publicado.

---

## Resumen de archivos a tocar

**Crear:**

- `prisma/migrations/<timestamp>_v9_guides_pipeline/migration.sql` (la genera Victor)
- `src/modules/guides/**` (controller, service, repository, DTOs, máquina de estados)
- `src/modules/guide-submissions/**`
- `src/shared/authz/README.md`
- Strategies nuevas: `src/modules/attempts/rule-engine/strategies/*.strategy.ts` (~21 archivos más)

**Modificar:**

- `prisma/schema.prisma` (modelos §3 master plan)
- `src/infrastructure/workers/attempt-reprocess.worker.ts` (rama guide_submission_id)
- `src/shared/sqs/` (tipos de mensaje nuevos)
- `src/shared/config/` (Joi schema env nuevas)
- `serverless.yml` (colas/DLQs/bucket/permisos IAM)
- `docs/postgresql.dbml`
- `src/modules/attempts/rule-engine/factory.ts` (registro de strategies nuevas)
