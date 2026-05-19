# Architecture Decision Records (ADRs)

> Innova EdTech · post-pivot · 2026-04-29

Cada ADR documenta una decisión arquitectónica relevante con su contexto, opciones consideradas, decisión y trade-offs. Formato Michael Nygard simplificado.

---

## ADR-001: Pivot de FSLSM a detección de errores procedurales en matemáticas

**Estado:** Accepted (2026-04-29)
**Contexto:** El enfoque original (perfilamiento FSLSM via SVM/DQN sobre minijuegos) tenía 3 problemas críticos:
1. Supuesto pedagógico desacreditado (Pashler 2008, "Learning Styles: Concepts and Evidence").
2. Sin datos reales — bootstrap sintético con thresholds inventados → modelos overfitean al diseño, no al mundo.
3. Profesores chilenos en 20 entrevistas no compraron "perfilamiento cognitivo" — pidieron "saber QUÉ error está cometiendo el alumno antes de la prueba".

**Decisión:** Pivot a detección de errores procedurales en matemáticas (3°–6° básico) con stack híbrido Rules Engine + BKT + IRT + LLM async.

**Consecuencias:**
- ✅ Base científica sólida: Brown-VanLehn 1980 (rules), Corbett-Anderson 1995 (BKT), Lord 1980 (IRT) — todas con 30+ años de validación.
- ✅ Time to MVP: 4 días (vs ~10 semanas estimadas para FSLSM).
- ✅ Coste 5x más alto que estimación FSLSM optimista, pero 100x más confiable.
- ❌ Requiere descartar la mayoría del trabajo previo en `innova-ai-engine`.
- ❌ Cliente potencial debe entender "errores procedurales" — vocabulario nuevo a vender.

**Tradeoff aceptado:** descartar 6 semanas de trabajo previo a cambio de un producto vendible con base científica defendible.

---

## ADR-002: Drop Modal.com del MVP

**Estado:** Accepted (2026-04-29)
**Contexto:** Modal.com fue pieza central del stack original para training GPU on-demand de SVM/DQN. Post-pivot, ya no entrenamos modelos de deep learning.
**Opciones:**
- A) Mantener Modal por si lo necesitamos luego.
- B) Eliminar Modal del MVP, reintroducir solo si datos lo justifican post-pivot.
**Decisión:** B. BKT/IRT son closed-form (no GPU). LLM va vía Anthropic API (no hospedamos). No hay fundamentación técnica para Modal en MVP.
**Consecuencias:**
- ✅ Ahorro $0–30/mes.
- ✅ Una dependencia menos.
- ✅ Stack más simple para nuevos developers.
- ⏳ Ticket guardado: si acumulamos >100K attempts y queremos fine-tunear distil propio, Modal es la primera opción de exploración.

---

## ADR-003: Neon Postgres serverless > Aurora Serverless v2

**Estado:** Accepted (2026-04-29)
**Contexto:** Aurora Serverless v2 cuesta ~$36/mes mínimo (0.5 ACU sin pause). Neon free tier ofrece 0.5GB + 191 compute hours/mes con auto-suspend.
**Opciones:**
- A) Aurora Serverless v2 — más madurez, integración AWS.
- B) Neon Postgres — free tier, auto-suspend, pero cold-start ~3s.
- C) Self-host Postgres en EC2 — barato pero ops overhead.
**Decisión:** B (Neon) hasta superar 500 colegios o requerir SLA 99.95%. Migrar a Aurora cuando justifiquen costos.
**Consecuencias:**
- ✅ $0 fixed durante piloto + early growth.
- ✅ Branching de DB para staging gratis.
- ❌ Cold-start ~3s afecta primer attempt del día. Mitigado: warmer Lambda cron cada 4 min en horas pico.

---

## ADR-004: Gemini 2.0 Flash > Mathpix > Claude Vision para OCR

**Estado:** Accepted (2026-04-29)
**Contexto:** Necesitamos OCR de matemáticas manuscritas (cuadernos escolares). Mathpix es state-of-art pero requiere $19.99 setup fee + $29 deposit — incompatible con MVP lean.
**Opciones evaluadas:**

| Opción | Costo piloto | Costo escala 1K | Accuracy | Setup |
|--------|--------------|------------------|----------|-------|
| Mathpix Convert | $48.99 setup + ~$200/mes | $200/mes | Excelente | Requiere business account |
| AWS Textract | $5/mes | $1000/mes | Pobre en math | Inmediato |
| Claude Haiku Vision | $5/mes | $1000/mes | Muy buena | Inmediato |
| **Gemini 2.0 Flash** | $0 (free tier) | $99/mes | Buena | Inmediato |
| LaTeX-OCR self-hosted | $30/mes EC2 | $30/mes | Buena | GPU req'd |

