# Testeo local a fondo — los 3 repos (local + prod-coherente)

> Objetivo: correr y verificar **innova-backend-serverless**, **innova-ai-engine** e
> **innova-clients** en local, con el **mismo código** que corre en prod (sin ramas
> de comportamiento local-only). Todo lo específico de entorno vive en `.env`
> (gitignored) en local y en **secrets inyectados** (Lambda / Vercel / GitHub Actions)
> en prod.

Última revisión: 2026-06-15 · Autor: sesión Claude Code

---

## 0. Arquitectura: qué mapea a qué (local ↔ prod)

| Capa              | Local                                       | Prod                          |
|-------------------|---------------------------------------------|-------------------------------|
| **App DB (Prisma) + Auth** | **Supabase** (API `:54321`, Postgres `:54322`) | **Supabase cloud**     |
| Telemetría        | MongoDB docker-compose `:27017`             | Mongo Atlas                   |
| Colas / Storage   | LocalStack `:4566` (opcional)               | AWS SQS / S3                  |
| IA (LLM/OCR)      | API real (Anthropic/Gemini) o mocks         | API real                      |

**Clave (arquitectura 2026-06-15):** Supabase es **DB + Auth en el mismo Postgres**
(los datos de la app en `public`, los usuarios en `auth`). `DATABASE_URL` del backend y
del ai-engine apunta al Postgres de Supabase (`:54322` local). **Neon queda fuera.**
docker-compose ya **solo** se usa para **MongoDB** (Supabase no da Mongo). El Postgres
del compose (`:5433`) quedó sin uso (legacy, se puede borrar del compose).
Tras cada `supabase start` (que recrea su Postgres) corre
`pnpm prisma migrate deploy && pnpm prisma db seed` para crear/poblar las tablas.

---

## 1. Hallazgos resueltos en esta sesión

### 1.1 🔴 Bug de auth (afectaba prod **y** local) — ARREGLADO en código

`SupabaseJwtStrategy` exigía `algorithms: ['RS256']`, pero el proyecto Supabase de
prod firma los JWT de usuario con **ES256** (clave asimétrica EC P-256, verificado
contra su endpoint JWKS). Con el whitelist en RS256, el guard **rechazaba los tokens
reales de prod**. Fix aplicado:

```ts
// src/modules/auth/supabase-jwt.strategy.ts
algorithms: ['ES256', 'RS256'],   // acepta ambos: ES256 (default Supabase) y RS256
```

Esto desbloquea prod y permite que el Supabase local valide idéntico si emite clave
asimétrica (ver §4). Tests de auth: **50/50 verdes** tras el cambio.

### 1.2 Auth local (email/password HS256) es **vestigial**

`/auth/register|login|refresh|forgot-password` emiten tokens HS256 (`LOCAL_AUTH_*`),
pero el guard global solo acepta JWKS de Supabase → esos tokens **no** abren rutas
protegidas. No usarlo para E2E. `LOCAL_AUTH_*` tienen defaults en
`auth.constants.ts`, así que no hace falta declararlos.

### 1.3 Mismatch de puerto CORS — ARREGLADO en `.env`

`apps/web` corre en `:3005` pero `CORS_ORIGINS` no lo incluía → el navegador quedaba
bloqueado. Añadido `http://localhost:3005` (y `PUBLIC_APP_URL` alineado a `:3005`).

### 1.4 `.env` actualizados

- **backend**: Supabase → local `:54321` + demo keys; prod movido a comentarios;
  añadidas todas las vars v9 (guides queues/buckets/TTL) y nota `LOCAL_AUTH_*`.
- **ai-engine**: traído a paridad con `.env.example` (todas las vars v9 A6–A9).
- **clients**: ya estaba correcto (local `:54321`, demo keys) — sin cambios.

### 1.5 `tex.py` SyntaxError (ai-engine) — ARREGLADO

`src/guide_ingest/tex.py:27` tenía un f-string con la expresión en 2 líneas (válido en
Python 3.12+, **SyntaxError en 3.11**). Colapsado a una línea (salida idéntica). Esto
bloqueaba la colección de pytest. Suite no-smoke: **149/149 verdes**.

### 1.6 `turbo.json typecheck` + gap de lint (clients) — ARREGLADO

- Faltaba la task `typecheck` en `innova-clients/turbo.json` → `pnpm typecheck` fallaba
  con "could not find task". Añadida. Corre en web + api-client + math-input.
- Solo `@innova/web` tenía script `lint`. Añadido `lint` a los 6 packages TS
  (`eslint . --ext .ts,.tsx`) y a `landing` (`--ext .ts,.tsx,.astro`; el plugin Astro
  ya estaba en devDeps). `pnpm lint` → **8/8**, todo verde.

