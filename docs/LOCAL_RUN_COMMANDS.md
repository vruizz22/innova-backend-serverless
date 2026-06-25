# Runbook local — comandos exactos por repo (los corres tú · regla §0 WSL2)

> Guía operativa para correr y testear **los 3 repos** en local: tests + levantar
> front + back + ai-engine + Supabase para usar la app a mano. Complemento de
> `docs/LOCAL_TESTING.md` (que explica el *por qué*); esto es el *cómo*, copy-paste.
>
> Rutas asumidas: `~/repositorios/innova/{innova-backend-serverless,innova-ai-engine,innova-clients}`.
> Estado verificado 2026-06-15: back **399** unit (50 suites) + 11 e2e · cov **87.3%** · ai **159** (cov 82%) · clients 25 + lint 8/8.

---

## 0. Mapa de puertos

| Servicio                  | Puerto | Cómo se levanta                          |
|---------------------------|--------|------------------------------------------|
| Backend NestJS (API)      | 3000   | `pnpm start:dev`                         |
| Front web (Next.js)       | 3005   | `pnpm dev:web`                           |
| Landing (Astro)           | 3004   | `pnpm dev:landing`                       |
| ai-engine health server   | 3010   | `uv run python scripts/local_health_server.py` |
| **Postgres = la app DB**  | 54322  | lo provee **Supabase** (`supabase start`) |
| MongoDB (telemetría)      | 27017  | `docker compose up -d mongodb`           |
| Supabase API (Auth)       | 54321  | `pnpm dlx supabase@latest start`         |
| Supabase Studio           | 54323  | (incluido en `supabase start`)           |
| LocalStack (SQS/S3, opc.) | 4566   | `docker compose up -d localstack`        |

> ⚠️ Ya **no** hay Postgres en docker-compose (el `:5433` legacy se retiró). La DB de la app
> es el Postgres que levanta Supabase en `:54322`. `docker-compose` solo aporta Mongo y LocalStack.

---

## Credenciales y usuarios demo (local)

### Usuarios demo (creados por `seed.ts` en Postgres + `seed:auth` en Supabase Auth)

Todos comparten la password **`Demo1234!`** (es el `SEED_DEMO_PASSWORD` que le pasas al `seed:auth`).
Los UIDs son deterministas (fuente única: `prisma/demo-identities.ts`) → el `supabase_uid` en
Postgres = el `id` en Supabase Auth, por eso el login calza end-to-end.

| Email                  | Rol     | Nombre          | Supabase UID (sufijo) | Datos sembrados para testear |
|------------------------|---------|-----------------|-----------------------|------------------------------|
| `teacher@innova.demo`  | teacher | Prof. Demo      | `…0001`               | LEAD del curso **"4° A · Matemáticas"** (grade 4, 2026); 2 `TeacherAlert` sin resolver |
| `student1@innova.demo` | student | Diego Vega      | `…0011`               | mastery **baja** sub-borrow (0.22); 2 attempts con error borrow + 1 correcto; alerta AT_RISK HIGH |
| `student2@innova.demo` | student | Valentina Reyes | `…0012`               | mastery **alta** (0.82 / 0.88) → verde en el heatmap |
| `student3@innova.demo` | student | Matías Torres   | `…0013`               | mastery media (0.68 / 0.45) |
| `student4@innova.demo` | student | Camila Soto     | `…0014`               | mastery media (0.53 / 0.60) |
| `student5@innova.demo` | student | Benjamín Muñoz  | `…0015`               | mastery baja (0.35 sub-borrow, 0.29 fracciones); 1 attempt con error |
| `parent@innova.demo`   | parent  | Apoderado Demo  | `…0021`               | vinculado a **Diego Vega** (relación PADRE) |

> Los 5 estudiantes están inscritos (`Enrollment ACTIVE`) en el curso "4° A · Matemáticas".
> Hay 8 ejercicios SYSTEM de sustracción con préstamo (`53-26`, `72-48`, `300-47`, …) listos para resolver.

### Claves / secrets (dónde viven — no se hardcodean)