**Decisión:** Gemini 2.0 Flash como OCR primario + `MathOCRPort` adapter para fallback opcional a Claude Vision o LaTeX-OCR self-hosted post-pivot.

**Consecuencias:**
- ✅ Free tier cubre piloto completo a $0.
- ✅ 10x más barato que Claude Vision a escala.
- ✅ Adapter pattern preserva opcionalidad arquitectónica.
- ❌ Dependencia de Google Cloud (single-vendor risk). Mitigado: adapter swappeable en horas.
- ❌ Free tier limit (15 RPM, 1M TPM): puede saturarse a >50 alumnos concurrentes. Mitigado: paid tier sigue siendo el más barato.

---

## ADR-005: LLM async batched > LLM real-time per attempt

**Estado:** Accepted (2026-04-29)
**Contexto:** El LLM (Capa 4) clasifica los attempts que el rule engine deja como UNCLASSIFIED (~15-30%). Latencia y costo varían dramáticamente según approach.
**Opciones:**
- A) LLM síncrono per attempt: 800ms latencia, $0.40/1K attempts (sin caching).
- B) LLM batch async (20× con prompt caching): 5min latencia, $0.06/1K attempts.
- C) Self-hosted small model (Phi-3.5, Llama 8B): 2s latencia, $0.10/1K, 75% accuracy (peor).
**Decisión:** B. La latencia 5min es tolerable porque el profesor consulta el dashboard al día siguiente, no en tiempo real. Caching agresivo + batching reduce 7x el costo.
**Consecuencias:**
- ✅ 7x más barato que A.
- ✅ Coste viable a escala.
- ❌ Profe NO ve el error específico inmediatamente — solo "está mal". Mitigado: rule engine cubre 70-85% real-time; el 15-30% restante aparece en dashboard async.

---

## ADR-006: BKT closed-form > Deep Knowledge Tracing (DKT/LSTM)

**Estado:** Accepted (2026-04-29)
**Contexto:** BKT (1995) y DKT (Piech 2015) son los dos approaches dominantes para mastery tracking.
**Opciones:**
- A) BKT (4 parámetros, closed-form bayesiano).
- B) DKT (LSTM neural).
- C) BKT-DKT híbrido (Yudelson 2013).
**Decisión:** A.
**Consecuencias:**
- ✅ BKT funciona con 50 attempts por skill (DKT necesita 100K+).
- ✅ Interpretable (4 parámetros con semántica). DKT es black-box.
- ✅ Update closed-form: <5ms en Node.js Lambda.
- ❌ Asume independencia entre skills. Mitigado: prerequisitos modelados explícitamente en `Skill.prerequisites`.
- ⏳ Migrar a BKT-DKT híbrido o DKT puro post-pivot cuando datos lo justifiquen.

---

## ADR-007: Ruta de input dual: digital + photo upload

**Estado:** Accepted (2026-04-29)
**Contexto:** Los niños chilenos hacen matemáticas a mano en cuadernos. Forzar digital input pierde adopción. Pero permitir SOLO upload de fotos pierde la inmediatez del feedback.
**Decisión:** Soportar ambos modos. `apps/practice` ofrece dos botones: "Resolver aquí" (digital) o "Subir foto" (OCR). El backend procesa ambos por el mismo pipeline post-rawSteps.
**Consecuencias:**
- ✅ Adopción mayor — el alumno elige el modo cómodo.
- ✅ El profe puede pedir "resuelve esto en cuaderno y sube foto" — preserva escritura manual.
- ❌ Mantener dos paths frontend duplica QA. Mitigado: backend único, telemetry packages compartidos.
- ❌ OCR latencia ~5s vs digital instantáneo. Aceptable porque feedback async via dashboard.

---

## ADR-008: Trunk-based con 2 reviewers > Gitflow

**Estado:** Accepted (2026-04-29)
**Contexto:** El equipo es de 5 personas con plazos rígidos. Gitflow (develop/release/feature/hotfix) es overkill.
**Decisión:** Trunk-based development sobre `main` protegido. Branches `feat/<issue>-<short-desc>` cortas, PRs <500 líneas, squash-merge, 2 reviewers obligatorios.
**Consecuencias:**
- ✅ Simplicidad operativa.
- ✅ Detección temprana de conflictos.
- ✅ Deploy continuo a producción desde main.
- ❌ Requiere disciplina en feature flags para work-in-progress. Mitigado: en MVP no necesitamos feature flags; todo lo que se mergea es shippeable.