### 1.7 Backend `test:e2e` (auth) — ARREGLADO

`test/auth.e2e-spec.ts` firmaba tokens **HS256** (mock `jwks-rsa` con secreto simétrico),
pero la strategy de prod valida asimétrico → 401. Reescrito el mock para generar un par
RSA y firmar **RS256** (mismo path que prod). Además el e2e ahora registra el
`ResponseInterceptor` (como `main.ts`) para que `body.data` refleje el contrato real.
Resultado: **11/11**.

### 1.8 Backend `test:cov` — ARREGLADO (gate verde)

Dos pasos: (1) excluir del coverage el catálogo **generado** y los **schemas Mongoose**
(no unit-testeables); (2) escribir tests unitarios de los módulos v9 `guides` y
`guide-submissions` (services + controllers, antes a 0%). Resultado: **87.3% stmts /
74.4% branches / 85.2% funcs / 87.7% lines** → gate 75/75/75/60 **EXIT 0**. Suite:
**399 tests / 50 suites**. Ver §10.

---

## 2. Prerrequisitos (one-time) — comandos para correr tú

> Regla WSL2: estos los corres tú, no el agente.

```bash
# Docker (Postgres + Mongo locales) — desde la raíz del backend
cd ~/repositorios/innova/innova-backend-serverless
docker compose up -d            # postgres:5433, mongo:27017

# Supabase CLI — SIN instalación global (respeta regla WSL2). Usar `pnpm dlx`:
cd ~/repositorios/innova/innova-clients     # tiene supabase/config.toml
pnpm dlx supabase@latest start --ignore-health-check   # levanta el stack local (:54321)
# Parar / reiniciar limpio:
pnpm dlx supabase@latest stop --no-backup

# (Opcional Tier 3 colas) LocalStack — añadir al docker-compose o:
#   docker run -d -p 4566:4566 localstack/localstack
```

Deps de cada repo (ya instaladas; reinstala solo si hace falta):

```bash
# backend / clients usan pnpm; ai-engine usa uv
cd innova-backend-serverless && pnpm install
cd innova-clients            && pnpm install
cd innova-ai-engine          && uv sync
```

---

## 3. Tier 1 — Tests unitarios (SIN infraestructura)

Cubre la mayor parte del "testeo a fondo". No necesita docker ni Supabase, **ni
fondos de API** (todos los proveedores están mockeados — ver §9 Costos de API).

```bash
# Backend (NestJS / jest) — gate 75/75/75/60
cd innova-backend-serverless
pnpm test            # o: pnpm test:cov  (para cobertura)

# ai-engine (pytest) — gate ≥75%, ~149 tests
cd innova-ai-engine
uv run pytest -k "not smoke"

# clients (vitest + typecheck + lint)
cd innova-clients
pnpm test:unit                 # 25 tests (vitest)
pnpm typecheck                 # turbo: web + api-client + math-input (tsc --noEmit)
pnpm lint                      # turbo: @innova/web (next lint)
```

**Esperado:** backend ~126+ tests, ai-engine ~149, clients 25 tests + typecheck 3/3 + lint OK.
Todos verdes.

> Nota: `pnpm typecheck` requería la task `typecheck` en `innova-clients/turbo.json`
> (faltaba → "could not find task"). Ya añadida. Y se cerró el gap de lint: script
> `lint` añadido a los 6 packages TS (`eslint . --ext .ts,.tsx`) + a `landing`
> (`--ext .ts,.tsx,.astro`; el plugin Astro ya estaba en devDeps). `pnpm lint` → **8/8**.

---

## 4. Tier 2 — Infra local + DB (migrate + seed)

```bash
cd innova-backend-serverless
docker compose up -d                 # Postgres + Mongo

# Migraciones Prisma sobre la Postgres local (:5433)
pnpm prisma migrate deploy           # aplica las 9 migraciones (o `migrate dev`)
pnpm prisma generate

# Seed de catálogo + datos demo (usa DATABASE_URL local)
pnpm prisma db seed

# Levantar el backend
pnpm start:dev                       # http://localhost:3000  (Swagger en /api)
```

Smoke sin auth: endpoints `@Public()` (p.ej. `GET /health` si existe) y Swagger UI.

---

## 5. Tier 3 — Full-stack E2E con auth real (Supabase local)

> **¿Cuándo necesito Supabase local corriendo?**
>
> - `pnpm test:e2e` (jest, backend) → **NO**. Mockea `jwks-rsa` y firma RS256 en memoria;
>   solo necesita Postgres up. Por eso pasa sin `supabase start`.
> - **Testeo manual** (tú entrando a la app en el navegador) y **Playwright real-auth** →
>   **SÍ**. El front necesita Supabase para autenticar y obtener un JWT real.