| Qué | Variable · archivo | Valor local |
|-----|--------------------|-------------|
| Supabase API (Auth/REST) | `SUPABASE_URL` (back) · `NEXT_PUBLIC_SUPABASE_URL` (clients) | `http://127.0.0.1:54321` |
| anon / publishable key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clients) | `sb_publishable_…` — lo imprime `supabase start` / `supabase status` |
| service_role / secret key | `SUPABASE_SERVICE_ROLE_KEY` (back) | `sb_secret_…` — idem · **server-only, jamás con prefijo `NEXT_PUBLIC_`** |
| Postgres (la app DB) | `DATABASE_URL` (back + ai) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| MongoDB (telemetría) | `MONGODB_URI` (back + ai) | `mongodb://root:…@localhost:27017/…?authSource=admin` |
| Anthropic (A7/A8) | `ANTHROPIC_API_KEY` (ai) | `sk-ant-…` — **necesita funds** para el pipeline real |
| Gemini (A6 + OCR) | `GEMINI_API_KEY` + `GEMINI_MODEL` (ai) | `AIza…` + `gemini-2.5-flash` |
| password demo | `SEED_DEMO_PASSWORD` (inline al `seed:auth`) | `Demo1234!` |

> Las claves `sb_publishable_…` / `sb_secret_…` salen del output de `supabase start` (o `supabase status`)
> y ya están copiadas en los `.env` (gitignored). Para reimprimirlas: `pnpm dlx supabase@latest status`.

### UIs de apoyo (navegador)

| UI | URL | Para qué |
|----|-----|----------|
| Supabase Studio | `http://127.0.0.1:54323` | inspeccionar tablas, usuarios Auth, correr SQL |
| Inbucket (correos) | `http://127.0.0.1:54324` | ver emails de confirmación/reset que "enviaría" Auth |
| Swagger API backend | `http://localhost:3000/api` | explorar/probar endpoints REST |

---

## 1. Infra base (una vez por sesión)

La **DB de la app = Postgres de Supabase** (:54322). docker-compose ahora SOLO aporta
MongoDB. Orden: Mongo (docker) + Supabase (db+auth) → migrar/seed contra Supabase.

```bash
# 1) MongoDB (telemetría) — lo único que se necesita de docker-compose
cd ~/repositorios/innova/innova-backend-serverless
docker compose up -d mongodb         # (el postgres del compose quedó sin uso)

# 2) Supabase = Postgres (:54322) + Auth (:54321)
cd ~/repositorios/innova/innova-clients
pnpm dlx supabase@latest start --ignore-health-check

# 3) Crear/poblar las tablas de la app EN el Postgres de Supabase
cd ~/repositorios/innova/innova-backend-serverless
pnpm prisma migrate deploy           # aplica las 9 migraciones en :54322
pnpm prisma db seed                  # currículo + dominios + error tags + demo
```

> Cada `supabase start` recrea su Postgres (sobre todo tras `supabase stop --no-backup`):
> re-corre `migrate deploy && db seed`. El `pnpm test:e2e` del backend ahora también
> necesita ese Postgres (Supabase :54322) arriba + migrado (antes usaba el docker :5433, ya retirado).

### Si `migrate deploy` falla con `P3018` en `rls_policies`

La migración crea las políticas RLS **solo** si existe el schema `auth` (en Supabase sí; en
CI/docker vanilla se salta). Eso destapó 3 bugs que ya están corregidos en el `migration.sql`
(`auth.uid()::text`, función `RETURNS text`, y `auth.jwt()` → `current_setting('request.jwt.claims')`).
Si tu DB quedó con la migración **fallida a medias**, recupérala marcándola como revertida y
re-aplicando (NO uses `migrate reset` contra Supabase — dropearía objetos):

```bash
cd ~/repositorios/innova/innova-backend-serverless
pnpm prisma migrate resolve --rolled-back 20260518200000_rls_policies
pnpm prisma migrate deploy && pnpm prisma db seed
```

### Si `migrate` falla con `FATAL: the database system is not accepting connections` / `Hot standby mode is disabled`

NO es un bug de la migración: el Postgres de Supabase está **en recovery** (recién
(re)arrancó y reproduce WAL — común en WSL2). Espera a que acepte conexiones y reintenta:

