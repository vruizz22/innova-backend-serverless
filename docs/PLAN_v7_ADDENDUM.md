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

## Sprint S2 (M8 — Supabase JWT)

1. Crear `src/modules/auth/supabase-jwt.strategy.ts`:
   - `passport-jwt` con `jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken()`.
   - `secretOrKeyProvider`: si Supabase soporta JWKS en el plan free, usar `passport-jwt-jwks-rsa`; si no, HS256 con `process.env.SUPABASE_JWT_SECRET`.
   - `validate(payload)`: `payload.sub` → buscar `User.supabase_uid`, fallback a auto-link por email.
2. Reemplazar `CognitoGuard` por `SupabaseAuthGuard` en módulos. Mantener `@Roles(...)` decorator (sólo cambia la fuente del role: `payload.app_metadata.role`).
3. Setup Postgres trigger en Supabase (vía SQL editor) para setear `role` en `auth.users.raw_app_meta_data` en signup:
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
4. Doc: `docs/auth-integration-supabase.md` reemplaza `auth-integration.md`. Archivar el viejo como `docs/archive/auth-integration-cognito.md`.
5. Borrar (M9): `src/modules/auth/cognito-jwt.strategy.ts`, `src/adapters/cognito/`.

**DoD:** `curl -H "Authorization: Bearer <supabase_jwt>" https://api.superprofes.app/auth/me` retorna `{ id, email, role }` con el `id` ligado en Postgres.

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

## Sprint S6 (M12 — Neon → Supabase Postgres)

1. Backup Neon: `pg_dump $NEON_DATABASE_URL -Fc > neon-snapshot.dump`.
2. Restore Supabase: `pg_restore --no-owner --no-privileges -d $SUPABASE_DATABASE_URL neon-snapshot.dump`.
3. Validar `_prisma_migrations` se preservó.
4. Switch `DATABASE_URL` en Lambda env (backend + ai-engine).
5. Neon en read-only por 7 días (rollback).
6. Habilitar RLS por tabla user-facing (no en `_prisma_migrations`, no en tablas internas).

Comando Victor:
```bash
PGPASSWORD=... pg_dump "$NEON_DATABASE_URL" -Fc -f neon-snapshot.dump
PGPASSWORD=... pg_restore --no-owner --no-privileges \
  -d "$SUPABASE_DATABASE_URL" neon-snapshot.dump
```

**DoD:** prod corre contra Supabase sin errores 7 días seguidos. Neon read-only.

---

## Backlog técnico

- [ ] Rotar AWS keys del v6 TODO (estaban en plaintext).
- [ ] Reemplazar `passport` por `@nestjs/jwt` si simplifica strategy.
- [ ] Implementar warm-up con `serverless-plugin-warmup` para Lambdas API (cold start <1s).
- [ ] `RateLimiterGuard` con Redis (Upstash free tier) en endpoints públicos.
- [ ] Logs estructurados con `nestjs-pino` + correlation id desde header.
