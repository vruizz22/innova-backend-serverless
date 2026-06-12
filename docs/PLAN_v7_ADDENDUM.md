# PLAN v7 — Addendum innova-backend-serverless

> Acciones concretas. Referencia principal: `../../docs/MASTER_PLAN_v7.md`.
> **Regla #0:** el agente NO ejecuta `pnpm install/add`, `prisma migrate/generate/db seed`, `serverless deploy`, `docker compose up`. Los entrega para que Victor los corra. Ver `CLAUDE.md §0`.

---

## Sprint S1 (M7 — cerrar bloqueador B1)

- [ ] `src/modules/mastery/mastery.service.ts:62,70` — tipar explícitamente el resultado de Prisma para eliminar `@typescript-eslint/no-unsafe-assignment`.
  - Importar `Prisma` desde `@prisma/client` y declarar el tipo de retorno con `Prisma.StudentSkillMasteryGetPayload<...>`.
- Comando para Victor:
  ```bash
  cd innova-backend-serverless
  pnpm eslint src/ --max-warnings 0
  pnpm tsc --noEmit
  pnpm jest src/modules/mastery
  ```

**DoD:** CI verde, sin `continue-on-error`.

---

## Sprint S2 (M8 — Supabase Auth + Postgres en un solo corte)

> No hay producción ni usuarios. Es un único PR que sustituye Cognito y Neon por Supabase (auth + DB). Sin coexistencia, sin `pg_dump`, sin fallback HS256, sin auto-link por email.

1. Crear proyecto Supabase region `us-east-1`. Guardar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` en GitHub Secrets.
2. Aplicar trigger Postgres `set_default_role` desde el SQL editor de Supabase (idéntico al de `innova-clients/docs/SUPABASE_AUTH.md §5`):
   ```sql
   create or replace function public.set_default_role()
   returns trigger language plpgsql security definer as $$
   begin
     new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('role', coalesce(new.raw_app_meta_data->>'role', 'student'));
     return new;
   end $$;
   create trigger on_user_signup before insert on auth.users
     for each row execute function public.set_default_role();
   ```
3. Crear `src/modules/auth/supabase-jwt.strategy.ts` con `passport-jwt` + `jwks-rsa` (RS256). Detalle en `docs/auth-integration-supabase.md §2`.
4. Crear `SupabaseAuthGuard` y reemplazar `@UseGuards(CognitoGuard)` por `@UseGuards(SupabaseAuthGuard)` en todos los controllers.
5. Crear `UserLinkerService.ensureUser` con `prisma.user.upsert({ where: { supabaseUid } })`. Ver `docs/auth-integration-supabase.md §4`.
6. `git rm` Cognito: `src/modules/auth/cognito-jwt.strategy.ts`, `src/adapters/cognito/`, `docs/auth-integration.md`, `docs/auth-testing-status.md`. Borrar envs `COGNITO_*` de `.env.example` y del Joi schema en `ConfigModule`.
7. Apuntar `DATABASE_URL` al Postgres de Supabase (mismo proyecto). Sin `pg_dump` desde Neon — no hay datos importantes. `pnpm prisma migrate deploy` desde cero.

Comandos para Victor:
```bash
cd innova-backend-serverless
pnpm prisma migrate deploy        # aplica todas las migraciones en Supabase Postgres
pnpm prisma db seed               # seeds locales (subjects, curriculum, error tags)
pnpm jest test/auth --runInBand   # tests del strategy + guard + linker
```

**DoD:** `curl -H "Authorization: Bearer <supabase_jwt>" https://api.superprofes.app/auth/me` retorna `{ id, email, role }`. `DATABASE_URL` apunta a Supabase. Cero referencias a Cognito o Neon en el repo (`grep -r cognito\|neon src/` vacío).

---

## Sprint S3-S4 (M10 — data model v7)

### Orden de cambios

1. **Reescribir `docs/postgresql.dbml`** con el modelo del master plan §4. Source of truth antes de cualquier migración.
2. **Generar la migración Prisma** `v7_domain_model`:
   - Renombrar `Classroom → Course` (con `RENAME TABLE` para preservar datos), agregar `subjectId, gradeLevel, academicYear`.
   - Renombrar `TeacherClassroom → CourseTeacher`.
   - Renombrar `Skill → Topic`, agregar FK a `Unit`.
   - Renombrar `Item → Exercise`, agregar `source, topicId`.
   - Renombrar `StudentSkillMastery → StudentTopicMastery`, agregar `trend7d`.
   - Crear `Subject, Curriculum, Unit, Enrollment, Assignment (ex-PracticeAssignment), AttemptStep, ErrorTag`.
   - Migrar `Attempt.rawSteps Json` → relación `AttemptStep[]` (script Node de backfill).