```bash
# espera a que el Postgres de Supabase esté listo (Ctrl-C cuando diga "accepting connections")
until docker exec supabase_db_innova-clients pg_isready -U postgres >/dev/null 2>&1; do \
  echo "Postgres en recovery, esperando..."; sleep 2; done; echo "✅ listo"
# luego re-aplica (resolve por si quedó marcada como fallida) + deploy + seed
cd ~/repositorios/innova/innova-backend-serverless
pnpm prisma migrate resolve --rolled-back 20260518200000_rls_policies
pnpm prisma migrate deploy && pnpm prisma db seed
```

> Si tras ~2 min no acepta conexiones, reinícialo limpio: `supabase stop --no-backup &&
> supabase start --ignore-health-check` (recrea el Postgres → vuelve a `migrate deploy && db seed`).

### Si `seed:auth` da `fetch failed` o el JWKS sale vacío

Síntoma: `docker ps --filter name=supabase` muestra **solo** `supabase_db_innova-clients` (el Postgres),
sin contenedores `supabase_auth_…` / `supabase_kong_…`. Es decir: **el stack subió a medias — solo la DB,
no el Auth (:54321)**. Por eso `seed:auth` no puede conectar (`fetch failed`) y el JWKS responde vacío
(conexión rechazada). NO es problema de claves ni de Anthropic.

```bash
# 1) Diagnóstico: ¿qué hay arriba?
docker ps --filter name=supabase --format "{{.Names}}  {{.Status}}"
curl -s -o /dev/null -w "Auth :54321 → HTTP %{http_code}\n" http://127.0.0.1:54321/auth/v1/health

# 2) Levantar el stack COMPLETO (no borra la DB ya migrada; usa backup al parar).
cd ~/repositorios/innova/innova-clients
pnpm dlx supabase@latest start --ignore-health-check
#   Si se queja de estado inconsistente: pnpm dlx supabase@latest stop  (con backup) y repite el start.

# 3) Verifica que ahora SÍ están Auth + Kong + REST arriba:
docker ps --filter name=supabase --format "{{.Names}}  {{.Status}}"   # deben aparecer ~8-10 contenedores
curl -s http://127.0.0.1:54321/auth/v1/health                          # {"...":"...","name":"GoTrue",...}
```

### Login real (navegador): clave de firma asimétrica ES256

El backend (`SupabaseJwtStrategy`) solo valida JWT **ES256/RS256** (vía JWKS). Supabase local firma
**HS256 por defecto** → JWKS vacío → el login del navegador da 401. Fix (ya dejado listo en el repo):

- `innova-clients/supabase/signing_keys.json` — clave ES256 ya generada (gitignored), **como array** `[ {…} ]`.
- `innova-clients/supabase/config.toml` — `signing_keys_path = "./signing_keys.json"` ya **descomentado**.

> ⚠️ El CLI exige que `signing_keys.json` sea un **array** de JWK. `supabase gen signing-key` emite un
> **objeto** suelto → si lo usas tal cual, `supabase start/stop` falla con
> `cannot unmarshal object into Go value of type []config.JWK`. Hay que envolverlo en `[ ]`.

Si tuvieras que regenerar la clave desde cero:

```bash
cd ~/repositorios/innova/innova-clients
pnpm dlx supabase@latest gen signing-key --algorithm ES256 > supabase/signing_keys.json
# envolver el objeto en un array (obligatorio para el CLI):
python3 -c "import json;k=json.load(open('supabase/signing_keys.json'));open('supabase/signing_keys.json','w').write(json.dumps([k] if isinstance(k,dict) else k))"
```

Tras eso hay que **reiniciar** Supabase para que tome la clave, y verificar que el JWKS ya expone ES256:

```bash
cd ~/repositorios/innova/innova-clients
pnpm dlx supabase@latest stop && pnpm dlx supabase@latest start --ignore-health-check
curl -s http://127.0.0.1:54321/auth/v1/.well-known/jwks.json    # debe traer {"keys":[{"alg":"ES256",...}]}
```

### Sembrar los usuarios demo en Supabase Auth