---

## ADR-009: Anthropic Claude Haiku 4.5 (no Sonnet/Opus) para classification

**Estado:** Accepted (2026-04-29)
**Contexto:** Tres tiers Anthropic: Haiku ($1/M input cached, $4/M output), Sonnet ($3/$15), Opus ($15/$75).
**Decisión:** Claude Haiku 4.5 como default. Sonnet 4.6 como fallback para attempts donde Haiku confidence <0.7 (~5% del volumen).
**Consecuencias:**
- ✅ 15x más barato que Sonnet, 75x más barato que Opus.
- ✅ Latencia <2s.
- ❌ Accuracy ~5% inferior a Sonnet (esperado). Mitigado por fallback escalation.
- ⏳ Re-evaluar cada 3 meses cuando Anthropic baja precios o lanza modelos nuevos.

---

## ADR-010: Idioma — código en inglés, docs en español, UI en español Chile

**Estado:** Accepted (2026-04-29)
**Contexto:** Equipo es chileno, cliente es chileno. Pero código eventualmente expuesto a developers internacionales (incubadora, contrataciones).
**Decisión:** Código + commit messages + variables + APIs en inglés. Documentación interna + READMEs (en español-Chile, excepto los repos con `README.md` en inglés para discoverability internacional). UI en es-CL primary, i18n keys preparadas para expansión.
**Consecuencias:**
- ✅ Código auditable por reviewers globales.
- ✅ Onboarding internacional posible.
- ❌ Doble idioma en repos (commits/code en inglés, docs en español). Aceptable.

---

# ADRs v7 — refactor estructural (2026-05-17)

> Estos ADR son **vigentes** y supersede cualquier decisión previa en conflicto. Referencia: `docs/MASTER_PLAN_v7.md`.

---

## ADR-101: Supabase Auth reemplaza Cognito y JWT custom

**Estado:** Accepted (2026-05-17)
**Contexto:** El prototipo usaba JWT custom con tokens en localStorage (XSS-vulnerable). Docs hablaban de Cognito pero el código nunca lo integró. Mantener auth artesanal nos cuesta tiempo y bloquea features como SSO con Google/Microsoft que los colegios piden.
**Decisión:** Supabase Auth para los 3 clientes (web + mobile-student + mobile-parent). El backend NestJS valida JWT (RS256) contra el JWKS endpoint de Supabase (`https://<project>.supabase.co/auth/v1/.well-known/jwks.json`). Rol del usuario en `app_metadata.role` (custom claim seteado por Postgres trigger en signup). `User` local se obtiene via `prisma.user.upsert({ where: { supabaseUid } })` — sin auto-link por email para usuarios pre-existentes (no hay producción). Linking por email aplica sólo para roster sync de Google Classroom (ADR-108) vía `ExternalIdMap`.
**Consecuencias:**
- ✅ Cookies httpOnly nativo con `@supabase/ssr` en Next.js. No más localStorage tokens.
- ✅ Google/Microsoft OAuth out-of-the-box → necesario para integración SIS/LMS (ADR-108).
- ✅ Auth + DB + RLS en un solo proveedor reduce superficie operativa.
- ❌ Vendor lock-in moderado: `auth.users` vive en Supabase. Mitigado porque la entidad de negocio es `User` en nuestro Postgres (Supabase es sólo identity provider).
- ✅ Cutover en un único PR (sin coexistencia con Cognito) porque no hay usuarios reales. Sin fallback HS256 — JWKS RS256 directo.

---

## ADR-102: Supabase Postgres reemplaza Neon

**Estado:** Accepted (2026-05-17)
**Contexto:** Neon nos servía bien (branching para CI, pgbouncer). Pero al adoptar Supabase Auth (ADR-101), tener la DB de aplicación en el mismo proyecto Supabase nos da RLS multi-tenant nativo, pgbouncer transaction mode incluido, y un solo dashboard para ops.
**Decisión:** Apuntar `DATABASE_URL` (backend + ai-engine) a Supabase Postgres desde M8, en el mismo PR que el cutover de auth. Sin `pg_dump` desde Neon: no hay datos importantes que preservar. `pnpm prisma migrate deploy` desde cero contra Supabase, seeds vía `prisma db seed`. Proyecto Neon se elimina en el mismo PR. En dev seguimos con Postgres en docker-compose (sin Supabase local en MVP). RLS se enciende en M12 una vez los clientes consumen Supabase Auth.
**Consecuencias:**
- ✅ RLS aplicable sobre tablas user-facing usando `auth.uid()` desde el JWT Supabase.
- ✅ Backups diarios y point-in-time recovery incluidos.
- ✅ Costo más predecible (caps duros del free tier vs. pago-por-uso de Neon).
- ✅ Cutover trivial al no haber datos productivos (un solo PR, cero downtime relevante).
- ❌ Perdemos el branching DB de Neon. Mitigación: usar un segundo proyecto Supabase como staging si CI lo requiere.

