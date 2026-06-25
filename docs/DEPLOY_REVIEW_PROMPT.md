# Prompt de auditoría de deploy — innova-backend-serverless (para Claude en Google Chrome)

> Pega esto en **Claude con navegación**. Abre cada link, lee y reporta con evidencia.
> Si algo requiere login/credenciales AWS y no puedes, márcalo `NO_VERIFICABLE`.

---

## Contexto

Backend NestJS serverless (AWS Lambda + Serverless v3 + Prisma/Postgres-Supabase + MongoDB).
Deploy **solo en `main`** (`deploy.yml`, 2 jobs: *Test and Build* → *Deploy to AWS prod*).
Dominio: **`https://api.superprofes.app`**, Swagger en **`/docs`**.
Es el **dueño de las colas SQS** que consume `innova-ai-engine`.

## Links a revisar

1. `https://github.com/vruizz22/innova-backend-serverless/actions`
2. `https://github.com/vruizz22/innova-backend-serverless/actions/workflows/deploy.yml`
3. `https://github.com/vruizz22/innova-backend-serverless/actions/workflows/ci.yml`
4. Secrets: `https://github.com/vruizz22/innova-backend-serverless/settings/secrets/actions`
5. Swagger prod: `https://api.superprofes.app/docs`

## Checklist

### A. Triggers

- [ ] Abre `deploy.yml`: confirma `on.push.branches: [main]` (+ `workflow_dispatch`). Reporta cualquier rama no-main en el **deploy**.
- [ ] Confirma que el job `deploy` tiene `needs: test-and-build` (no deploya si los tests fallan).

### B. Runs

- [ ] ¿Último run de `deploy.yml` en `main` verde? Si rojo, abre el job que falla y **copia el error exacto** (busca: `serverless`, `prisma`, `eslint`, `FAIL`, `coverage`).
- [ ] ¿Job *Deploy to AWS* en estado `success` o `skipped`? Si *skipped*, es que *Test and Build* falló.
- [ ] ¿`ci.yml` verde? Si exit 1 con todos los tests pasando → reporta "posible gate de coverage".

### C. Secrets

- [ ] Confirma presencia de: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `DATABASE_URL`, `MONGODB_URI`, **`SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`**, **`SUPABASE_ANON_KEY`**, `CORS_ORIGINS`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PUBLIC_API_URL`, `PUBLIC_APP_URL`.
- [ ] Marca como sospechosos/obsoletos: `COGNITO_CLIENT_ID/REGION/USER_POOL_ID` (auth migró a Supabase).

### D. API viva (smoke test del Swagger)

Abre `https://api.superprofes.app/docs` y verifica:

- [ ] Carga el Swagger ("Innova Serverless Core API"). Status del dominio (`200`).
- [ ] `GET /` (App) responde.
- [ ] `POST /auth/login` con `{ "email": "teacher@innova.demo", "password": "Innova123!" }` → ¿`201` con tokens o `401`? (reporta cuál).
- [ ] Con el token, `GET /auth/me` → `200`.
- [ ] `GET /skills` → `200` y devuelve lista.
- [ ] `GET /admin/error-tags` (requiere rol ADMIN) → `200`/`403` (reporta).
- [ ] Revisa que las respuestas no expongan stack traces ni envs vacíos (señal de secrets faltantes).

### E. CORS

- [ ] Verifica que `CORS_ORIGINS` permita `https://app.superprofes.app` (header `Access-Control-Allow-Origin`).

## Formato de salida

Tabla **Check | ✅/❌/NO_VERIFICABLE | Evidencia | Acción**, y **veredicto final**: ¿el backend
cumple "deploy solo main + tests gateando + secrets Supabase completos + API+Swagger vivos + CORS ok"?
Lista los ARNs de colas SQS si los ves (los necesita ai-engine).