Con el stack completo arriba (y el JWKS ya ES256), siembra los 7 usuarios demo. `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` salen del `.env` del backend; solo agregas el guard + la password:

```bash
cd ~/repositorios/innova/innova-backend-serverless
ALLOW_SEED=1 SEED_DEMO_PASSWORD='Demo1234!' pnpm seed:auth   # idempotente (crea o actualiza)
#   Esperado: "🎉 Done — created: 7, updated: 0, conflicts: 0."  (o updated: 7 si re-corres)
```

---

## 2. Backend (`innova-backend-serverless`)

```bash
cd ~/repositorios/innova/innova-backend-serverless

# --- preparar DB ---
pnpm install                         # si cambió package.json
pnpm prisma generate                 # genera el Prisma Client
pnpm prisma migrate deploy           # aplica las 9 migraciones (incl. v9_guides_pipeline)
pnpm prisma db seed                  # currículo + 17 dominios + error tags + demo

# --- tests / calidad ---
pnpm test                            # 50 suites / 399 tests unit
pnpm test:cov                        # con cobertura — gate 75/75/75/60 → 87.3% (EXIT 0)
pnpm test:e2e                        # 2 suites / 11 tests (app + auth). Necesita la DB migrada+seed.
pnpm lint                            # eslint --fix
pnpm build                           # nest build (compila a dist/)

# --- levantar la API ---
pnpm start:dev                       # http://localhost:3000  ·  Swagger: http://localhost:3000/api
```

> `test:e2e` mockea `jwks-rsa` y firma RS256 en memoria → **no** necesita Supabase **Auth**/JWKS.
> Pero **sí** pega a la DB real, que hoy es el Postgres de Supabase (:54322): necesita
> `supabase start` + `migrate deploy` + `db seed` (paso 1) o falla con "table public.users does not exist".

---

## 3. ai-engine (`innova-ai-engine`)

ai-engine **no es un server**: cada worker es un **handler Lambda** disparado por
S3 / SQS / EventBridge. En local se ejecuta de 3 formas (de menor a mayor fidelidad).

```bash
cd ~/repositorios/innova/innova-ai-engine

# --- preparar entorno ---
uv sync --all-extras                 # instala deps del lockfile en .venv

# --- calidad / tests (NO gastan API; todo mockeado) ---
uv run ruff check src/ tests/        # lint → "All checks passed!"
uv run pyright src/                  # types → "0 errors"
uv run pytest -k "not smoke" -q      # 159 tests sin llamadas reales
uv run pytest --cov=src --cov-fail-under=75   # gate ≥75% → 82% (EXIT 0)
# uv run pytest -m smoke             # = 1 SKIPPED (no es fallo): el smoke está apagado por diseño.
RUN_LIVE_GEMINI_SMOKE=1 uv run pytest -m smoke  # corre el test real (golpea Gemini free tier).
```

> El `s`/`1 skipped` de `pytest -m smoke` **no es un error**: `test_gemini_live_smoke` tiene
> `@skipif(RUN_LIVE_GEMINI_SMOKE != "1")` para no quemar API en corridas normales. Es Gemini,
> nada que ver con tus funds de Anthropic (esos solo importan en el pipeline async §3c).

> ⚠️ **Gemini free tier puede dar `429 RESOURCE_EXHAUSTED ... limit: 0`**: NO es un rate limit
> transitorio (reintentar no ayuda) — significa que el free tier de ESE proyecto/modelo te da
> 0 cuota. Gemini se usa en **A6 (precheck de PDF)** y en OCR; A7/A8 usan Anthropic, no Gemini.
> Soluciones: (1) **habilitar billing** en el proyecto Google Cloud (Gemini Flash es centavos;
> testear el pipeline < US$1; es lo que usa prod) — recomendado; o (2) probar otro modelo con
> `GEMINI_MODEL=` en el `.env` del ai-engine (ya es configurable, p.ej. `gemini-2.5-flash`),
> aunque si el `limit:0` es a nivel proyecto no cambiará.

### 3a. Modo "vivo" mínimo — health server

```bash
uv run python scripts/local_health_server.py    # http://127.0.0.1:3010/health → {"status":"ok"}
```