Para ejercitar **rutas protegidas** desde el navegador necesitas un JWT de usuario que el
guard acepte. Como el guard valida vía **JWKS asimétrico**, el Supabase local debe emitir
clave asimétrica (por defecto firma HS256 → no sirve).

### 5.1 Configurar Supabase local con clave asimétrica (ES256, igual que prod)

```bash
cd ~/repositorios/innova/innova-clients

# 1) Generar la clave privada de firma (ES256, igual algoritmo que prod)
pnpm dlx supabase@latest gen signing-key --algorithm ES256 > supabase/signing_keys.json
#   ⚠️ NO commitear este archivo (ya está en .gitignore de clients).

# 2) En supabase/config.toml, descomentar y apuntar:
#      [auth]
#      signing_keys_path = "./signing_keys.json"

# 3) Arrancar el stack (sin instalar el CLI globalmente — regla WSL2)
pnpm dlx supabase@latest start --ignore-health-check
#   Para / reinicia limpio:  pnpm dlx supabase@latest stop --no-backup
#   Anota: API URL (http://127.0.0.1:54321), anon key y service_role key.
#   Si difieren de las demo keys en los .env, pégalas en:
#     - innova-backend-serverless/.env  (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY)
#     - innova-clients/.env             (NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE_ROLE)

# 4) Verificar que el JWKS sirve clave asimétrica (debe mostrar ES256):
curl -s http://127.0.0.1:54321/auth/v1/.well-known/jwks.json | jq .
```

> Con `algorithms: ['ES256','RS256']` (fix §1.1), el backend valida estos tokens
> idéntico a prod. Si por versión del CLI no logras claves asimétricas, es señal de
> actualizar el CLI — no degradar el backend a HS256.

### 5.2 Sembrar usuarios demo en Supabase Auth

El DB tiene `supabase_uid` pero Auth necesita los usuarios. Usa el seed privado:

```bash
cd innova-backend-serverless
ALLOW_SEED=1 SEED_DEMO_PASSWORD='<pass>' \
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_SERVICE_ROLE_KEY='<service_role local>' \
  pnpm seed:auth
# (ver docs/PRIVATE_SEED.md)
```

### 5.3 Levantar todo

```bash
# Terminal A — backend
cd innova-backend-serverless && pnpm start:dev          # :3000

# Terminal B — web
cd innova-clients && pnpm dev:web                       # :3005

# Terminal C (opcional) — workers ai-engine (si pruebas pipeline v9)
cd innova-ai-engine && uv run python -m src.workers...  # según worker
```

Login en `http://localhost:3005` con un usuario demo → el SDK de Supabase obtiene un
JWT ES256 → el backend lo valida vía JWKS → rutas protegidas responden. CORS ya
permite `:3005`.

### 5.4 E2E automatizados

```bash
# e2e backend (jest-e2e) — RS256 JWT mockeado (jwks-rsa), NO requiere Supabase.
# Solo necesita Postgres up. → 11/11.
cd innova-backend-serverless && pnpm test:e2e

# Playwright smoke (clients) — necesita web :3005 + backend :3000 arriba,
# y Supabase local corriendo (login real en el navegador).
cd innova-clients && pnpm test:e2e
```

---

## 6. Pipeline v9 (guías) en local — opcional

Requiere colas SQS + buckets S3. En local: **LocalStack** (`:4566`).

1. Levanta LocalStack y crea colas/buckets que matcheen los `.env`
   (`guide-ingest-queue`, `solution-generation-queue`, `submission-grade-queue`,
   buckets `innova-guides-dev` / `innova-submissions-dev`).
2. Apunta `AWS_ENDPOINT_URL`/credenciales dummy a LocalStack para los SDK.
3. Corre los workers de ai-engine (A6→A7→A8→A9).

Si no levantas LocalStack, el backend **igual arranca** (las vars SQS/S3 son
opcionales en el schema Zod); solo fallan los endpoints que publican a colas.

---

## 7. Checklist de verificación

- [x] `docker compose up -d` → Postgres `:5433` + Mongo `:27017` arriba
- [x] backend `pnpm test` → **326/326** · `pnpm test:e2e` → **11/11**
- [x] ai-engine `ruff` OK · `pyright` 0 errors · `pytest -k "not smoke"` → **149/149**
- [x] clients `pnpm test:unit` (25) · `pnpm typecheck` (3/3) · `pnpm lint` (**8/8**)
- [x] `pnpm prisma migrate deploy && pnpm prisma db seed` OK
- [x] backend `pnpm test:cov` → **87.3%** (gate 75/75/75/60 EXIT 0)
- [ ] `pnpm dlx supabase@latest start` + JWKS muestra `ES256` (solo para testeo manual)
- [ ] `pnpm seed:auth` crea usuarios demo en Auth local
- [ ] Login en `:3005` → `GET /auth/me` (backend) responde 200 con el JWT
- [ ] `pnpm test:e2e` (clients Playwright) verde