---

## ADR-103: Una sola Next.js app con route groups (no 3 apps separadas)

**Estado:** Accepted (2026-05-17)
**Contexto:** v6 tenía 3 apps Next.js (`practice`, `teacher`, `parent`) duplicando `AuthPage`, `tsconfig`, `next.config`, design tokens. Cada deploy en Vercel era un proyecto distinto. No compartían sesión. ~60% del código necesita reescritura.
**Decisión:** Una sola app `apps/web` Next.js 14 App Router con route groups `(student)`, `(teacher)`, `(parent)`, `(marketing)`, `(auth)`. Middleware role-based maneja redirects. Subdominios viejos `practice|profe|padres.superprofes.app` reciben redirect 301 a `app.superprofes.app/...`.
**Consecuencias:**
- ✅ Una sola sesión Supabase, un solo deploy Vercel, un solo CI.
- ✅ Design system real consumido como package, no copiado a `public/` de cada app.
- ✅ Onboarding simplificado: un alumno que cambia de rol (caso "alumno también monitor de un curso") no requiere re-login en otro subdominio.
- ❌ Bundle más grande para usuarios que sólo usan una sección. Mitigado por route group code-splitting nativo de App Router.
- ❌ Rate-limiting global por dominio (no por rol) — aceptable en MVP.

---

## ADR-104: Mobile Expo separado (student / parent)

**Estado:** Accepted (2026-05-17)
**Contexto:** Profesores trabajan desde notebook/PC, no necesitan app nativa. Alumnos necesitan cámara para OCR de pasos manuscritos. Apoderados consumen push notifications de progreso. Compartir un único Expo entre student/parent agrega complejidad sin valor.
**Decisión:** Dos apps Expo independientes (`apps/mobile-student`, `apps/mobile-parent`), cada una con su build en EAS, comparten `packages/api-client`, `packages/supabase`, `packages/ui` (RN-compatible). No habrá Expo para teacher en MVP.
**Consecuencias:**
- ✅ Cada app optimiza su UX nativa sin if/else por rol.
- ✅ Push notifications segmentadas por audiencia.
- ❌ 2 builds EAS = 2× build minutes. Mitigado por triggers manuales (tag `mobile-v*`), no en cada merge.
- ⏳ Decisión Apple Developer Account ($99/año) pendiente — sin él, MVP mobile es Android-only.

---

## ADR-105: Refactor modelo de datos a Subject/Curriculum/Unit/Topic/Enrollment/Exercise/Step

**Estado:** Accepted (2026-05-17)
**Contexto:** Schema v6 (`Skill / Item / Attempt / StudentSkillMastery / Classroom`) modela bien intentos de items individuales pero **no** modela el flujo pedagógico Profesor → Curso → Unidades curriculares → Temas → Ejercicios → Pasos. No escala a colegios completos ni a multi-materia.
**Decisión:** Migración Prisma "v7-domain-model" (M10) que introduce `Organization`, `Subject`, `Curriculum`, `Unit`, `Topic`, `Enrollment`, `Exercise` (reemplaza `Item`, distingue `source: SYSTEM | TEACHER_AUTHORED | LLM_GENERATED`), `Assignment` (reemplaza stub `PracticeAssignment`), `AttemptStep` (reemplaza `Attempt.rawSteps Json`), `StudentTopicMastery` (reemplaza `StudentSkillMastery`), `ErrorTag` (single source of truth de tipos de error). Detalle en `innova-backend-serverless/docs/postgresql.dbml` v7.1.
**Consecuencias:**
- ✅ Soporta multi-materia (Subject) y multi-grado (Unit.grade_level) sin nuevos refactors.
- ✅ Análisis procedural fino via `AttemptStep` (paso a paso).
- ✅ Curriculum portable (DBML compatible con Lengua/Ciencias).
- ❌ Migración compleja con backfill de `Attempt.rawSteps Json` → `AttemptStep[]`. Mitigado por script Node validado en staging antes de prod.
- ❌ DBML doc se vuelve fuente de verdad — disciplina necesaria para mantener paridad con Prisma.