### 3b. Invocar un worker on-demand (simula su trigger) — lo más simple

```bash
cd ~/repositorios/innova/innova-ai-engine

# Pipeline v9 — A6 ingesta de guía (simula mensaje SQS guide-ingest)
uv run python -c "
from src.pipeline.guide_ingest_worker import handler
event = {'Records': [{'body': '{\"guide_id\":\"<GUIDE_ID>\",\"source_pdf_key\":\"guides/uploads/<file>.pdf\",\"course_grade_level\":4,\"trace_id\":\"t1\"}'}]}
print(handler(event, None))
"

# Pipeline v9 — A7 generación de pauta
uv run python -c "
from src.pipeline.solution_generator import handler
event = {'Records': [{'body': '{\"guide_id\":\"<GUIDE_ID>\",\"guide_question_id\":\"<Q_ID>\",\"trace_id\":\"t1\"}'}]}
print(handler(event, None))
"

# Pipeline v9 — A8 corrección de fotos
uv run python -c "
from src.pipeline.submission_grader import handler
event = {'Records': [{'body': '{\"guide_submission_id\":\"<SUB_ID>\",\"guide_question_id\":\"<Q_ID>\",\"solution_version\":1,\"photo_keys\":[\"submissions/<id>.jpg\"],\"trace_id\":\"t1\"}'}]}
print(handler(event, None))
"

# Clasificación de errores (batch SQS) / alertas horarias / calibración nocturna
uv run python -c "from src.pipeline.llm_consumer import handler;  print(handler({'Records': []}, None))"
uv run python -c "from src.pipeline.hourly_alerts import handler; print(handler({'source':'aws.events'}, None))"
uv run python -c "from src.pipeline.nightly_bkt import handler;   print(handler({'source':'aws.events'}, None))"
uv run python -c "from src.pipeline.nightly_irt import handler;   print(handler({'source':'aws.events'}, None))"
```

> ⚠️ Estas invocaciones reales tocan DB (asyncpg) y APIs (Anthropic/Gemini). Para A6/A7/A8
> necesitas: la DB local poblada, `S3_*`/`SQS_*` apuntando a LocalStack (§3c), un PDF/fotos
> subidos al bucket, y crédito de Anthropic (A7/A8 usan Sonnet/Haiku — ver costos §9 de LOCAL_TESTING).

### 3c. Pipeline ASÍNCRONO en vivo (LocalStack) — máxima fidelidad como prod

Reproduce el event-source-mapping SQS→Lambda de prod: el backend publica a las colas,
y un **consumer** local las pollea y despacha a cada worker. Los `.env` ya apuntan a
LocalStack (`AWS_ENDPOINT_URL=:4566` + creds dummy) y a buckets `innova-*-dev`.

```bash
# 1) Levantar LocalStack (servicio ya añadido al docker-compose)
cd ~/repositorios/innova/innova-backend-serverless && docker compose up -d localstack

# 2) Crear colas + buckets (idempotente)
cd ~/repositorios/innova/innova-ai-engine && uv run python scripts/local_aws_bootstrap.py

# 3) Arrancar el consumer (un proceso; pollea guide-ingest / solution-generation /
#    submission-grade y despacha a cada handler). Déjalo corriendo en su terminal.
uv run python scripts/local_pipeline_consumer.py
```

Con esto, el flujo real corre solo: el profe sube un PDF en la web → backend crea la guía
y publica a `guide-ingest-queue` → el consumer dispara A6 (extrae) → publica a
`solution-generation-queue` → A7 (genera pauta, Sonnet) → guía a REVIEW. Al corregir fotos:
backend → `submission-grade-queue` → A8 (Haiku visión).

> Requiere **crédito Anthropic** (A6/A7/A8 llaman a Sonnet/Haiku de verdad; ~$0.20–0.70
> por guía, ver §9 de LOCAL_TESTING) y `GEMINI_API_KEY` (free tier) para el OCR/precheck.
> Sin LocalStack/consumer, lo síncrono igual funciona; lo async queda "en cola".

---

## 4. clients (`innova-clients`)

