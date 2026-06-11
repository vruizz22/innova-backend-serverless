-- CreateEnum
CREATE TYPE "GuideStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'EXTRACTION_FAILED', 'GENERATING_SOLUTIONS', 'GENERATION_FAILED', 'REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GuideQuestionStatus" AS ENUM ('EXTRACTED', 'NEEDS_REVIEW', 'APPROVED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "SolutionSource" AS ENUM ('PDF_PROVIDED', 'LLM_GENERATED', 'TEACHER_EDITED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('UPLOADED', 'TRANSCRIBING', 'GRADING', 'GRADED', 'FAILED');

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'EXERCISES';

-- CreateTable
CREATE TABLE "attempt_error_reports" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "error_tag_id" TEXT NOT NULL,
    "reported_by_id" TEXT,
    "comment" TEXT,
    "source" "ErrorSource" NOT NULL DEFAULT 'FIELD_REPORTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_error_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guides" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "created_by_teacher_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "GuideStatus" NOT NULL DEFAULT 'UPLOADED',
    "source_pdf_key" TEXT NOT NULL,
    "source_pdf_pages" INTEGER,
    "source_kind" TEXT,
    "latex_key" TEXT,
    "extraction_confidence" DOUBLE PRECISION,
    "extraction_model" TEXT,
    "failure_reason" TEXT,
    "question_count" INTEGER NOT NULL DEFAULT 0,
    "max_resubmissions" INTEGER NOT NULL DEFAULT 2,
    "show_solution_after_grade" BOOLEAN NOT NULL DEFAULT false,
    "assignment_id" TEXT,
    "due_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "trace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guide_questions" (
    "id" TEXT NOT NULL,
    "guide_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT,
    "statement_latex" TEXT NOT NULL,
    "statement_json" JSONB,
    "figure_keys" TEXT[],
    "provided_answer" TEXT,
    "provided_solution_latex" TEXT,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" "GuideQuestionStatus" NOT NULL DEFAULT 'EXTRACTED',
    "topic_id" TEXT,
    "domain_id" TEXT,
    "subdomain_id" TEXT,
    "topic_confidence" DOUBLE PRECISION,
    "topic_source" TEXT,
    "exercise_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guide_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guide_solutions" (
    "id" TEXT NOT NULL,
    "guide_question_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "source" "SolutionSource" NOT NULL,
    "final_answer" TEXT NOT NULL,
    "steps_json" JSONB NOT NULL,
    "solution_latex" TEXT,
    "expected_error_tags" TEXT[],
    "generated_by_model" TEXT,
    "prompt_version" TEXT,
    "validation_notes" TEXT,
    "created_by_teacher_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guide_solutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guide_submissions" (
    "id" TEXT NOT NULL,
    "guide_id" TEXT NOT NULL,
    "guide_question_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'UPLOADED',
    "photo_keys" TEXT[],
    "transcription_latex" TEXT,
    "transcription_json" JSONB,
    "transcription_confidence" DOUBLE PRECISION,
    "alignment_json" JSONB,
    "solution_version" INTEGER,
    "score" DOUBLE PRECISION,
    "is_correct" BOOLEAN,
    "attempt_id" TEXT,
    "override_error_tag_id" TEXT,
    "override_by_id" TEXT,
    "override_at" TIMESTAMP(3),
    "model_used" TEXT,
    "failure_reason" TEXT,
    "trace_id" TEXT NOT NULL,
    "graded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guide_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempt_error_reports_attempt_id_idx" ON "attempt_error_reports"("attempt_id");

-- CreateIndex
CREATE INDEX "attempt_error_reports_error_tag_id_idx" ON "attempt_error_reports"("error_tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "guides_assignment_id_key" ON "guides"("assignment_id");

-- CreateIndex
CREATE INDEX "guides_course_id_status_idx" ON "guides"("course_id", "status");

-- CreateIndex
CREATE INDEX "guides_created_by_teacher_id_idx" ON "guides"("created_by_teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "guide_questions_exercise_id_key" ON "guide_questions"("exercise_id");

-- CreateIndex
CREATE INDEX "guide_questions_topic_id_idx" ON "guide_questions"("topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "guide_questions_guide_id_sequence_key" ON "guide_questions"("guide_id", "sequence");

-- CreateIndex
CREATE INDEX "guide_solutions_guide_question_id_is_current_idx" ON "guide_solutions"("guide_question_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "guide_solutions_guide_question_id_version_key" ON "guide_solutions"("guide_question_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "guide_submissions_attempt_id_key" ON "guide_submissions"("attempt_id");

-- CreateIndex
CREATE INDEX "guide_submissions_guide_id_student_id_idx" ON "guide_submissions"("guide_id", "student_id");

-- CreateIndex
CREATE INDEX "guide_submissions_status_idx" ON "guide_submissions"("status");

-- CreateIndex
CREATE INDEX "guide_submissions_override_error_tag_id_idx" ON "guide_submissions"("override_error_tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "guide_submissions_guide_question_id_student_id_attempt_numb_key" ON "guide_submissions"("guide_question_id", "student_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "attempt_error_reports" ADD CONSTRAINT "attempt_error_reports_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_error_reports" ADD CONSTRAINT "attempt_error_reports_error_tag_id_fkey" FOREIGN KEY ("error_tag_id") REFERENCES "error_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_error_reports" ADD CONSTRAINT "attempt_error_reports_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guides" ADD CONSTRAINT "guides_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guides" ADD CONSTRAINT "guides_created_by_teacher_id_fkey" FOREIGN KEY ("created_by_teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guides" ADD CONSTRAINT "guides_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_questions" ADD CONSTRAINT "guide_questions_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "guides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_questions" ADD CONSTRAINT "guide_questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_questions" ADD CONSTRAINT "guide_questions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_solutions" ADD CONSTRAINT "guide_solutions_guide_question_id_fkey" FOREIGN KEY ("guide_question_id") REFERENCES "guide_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_submissions" ADD CONSTRAINT "guide_submissions_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "guides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_submissions" ADD CONSTRAINT "guide_submissions_guide_question_id_fkey" FOREIGN KEY ("guide_question_id") REFERENCES "guide_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_submissions" ADD CONSTRAINT "guide_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_submissions" ADD CONSTRAINT "guide_submissions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_submissions" ADD CONSTRAINT "guide_submissions_override_error_tag_id_fkey" FOREIGN KEY ("override_error_tag_id") REFERENCES "error_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;