3. Comando para Victor:
   ```bash
   cd innova-backend-serverless
   pnpm prisma migrate dev --name v7_domain_model --create-only   # genera SQL sin aplicar
   # → revisar el .sql generado, agregar UPDATEs/INSERTs de backfill manualmente
   pnpm prisma migrate dev                                          # aplica
   pnpm prisma generate
   pnpm prisma db seed
   ```
4. Crear seeds nuevos:
   - `prisma/seeds/subjects.ts` → `matematica`.
   - `prisma/seeds/curriculum-matematica-basica.ts` — consume JSON de `innova-ai-engine/scripts/curriculum_loader.py`.
   - `prisma/seeds/error-tags.ts` — sincronizado con `docs/error-taxonomy.md`.

### Módulos nuevos / refactorizados

- `SubjectModule`, `CurriculumModule`, `UnitModule`, `TopicModule` (CRUD admin).
- `EnrollmentModule` (`POST /enrollments`, `GET /courses/:id/students`).
- `ExerciseModule` (reemplaza `ItemsModule`).
- `AssignmentModule` (reemplaza `PracticeModule` stub):
  - `POST /assignments` — teacher asigna.
  - `POST /assignments/recommend?studentId=...&topicId=...` — recommender Fisher info.
  - `GET /assignments/student/:id` — student/parent.
- `AlertModule.findOpenByTeacher(teacherId)` — join con Course.teacher.

### Endpoints clave (ver master plan §6.3)

Generar OpenAPI spec con `@nestjs/swagger` (`pnpm add @nestjs/swagger`) y exportar JSON para que el cliente lo consuma.

**DoD:** schema Prisma y DBML en paridad. `prisma migrate deploy` corre limpio en staging. Endpoint `POST /attempts` acepta `steps[]` estructurado.

---

## Sprint S5 (M11 — Rule Engine + Recommender + OCR loop consumer)

1. 3 strategies en `src/modules/attempts/rule-engine/strategies/`:
   - `subtraction-borrow.strategy.ts`
   - `addition-carry.strategy.ts`
   - `fraction-same-denom.strategy.ts`
   - Cada una con `.spec.ts` y golden set `test/fixtures/golden_attempts.json`.
2. `AssignmentService.recommendForStudent(studentId, topicId?)`:
   - Lee `StudentTopicMastery.pKnown(θ)`.
   - Lee `Exercise.irtA, irtB` del topic.
   - Calcula Fisher `I(θ) = a² P(θ)(1-P(θ))`.
   - Retorna top-N, filtra por prerequisitos.
3. `AttemptReprocessWorker` (`src/workers/attempt-reprocess/`):
   - SQS Standard consumer (`attempt-reprocess-queue`).
   - UPDATE `Attempt.steps`, `Attempt.ocrConfidence`, `Attempt.status='OCR_DONE'`.
   - Re-dispatch al `AttemptsService.classify()` con los steps OCR.

**DoD:** foto subida por alumno aparece clasificada en <2 min end-to-end.

---

## Sprint S6 (M12 — RLS habilitada)

> La migración de DB ya ocurrió en S2 (Supabase Postgres desde el primer día). Este sprint sólo prende RLS por tabla user-facing una vez los clientes consumen Supabase Auth.

1. Habilitar RLS por tabla user-facing: `User`, `Student`, `Teacher`, `Parent`, `ParentLink`, `Course`, `Enrollment`, `Assignment`, `Attempt`, `AttemptStep`, `StudentTopicMastery`, `TeacherAlert`.
2. Escribir policies usando `auth.uid()` y el custom claim `role` (`auth.jwt() -> 'app_metadata' ->> 'role'`). Ejemplos en `innova-clients/docs/SUPABASE_AUTH.md §6`.
3. **No** habilitar RLS en `_prisma_migrations` ni en tablas administrativas (`Subject`, `Curriculum`, `Unit`, `Topic`, `Exercise`, `ErrorTag`) — son read-only para usuarios y el backend escribe con `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS).
4. Test: con un JWT de `STUDENT`, `select * from "Attempt"` sólo devuelve filas de ese student.

**DoD:** RLS encendida en todas las tablas user-facing. Tests de policies pasan en CI.

---

## Backlog técnico

- [ ] Rotar AWS keys del v6 TODO (estaban en plaintext).
- [ ] Reemplazar `passport` por `@nestjs/jwt` si simplifica strategy.
- [ ] Implementar warm-up con `serverless-plugin-warmup` para Lambdas API (cold start <1s).
- [ ] `RateLimiterGuard` con Redis (Upstash free tier) en endpoints públicos.
- [ ] Logs estructurados con `nestjs-pino` + correlation id desde header.