```bash
cd ~/repositorios/innova/innova-clients

# --- tests / calidad ---
pnpm install                         # si cambió algún package.json
pnpm test:unit                       # 5 archivos / 25 tests (vitest)
pnpm typecheck                       # turbo → 3/3 (web, api-client, math-input)
pnpm lint                            # turbo → 8/8 (web, 6 packages, landing)

# --- levantar el front ---
pnpm dev                             # landing (:3004) + web (:3005) JUNTAS (como prod)
# pnpm dev:web                       # solo la web (:3005)
# pnpm dev:landing                   # solo la landing Astro (:3004)
# Flujo: entras a la landing :3004 → "Iniciar sesión" → http://localhost:3005/login.
# El base http://localhost:3005/ redirige a /login (la web NO tiene landing propia).

# --- E2E Playwright (requiere back :3000 + web :3005 + Supabase :54321 arriba) ---
pnpm test:e2e
```

---

## 5. Stack completo para testear A MANO en el navegador

Necesitas **4 terminales** + Supabase. Orden:

```bash
# Terminal 0 — infra (una vez)
cd ~/repositorios/innova/innova-backend-serverless && docker compose up -d

# Terminal 1 — Supabase local (Postgres :54322 + Auth :54321 + Studio :54323).
# La clave ES256 (signing_keys.json) + config.toml ya están listos en el repo.
cd ~/repositorios/innova/innova-clients
pnpm dlx supabase@latest start --ignore-health-check
#   parar (con backup, preserva la DB):  pnpm dlx supabase@latest stop
# Verifica el stack COMPLETO (no solo la DB) y que el JWKS ya expone ES256:
docker ps --filter name=supabase --format "{{.Names}}  {{.Status}}"      # ~8-10 contenedores
curl -s http://127.0.0.1:54321/auth/v1/.well-known/jwks.json            # {"keys":[{"alg":"ES256",...}]}
#   Si sale solo la DB / "fetch failed" / JWKS vacío → ver "§1 · Si seed:auth da fetch failed".

# (una vez) sembrar los 7 usuarios demo en Supabase Auth (la DB ya tiene los supabase_uid):
cd ~/repositorios/innova/innova-backend-serverless
ALLOW_SEED=1 SEED_DEMO_PASSWORD='Demo1234!' pnpm seed:auth   # (ver docs/PRIVATE_SEED.md)

# Terminal 2 — backend
cd ~/repositorios/innova/innova-backend-serverless && pnpm start:dev      # :3000

# Terminal 3 — front (landing + web juntas)
cd ~/repositorios/innova/innova-clients && pnpm dev                       # :3004 + :3005

# Terminal 4 (opcional) — ai-engine: health o invocar workers on-demand (§3a/§3b)
cd ~/repositorios/innova/innova-ai-engine && uv run python scripts/local_health_server.py
```

**Probar:** abre `http://localhost:3005`, inicia sesión con un usuario demo
(`teacher@innova.demo` / `student1@innova.demo`, pass `Demo1234!`). El SDK de Supabase
obtiene un JWT ES256 → el backend lo valida vía JWKS → las rutas protegidas responden.

### ¿Qué funciona sin ai-engine?

Todo lo **síncrono**: login, navegación, CRUD de guías (crear, editar preguntas), listados,
dashboards con datos del seed. Lo **asíncrono** (ingesta de PDF → pauta IA, corrección de
fotos, clasificación de errores) queda "en cola" hasta que corras el worker correspondiente
(§3b) o montes LocalStack (§3c). Para demo de UI, el seed ya deja datos suficientes.

---

## Qué testear a mano — checklist por rol

> Pre-requisito: stack completo arriba (§5) + `migrate deploy && db seed` + `seed:auth`.
> Entra a `http://localhost:3005`, login con la tabla de usuarios demo (todos `Demo1234!`).

### 👩‍🏫 Teacher — `teacher@innova.demo`
- [ ] **Dashboard del curso** "4° A · Matemáticas": heatmap de mastery por (alumno, topic).
      Verde Valentina (0.82), rojo Diego (0.22) y Benjamín (0.29/0.35).
