-- =====================================================================
-- Migration: rls_policies (M12 — Sprint S6)
-- Enables Row Level Security on all user-facing tables.
-- Runs in CI against vanilla Postgres (no auth.* functions) — all
-- policy creation is guarded by checking for the Supabase auth schema.
-- In Supabase prod, auth.uid() and auth.jwt() exist → policies apply.
-- The backend always uses SUPABASE_SERVICE_ROLE_KEY → bypasses RLS.
-- =====================================================================

-- Enable RLS on user-facing tables (safe in any Postgres)
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teachers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignment_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attempt_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_topic_mastery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_alerts" ENABLE ROW LEVEL SECURITY;

-- Create helper functions and policies ONLY if auth schema exists (Supabase env)
DO $$
DECLARE
  auth_schema_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth'
  ) INTO auth_schema_exists;

  IF NOT auth_schema_exists THEN
    RAISE NOTICE 'auth schema not found — skipping Supabase RLS policies (CI environment)';
    RETURN;
  END IF;

  -- ─── Helper functions ───────────────────────────────────────────────

  -- NOTE: users.id is Prisma `String @default(uuid())` → Postgres `text`, NOT native
  -- `uuid`. So this function returns text (and all *_id FKs it is compared against are
  -- text too). Declaring `RETURNS uuid` here triggers 42P13 return-type-mismatch.
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.current_prisma_user_id()
    RETURNS text LANGUAGE sql STABLE AS
    'SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text';
  $fn$;

  -- NOTE: the auth schema exists locally and auth.uid() works, but auth.jwt() does NOT
  -- exist in every Supabase CLI Postgres version (→ 42883). auth.jwt() is just sugar over
  -- the `request.jwt.claims` GUC, so read it directly — equivalent and version-independent.
  -- Nested $body$ dollar-quoting avoids escaping the single quotes in the JSON paths.
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.current_user_role()
    RETURNS text LANGUAGE sql STABLE AS $body$
      SELECT COALESCE(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role',
        'student')
    $body$;
  $fn$;

  -- ─── users ─────────────────────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "users: own row" ON public.users
      FOR ALL USING (supabase_uid = auth.uid()::text)
  $fn$;

  -- ─── teachers ──────────────────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "teachers: own profile" ON public.teachers
      FOR ALL
      USING (user_id = public.current_prisma_user_id())
  $fn$;

  EXECUTE $fn$
    CREATE POLICY "teachers: read by enrolled students" ON public.teachers
      FOR SELECT
      USING (
        public.current_user_role() IN ('student', 'parent')
        AND EXISTS (
          SELECT 1 FROM public.course_teachers ct
          JOIN public.enrollments e ON e.course_id = ct.course_id
          WHERE ct.teacher_id = teachers.id
            AND e.student_id IN (
              SELECT id FROM public.students WHERE user_id = public.current_prisma_user_id()
            )
        )
      )
  $fn$;

  -- ─── students ──────────────────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "students: own profile" ON public.students
      FOR ALL USING (user_id = public.current_prisma_user_id())
  $fn$;

  EXECUTE $fn$
    CREATE POLICY "students: teacher can read enrolled" ON public.students
      FOR SELECT
      USING (
        public.current_user_role() = 'teacher'
        AND EXISTS (
          SELECT 1 FROM public.enrollments e
          JOIN public.course_teachers ct ON ct.course_id = e.course_id
          WHERE e.student_id = students.id
            AND ct.teacher_id IN (
              SELECT id FROM public.teachers WHERE user_id = public.current_prisma_user_id()
            )
        )
      )
  $fn$;

  EXECUTE $fn$
    CREATE POLICY "students: parent can read linked" ON public.students
      FOR SELECT
      USING (
        public.current_user_role() = 'parent'
        AND EXISTS (
          SELECT 1 FROM public.parent_links pl
          WHERE pl.student_id = students.id
            AND pl.parent_id IN (
              SELECT id FROM public.parents WHERE user_id = public.current_prisma_user_id()
            )
        )
      )
  $fn$;

  -- ─── parents ───────────────────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "parents: own profile" ON public.parents
      FOR ALL USING (user_id = public.current_prisma_user_id())
  $fn$;

  -- ─── parent_links ──────────────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "parent_links: own links" ON public.parent_links
      FOR ALL
      USING (
        parent_id IN (SELECT id FROM public.parents WHERE user_id = public.current_prisma_user_id())
        OR student_id IN (SELECT id FROM public.students WHERE user_id = public.current_prisma_user_id())
      )
  $fn$;

  -- ─── courses ───────────────────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "courses: teacher can manage own" ON public.courses
      FOR ALL
      USING (
        public.current_user_role() = 'teacher'
        AND EXISTS (
          SELECT 1 FROM public.course_teachers ct
          WHERE ct.course_id = courses.id
            AND ct.teacher_id IN (
              SELECT id FROM public.teachers WHERE user_id = public.current_prisma_user_id()
            )
        )
      )
  $fn$;

  EXECUTE $fn$
    CREATE POLICY "courses: student can read enrolled" ON public.courses
      FOR SELECT
      USING (
        public.current_user_role() IN ('student', 'parent')
        AND EXISTS (
          SELECT 1 FROM public.enrollments e
          WHERE e.course_id = courses.id
            AND e.student_id IN (
              SELECT id FROM public.students WHERE user_id = public.current_prisma_user_id()
            )
        )
      )
  $fn$;

  -- ─── enrollments ───────────────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "enrollments: student own" ON public.enrollments
      FOR SELECT
      USING (
        student_id IN (SELECT id FROM public.students WHERE user_id = public.current_prisma_user_id())
      )
  $fn$;

  EXECUTE $fn$
    CREATE POLICY "enrollments: teacher reads course enrollments" ON public.enrollments
      FOR SELECT
      USING (
        public.current_user_role() = 'teacher'
        AND EXISTS (
          SELECT 1 FROM public.course_teachers ct
          WHERE ct.course_id = enrollments.course_id
            AND ct.teacher_id IN (
              SELECT id FROM public.teachers WHERE user_id = public.current_prisma_user_id()
            )
        )
      )
  $fn$;

  -- ─── assignments ───────────────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "assignments: teacher can manage own" ON public.assignments
      FOR ALL
      USING (
        created_by_teacher_id IN (
          SELECT id FROM public.teachers WHERE user_id = public.current_prisma_user_id()
        )
      )
  $fn$;

  EXECUTE $fn$
    CREATE POLICY "assignments: student can read targeted" ON public.assignments
      FOR SELECT
      USING (
        public.current_user_role() IN ('student', 'parent')
        AND (
          course_id IN (
            SELECT course_id FROM public.enrollments
            WHERE student_id IN (SELECT id FROM public.students WHERE user_id = public.current_prisma_user_id())
          )
          OR id IN (
            SELECT assignment_id FROM public.assignment_targets
            WHERE student_id IN (SELECT id FROM public.students WHERE user_id = public.current_prisma_user_id())
          )
        )
      )
  $fn$;

  -- ─── assignment_targets ────────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "assignment_targets: student own" ON public.assignment_targets
      FOR SELECT
      USING (
        student_id IN (SELECT id FROM public.students WHERE user_id = public.current_prisma_user_id())
      )
  $fn$;

  -- ─── attempts ──────────────────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "attempts: student own" ON public.attempts
      FOR ALL
      USING (
        student_id IN (SELECT id FROM public.students WHERE user_id = public.current_prisma_user_id())
      )
  $fn$;

  EXECUTE $fn$
    CREATE POLICY "attempts: teacher reads course attempts" ON public.attempts
      FOR SELECT
      USING (
        public.current_user_role() = 'teacher'
        AND course_id IN (
          SELECT ct.course_id FROM public.course_teachers ct
          WHERE ct.teacher_id IN (SELECT id FROM public.teachers WHERE user_id = public.current_prisma_user_id())
        )
      )
  $fn$;

  EXECUTE $fn$
    CREATE POLICY "attempts: parent reads linked student" ON public.attempts
      FOR SELECT
      USING (
        public.current_user_role() = 'parent'
        AND student_id IN (
          SELECT pl.student_id FROM public.parent_links pl
          WHERE pl.parent_id IN (SELECT id FROM public.parents WHERE user_id = public.current_prisma_user_id())
        )
      )
  $fn$;

  -- ─── attempt_steps ─────────────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "attempt_steps: via attempt visibility" ON public.attempt_steps
      FOR SELECT
      USING (
        attempt_id IN (SELECT id FROM public.attempts)
      )
  $fn$;

  -- ─── student_topic_mastery ─────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "mastery: student own" ON public.student_topic_mastery
      FOR ALL
      USING (
        student_id IN (SELECT id FROM public.students WHERE user_id = public.current_prisma_user_id())
      )
  $fn$;

  EXECUTE $fn$
    CREATE POLICY "mastery: teacher reads course" ON public.student_topic_mastery
      FOR SELECT
      USING (
        public.current_user_role() = 'teacher'
        AND student_id IN (
          SELECT e.student_id FROM public.enrollments e
          JOIN public.course_teachers ct ON ct.course_id = e.course_id
          WHERE ct.teacher_id IN (SELECT id FROM public.teachers WHERE user_id = public.current_prisma_user_id())
        )
      )
  $fn$;

  EXECUTE $fn$
    CREATE POLICY "mastery: parent reads linked student" ON public.student_topic_mastery
      FOR SELECT
      USING (
        public.current_user_role() = 'parent'
        AND student_id IN (
          SELECT pl.student_id FROM public.parent_links pl
          WHERE pl.parent_id IN (SELECT id FROM public.parents WHERE user_id = public.current_prisma_user_id())
        )
      )
  $fn$;

  -- ─── teacher_alerts ────────────────────────────────────────────────
  EXECUTE $fn$
    CREATE POLICY "alerts: teacher own" ON public.teacher_alerts
      FOR ALL
      USING (
        teacher_id IN (SELECT id FROM public.teachers WHERE user_id = public.current_prisma_user_id())
      )
  $fn$;

  RAISE NOTICE 'Supabase RLS policies applied successfully';
END $$;