---

## 8. Notas de prod (que NO se rompen con esto)

- El código lee **todo** de env vars; no hay valores local-only hardcodeados.
- En prod, inyecta como secrets: `DATABASE_URL` (Neon), `MONGODB_URI` (Atlas),
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` (Supabase cloud),
  colas/buckets reales, API keys. Referencia comentada al final del `.env` del backend.
- El fix `['ES256','RS256']` es estrictamente más permisivo y correcto para prod
  (que hoy firma ES256). Sin él, el auth de prod estaba roto.

---

## 9. Costos de API — qué corre gratis vs qué requiere crédito

> TL;DR: **el testeo "a fondo" vía suites cuesta $0.** Solo el pipeline v9 *real*
> (no mockeado) consume crédito de Anthropic, y es opcional.

### 9.1 Hecho verificado contra el código (2026-06-15)

En toda la suite de ai-engine hay **un solo** test que pega a una API real:
`tests/ocr/test_gemini_adapter.py` (marcado `@pytest.mark.smoke`, usa **Gemini**).
Los otros **149 tests no-smoke mockean** todos los proveedores. **Ningún test llama a
Anthropic de verdad** (`llm_classifier`, `submission_grader`, `solution_gen`,
`claude_adapter`, `extractor` usan mocks). Backend (jest) y clients (vitest) tampoco
hacen llamadas reales.

### 9.2 Tabla de costos

| Qué corres                                   | Anthropic | Gemini      | Costo  |
|----------------------------------------------|-----------|-------------|--------|
| `uv run pytest -k "not smoke"` (gate, 149)   | mock      | mock        | **$0** |
| backend `pnpm test` · clients `pnpm test:unit` | mock    | mock        | **$0** |
| `uv run pytest -m smoke` (1 test)            | —         | free tier   | **$0** |
| **Pipeline v9 real** (PDF→pauta→corrección)  | API real (Sonnet/Haiku) | free tier (OCR) | centavos · **opcional** |

### 9.3 Reglas prácticas

- **Testeo rutinario:** usa `-k "not smoke"`. Es el gate (≥75% cobertura) y no gasta nada.
- **Gemini:** NO requiere fondos. El único test real cabe en el **free tier**; solo
  necesitas una key válida de nivel gratuito.
- **Anthropic:** solo cuesta si ejecutas el pipeline v9 **real** (workers contra la API,
  sin mock) para validar integración. Son centavos por corrida. En un plan eval con
  saldo $0 necesitarías un mínimo de crédito (~$5) **solo para ese caso**.
- **No uses la key de prod (`innova-backend-prod`) en `.env` locales.** Crea una key de
  dev separada; deja la de prod solo como secret inyectado en Lambda/Actions. Si la key
  se expone fuera del `.env` (gitignored), **rótala** desde la consola de Anthropic.

---

## 10. Cobertura backend (`test:cov`) — RESUELTO (87.3%)

Se cerró el gate de forma honesta (sin esconder código con exclusiones):

1. **Exclusiones legítimas** (no unit-testeable): catálogo `**/*.generated.ts` (5282
   líneas) + `**/infrastructure/database/schemas/**` (schemas Mongoose declarativos).
2. **Tests unitarios nuevos** de los módulos v9 que estaban a 0%:

| Archivo testeado                            | Cobertura ahora |
|---------------------------------------------|-----------------|
| `modules/guides/guides.service.ts`          | **98%**         |
| `modules/guides/guides.controller.ts`       | **100%**        |
| `modules/guide-submissions/*.service.ts`    | **99%**         |
| `modules/guide-submissions/*.controller.ts` | **100%**        |

Specs añadidos: `guides.service.spec.ts` (37), `guides.controller.spec.ts` (16),
`guide-submissions.service.spec.ts` (17), `guide-submissions.controller.spec.ts` (6).

**Global: 87.3% stmts / 74.4% branches / 85.2% funcs / 87.7% lines** → gate
75/75/75/60 **EXIT 0**. Suite total: **399 tests / 50 suites**.

> Único 0% restante: `parent.controller.ts` (~38 líneas) — no afecta el gate global.
> Candidato a un spec trivial de delegación si se quiere 100%.
