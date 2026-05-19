/*
  Warnings:

  - You are about to drop the `Attempt` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Classroom` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ClassroomInvite` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Item` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Parent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ParentLink` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PracticeAssignment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `School` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Skill` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SkillBKTParams` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Student` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StudentSkillMastery` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Teacher` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TeacherAlert` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TeacherClassroom` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Attempt" DROP CONSTRAINT "Attempt_itemId_fkey";

-- DropForeignKey
ALTER TABLE "Attempt" DROP CONSTRAINT "Attempt_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Classroom" DROP CONSTRAINT "Classroom_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "ClassroomInvite" DROP CONSTRAINT "ClassroomInvite_classroomId_fkey";

-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_skillId_fkey";

-- DropForeignKey
ALTER TABLE "Parent" DROP CONSTRAINT "Parent_userId_fkey";

-- DropForeignKey
ALTER TABLE "ParentLink" DROP CONSTRAINT "ParentLink_parentId_fkey";

-- DropForeignKey
ALTER TABLE "ParentLink" DROP CONSTRAINT "ParentLink_studentId_fkey";

-- DropForeignKey
ALTER TABLE "PracticeAssignment" DROP CONSTRAINT "PracticeAssignment_studentId_fkey";

-- DropForeignKey
ALTER TABLE "SkillBKTParams" DROP CONSTRAINT "SkillBKTParams_skillId_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_classroomId_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_userId_fkey";

-- DropForeignKey
ALTER TABLE "StudentSkillMastery" DROP CONSTRAINT "StudentSkillMastery_skillId_fkey";

-- DropForeignKey
ALTER TABLE "StudentSkillMastery" DROP CONSTRAINT "StudentSkillMastery_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Teacher" DROP CONSTRAINT "Teacher_userId_fkey";

-- DropForeignKey
ALTER TABLE "TeacherAlert" DROP CONSTRAINT "TeacherAlert_teacherId_fkey";

-- DropForeignKey
ALTER TABLE "TeacherClassroom" DROP CONSTRAINT "TeacherClassroom_classroomId_fkey";

-- DropForeignKey
ALTER TABLE "TeacherClassroom" DROP CONSTRAINT "TeacherClassroom_teacherId_fkey";

-- DropTable
DROP TABLE "Attempt";

-- DropTable
DROP TABLE "Classroom";

-- DropTable
DROP TABLE "ClassroomInvite";

-- DropTable
DROP TABLE "Item";

-- DropTable
DROP TABLE "Parent";

-- DropTable
DROP TABLE "ParentLink";

-- DropTable
DROP TABLE "PracticeAssignment";

-- DropTable
DROP TABLE "School";

-- DropTable
DROP TABLE "Skill";

-- DropTable
DROP TABLE "SkillBKTParams";

-- DropTable
DROP TABLE "Student";

-- DropTable
DROP TABLE "StudentSkillMastery";

-- DropTable
DROP TABLE "Teacher";

-- DropTable
DROP TABLE "TeacherAlert";

-- DropTable
DROP TABLE "TeacherClassroom";

-- DropTable
DROP TABLE "User";

-- DropEnum
DROP TYPE "ClassifierSource";

-- DropEnum
DROP TYPE "ErrorType";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "supabase_uid" TEXT,
    "email" TEXT NOT NULL,
    "auth_role" TEXT,
    "full_name" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'es-CL',
    "password_hash" TEXT,
    "password_reset_token_hash" TEXT,
    "password_reset_expires_at" TIMESTAMP(3),
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "external_email" TEXT,
    "display_name" TEXT NOT NULL,
    "birth_year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_links" (
    "parent_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "parent_links_pkey" PRIMARY KEY ("parent_id","student_id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CL',
    "billing_email" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rbd" TEXT,
    "city" TEXT,
    "region" TEXT,
    "domain" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade_level" INTEGER NOT NULL,
    "academic_year" INTEGER NOT NULL,
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_teachers" (
    "course_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'LEAD',
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_teachers_pkey" PRIMARY KEY ("course_id","teacher_id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_invites" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "max_uses" INTEGER,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classroom_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es',

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curricula" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CL',
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "grade_level" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bkt_p_l0" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "bkt_p_transit" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "bkt_p_slip" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "bkt_p_guess" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "bkt_calibrated_at" TIMESTAMP(3),

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_prerequisites" (
    "topic_id" TEXT NOT NULL,
    "prerequisite_topic_id" TEXT NOT NULL,

    CONSTRAINT "topic_prerequisites_pkey" PRIMARY KEY ("topic_id","prerequisite_topic_id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "created_by_teacher_id" TEXT,
    "content" JSONB NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es',
    "irt_a" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "irt_b" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "irt_calibrated_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "course_id" TEXT,
    "created_by_teacher_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_targets" (
    "assignment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "assignment_targets_pkey" PRIMARY KEY ("assignment_id","student_id")
);

-- CreateTable
CREATE TABLE "assignment_exercises" (
    "assignment_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "assignment_exercises_pkey" PRIMARY KEY ("assignment_id","sequence")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "exercise_id" TEXT,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT,
    "input_mode" TEXT NOT NULL DEFAULT 'DIGITAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "final_answer" TEXT,
    "is_correct" BOOLEAN NOT NULL,
    "classifier_source" TEXT NOT NULL DEFAULT 'RULE',
    "error_tag_id" TEXT,
    "confidence" DOUBLE PRECISION,
    "ocr_confidence" DOUBLE PRECISION,
    "ocr_provider" TEXT,
    "llm_job_id" TEXT,
    "trace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classified_at" TIMESTAMP(3),

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_steps" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "step_index" INTEGER NOT NULL,
    "content_latex" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "is_correct" BOOLEAN,
    "error_subtag" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_tags" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "topic_scope" TEXT,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_topic_mastery" (
    "student_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "p_known" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "p_slip" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "p_guess" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "p_transit" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "attempts_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "trend_7d" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_topic_mastery_pkey" PRIMARY KEY ("student_id","topic_id")
);

-- CreateTable
CREATE TABLE "teacher_alerts" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "topic_id" TEXT,
    "student_id" TEXT,
    "alert_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MED',
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,

    CONSTRAINT "teacher_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_integrations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "cadence" TEXT NOT NULL DEFAULT 'MANUAL',
    "config" JSONB NOT NULL DEFAULT '{}',
    "last_sync_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "created_by_teacher_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_id_maps" (
    "id" TEXT NOT NULL,
    "school_integration_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_entity_type" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "internal_entity_type" TEXT NOT NULL,
    "internal_entity_id" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "external_id_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_supabase_uid_key" ON "users"("supabase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_user_id_key" ON "teachers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "parents_user_id_key" ON "parents"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "schools_rbd_key" ON "schools"("rbd");

-- CreateIndex
CREATE INDEX "schools_organization_id_idx" ON "schools"("organization_id");

-- CreateIndex
CREATE INDEX "schools_domain_idx" ON "schools"("domain");

-- CreateIndex
CREATE INDEX "courses_school_id_academic_year_idx" ON "courses"("school_id", "academic_year");

-- CreateIndex
CREATE INDEX "courses_subject_id_idx" ON "courses"("subject_id");

-- CreateIndex
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_course_id_student_id_key" ON "enrollments"("course_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_invites_code_key" ON "classroom_invites"("code");

-- CreateIndex
CREATE INDEX "classroom_invites_code_idx" ON "classroom_invites"("code");

-- CreateIndex
CREATE INDEX "classroom_invites_course_id_idx" ON "classroom_invites"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "curricula_subject_id_country_version_key" ON "curricula"("subject_id", "country", "version");

-- CreateIndex
CREATE INDEX "units_curriculum_id_grade_level_sequence_idx" ON "units"("curriculum_id", "grade_level", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "units_curriculum_id_code_key" ON "units"("curriculum_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "topics_unit_id_code_key" ON "topics"("unit_id", "code");

-- CreateIndex
CREATE INDEX "exercises_topic_id_source_idx" ON "exercises"("topic_id", "source");

-- CreateIndex
CREATE INDEX "exercises_topic_id_status_idx" ON "exercises"("topic_id", "status");

-- CreateIndex
CREATE INDEX "assignments_course_id_idx" ON "assignments"("course_id");

-- CreateIndex
CREATE INDEX "assignments_created_by_teacher_id_idx" ON "assignments"("created_by_teacher_id");

-- CreateIndex
CREATE INDEX "assignment_targets_student_id_idx" ON "assignment_targets"("student_id");

-- CreateIndex
CREATE INDEX "attempts_student_id_idx" ON "attempts"("student_id");

-- CreateIndex
CREATE INDEX "attempts_course_id_idx" ON "attempts"("course_id");

-- CreateIndex
CREATE INDEX "attempts_exercise_id_created_at_idx" ON "attempts"("exercise_id", "created_at");

-- CreateIndex
CREATE INDEX "attempts_error_tag_id_idx" ON "attempts"("error_tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_steps_attempt_id_step_index_key" ON "attempt_steps"("attempt_id", "step_index");

-- CreateIndex
CREATE UNIQUE INDEX "error_tags_code_key" ON "error_tags"("code");

-- CreateIndex
CREATE INDEX "student_topic_mastery_topic_id_idx" ON "student_topic_mastery"("topic_id");

-- CreateIndex
CREATE INDEX "student_topic_mastery_last_attempt_at_idx" ON "student_topic_mastery"("last_attempt_at");

-- CreateIndex
CREATE INDEX "teacher_alerts_teacher_id_resolved_at_idx" ON "teacher_alerts"("teacher_id", "resolved_at");

-- CreateIndex
CREATE INDEX "teacher_alerts_course_id_alert_type_created_at_idx" ON "teacher_alerts"("course_id", "alert_type", "created_at");

-- CreateIndex
CREATE INDEX "school_integrations_status_idx" ON "school_integrations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "school_integrations_school_id_provider_key" ON "school_integrations"("school_id", "provider");

-- CreateIndex
CREATE INDEX "external_id_maps_internal_entity_type_internal_entity_id_idx" ON "external_id_maps"("internal_entity_type", "internal_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_id_maps_provider_external_entity_type_external_id__key" ON "external_id_maps"("provider", "external_entity_type", "external_id", "school_integration_id");

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_teachers" ADD CONSTRAINT "course_teachers_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_teachers" ADD CONSTRAINT "course_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_invites" ADD CONSTRAINT "classroom_invites_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_prerequisites" ADD CONSTRAINT "topic_prerequisites_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_prerequisites" ADD CONSTRAINT "topic_prerequisites_prerequisite_topic_id_fkey" FOREIGN KEY ("prerequisite_topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_teacher_id_fkey" FOREIGN KEY ("created_by_teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_exercises" ADD CONSTRAINT "assignment_exercises_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_exercises" ADD CONSTRAINT "assignment_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_error_tag_id_fkey" FOREIGN KEY ("error_tag_id") REFERENCES "error_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_steps" ADD CONSTRAINT "attempt_steps_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_topic_mastery" ADD CONSTRAINT "student_topic_mastery_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_topic_mastery" ADD CONSTRAINT "student_topic_mastery_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_alerts" ADD CONSTRAINT "teacher_alerts_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_alerts" ADD CONSTRAINT "teacher_alerts_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_alerts" ADD CONSTRAINT "teacher_alerts_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_integrations" ADD CONSTRAINT "school_integrations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_integrations" ADD CONSTRAINT "school_integrations_created_by_teacher_id_fkey" FOREIGN KEY ("created_by_teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_id_maps" ADD CONSTRAINT "external_id_maps_school_integration_id_fkey" FOREIGN KEY ("school_integration_id") REFERENCES "school_integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