---

## ADR-106: AI engine — cerrar Alert Generator + OCR feedback loop antes de pilotear

**Estado:** Accepted (2026-05-17)
**Contexto:** El drawio `03-dual-ai-pipeline.drawio` define 4 layers (Online BKT, Nightly calibration, On-demand Recommender, Hourly Alerts). Hoy faltan el Alert Generator (Layer 4) y el cierre del loop OCR → Attempts. Sin Alert Generator el profe no recibe feedback; sin el loop OCR, las fotos de los alumnos no entran al pipeline real.
**Decisión:** M11 entrega ambos: `src/pipeline/hourly_alerts.py` (cron horario, 4 tipos de alerta con dedup diario) y modificación de `src/pipeline/ocr_worker.py` para publicar a SQS `attempt-reprocess-queue` que el backend consume y re-dispatcha al Rule Engine. Recommender (Fisher info) vive en backend `AssignmentService`, no en ai-engine.
**Consecuencias:**
- ✅ Demo end-to-end completa: alumno saca foto → en <2 min está clasificada y mastery actualizada.
- ✅ Profe recibe alertas relevantes en <1h sin tener que pollear.
- ❌ Costos Lambda crecen (Alert Generator corre 24× al día). Aceptable: estimado <$1/mes con 1000 alumnos.

---

## ADR-107: Smoke testing — Playwright MCP + screenshots vs Design System

**Estado:** Accepted (2026-05-17)
**Contexto:** "AI slop" en el prototipo en parte por falta de feedback visual automatizado: agentes generaban UI sin validar que se viera como el design system. El Design System tiene `SuperProfes-Design-System/preview/*.html` ya curado por Victor.
**Decisión:** Cada PR de UI corre Playwright MCP sobre el flujo afectado, captura screenshot, compara contra `SuperProfes-Design-System/preview/<componente>.png` con tolerancia 5% (bajar a 2% post-estabilización). Los baselines se actualizan sólo en PRs etiquetadas `design-system-update`. Detalle en `innova-clients/docs/SMOKE_TESTING.md`.
**Consecuencias:**
- ✅ Drift visual detectado en CI antes de merge.
- ✅ Agentes (incluido Claude Code) tienen un check objetivo: "¿se parece al preview?".
- ❌ Tests visuales son frágiles con animaciones — mitigar con `prefersReducedMotion` en tests.
- ❌ Browsers Playwright pesados en cache — usar `actions/cache` para `~/.cache/ms-playwright`.

---

## ADR-108: Integraciones con sistemas de colegio (Google Classroom, MS Teams Edu, CSV)

**Estado:** Accepted (2026-05-17)
**Contexto:** Colegios reales tienen 200-1000 alumnos. Si el profe debe crear cada alumno y cada curso a mano, el onboarding muere. Los colegios chilenos usan principalmente Google Classroom (público), Microsoft Teams Education (particulares) o sistemas locales (Napsis, Colegium). Internacionalmente: Clever y ClassLink son los dos SIS dominantes.
**Decisión:** Adapters por proveedor en `innova-backend-serverless/src/modules/integrations/<provider>/`, todos implementan `RosterSyncPort`. v7 implementa Google Classroom + CSV bulk import. MS Teams Edu en M17 post-piloto. Clever/ClassLink documentamos el port pero no implementamos (no es mercado MVP). Modelo de datos extendido con `Organization`, `SchoolIntegration` (config + tokens cifrados via AWS KMS), `ExternalIdMap` (puente para re-sync idempotente). SSO con Google/Microsoft via Supabase Auth (ADR-101) — cuando alumno entra por SSO, backend usa `ExternalIdMap` para ligar al Student preexistente del roster sync.
**Consecuencias:**
- ✅ Onboarding de un colegio de 500 alumnos toma minutos (1 OAuth flow + 1 sync), no semanas.
- ✅ Datos del alumno minimizados al sync (email + nombre + curso — nunca foto/RUT/dirección).
- ✅ `ExternalIdMap` con `deletedAt` soft-delete soporta correcciones del upstream sin perder historial.
- ❌ Dependencia de rate limits externos (Google Classroom 50 req/s) — mitigada con queueing y backoff.
- ❌ MS Teams Education requiere tenant verification que puede tomar semanas — anotado como riesgo en master plan §14.6.
- ⏳ Cumplimiento Ley 21.180 (Chile) y COPPA: consentimiento del colegio cubre el sync; consentimiento individual del apoderado sólo si onboardeamos sin SIS (caso CSV manual con datos no provenientes de plataforma escolar oficial).