- [ ] **Panel de alertas**: 2 sin resolver (AT_RISK Diego = HIGH, COMMON_ERROR sub-borrow = MED).
      Marca una como resuelta → debe desaparecer/cambiar estado.
- [ ] **Drill-down de Diego Vega**: historial de attempts (2 errores borrow + 1 correcto) + frecuencia de errores.
- [ ] **Guías**: crear guía, subir PDF, editar preguntas, publicar. (La pauta IA A6/A7 solo corre si el ai-engine está activo — §3b/§3c.)
- [ ] **Catálogo de errores** (si el usuario es ADMIN): listar/paginar (keyset), cambiar `status` de un tag.

### 🧑‍🎓 Student — `student1@innova.demo` (Diego Vega)
- [ ] **Lista de assignments/guías** asignadas al alumno.
- [ ] **Resolver ejercicio** de sustracción con préstamo (`53 - 26`, `72 - 48`, …): math-input por pasos →
      submit → feedback con `is_correct` + tipo de error. El **rule engine clasifica sin LLM** para sub-borrow.
- [ ] **Subir foto** de una guía resuelta (flujo OCR → A8; solo se corrige si el pipeline corre — §3c).
- [ ] **Progreso propio**: mastery por topic (sin exponer números crudos en parent, sí orientativos en student).

### 👨‍👩‍👧 Parent — `parent@innova.demo` (vinculado a Diego)
- [ ] **Assignments activos** del hijo (Diego Vega).
- [ ] **Resumen de mastery** en barras (sin números crudos, por COPPA).

### 🔌 API directa con curl (sin front) — útil para verificar el backend aislado

```bash
# 1) Obtener un JWT real de Supabase (password grant). Necesita la anon key (apikey header).
ANON=$(cd ~/repositorios/innova/innova-clients && pnpm dlx supabase@latest status -o env 2>/dev/null \
  | grep ANON_KEY | cut -d= -f2 | tr -d '"')   # o cópiala del clients/.env (NEXT_PUBLIC_SUPABASE_ANON_KEY)

TOKEN=$(curl -s "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"teacher@innova.demo","password":"Demo1234!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 2) Llamar rutas protegidas del backend (:3000) con ese token:
curl -s http://localhost:3000/auth/me            -H "Authorization: Bearer $TOKEN"   # perfil + rol
curl -s http://localhost:3000/alerts             -H "Authorization: Bearer $TOKEN"   # alertas (teacher)
curl -s http://localhost:3000/mastery/seed-student-001 -H "Authorization: Bearer $TOKEN"  # mastery de Diego
```

> El `access_token` viene firmado **ES256** (gracias al signing key) → el backend lo valida contra el JWKS.
> Para probar como student/parent, cambia el email en el paso 1 (misma password `Demo1234!`).

### 🤖 Pipeline IA (ai-engine) — opcional
- [ ] **On-demand** (§3b): invocar un handler con un evento simulado (no necesita colas).
- [ ] **Async fiel a prod** (§3c): LocalStack + consumer → profe sube PDF → A6→A7 (pauta) → fotos → A8.
      Requiere **funds de Anthropic** (A7/A8) y `GEMINI_MODEL=gemini-2.5-flash` (A6/OCR, ya con billing).

---

## 6. Verificación rápida "todo verde" (sin levantar servers)

```bash
# Backend
cd ~/repositorios/innova/innova-backend-serverless && pnpm test:cov && pnpm test:e2e

# ai-engine
cd ~/repositorios/innova/innova-ai-engine && uv run ruff check src/ tests/ && uv run pyright src/ && uv run pytest -k "not smoke" -q

# clients
cd ~/repositorios/innova/innova-clients && pnpm test:unit && pnpm typecheck && pnpm lint
```

Esperado: back **399 + 11**, cov **87.3% EXIT 0** · ai **ruff OK / pyright 0 / 159** · clients **25 / 3·3 / 8·8**.

---

## 7. Teardown

```bash
# parar Supabase
cd ~/repositorios/innova/innova-clients && pnpm dlx supabase@latest stop --no-backup
# parar Postgres + Mongo
cd ~/repositorios/innova/innova-backend-serverless && docker compose down
#   (añade -v para borrar los volúmenes y resetear la DB)
```
