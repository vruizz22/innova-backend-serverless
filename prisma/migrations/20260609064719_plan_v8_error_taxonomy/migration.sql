/*
  Warnings:

  - The `severity` column on the `error_tags` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ErrorSource" AS ENUM ('CURATED', 'LLM_GENERATED', 'FIELD_REPORTED');

-- CreateEnum
CREATE TYPE "ErrorStatus" AS ENUM ('ACTIVE', 'DRAFT', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "ErrorSeverity" AS ENUM ('LOW', 'MED', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "attempt_steps" ADD COLUMN     "error_tag_id" TEXT;

-- AlterTable
ALTER TABLE "error_tags" ADD COLUMN     "applicable_grades" INTEGER[],
ADD COLUMN     "deprecated_by_id" TEXT,
ADD COLUMN     "diagnostic_hint" TEXT,
ADD COLUMN     "domain_id" TEXT,
ADD COLUMN     "evidence_required" TEXT[],
ADD COLUMN     "name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "references" TEXT[],
ADD COLUMN     "remediation" TEXT,
ADD COLUMN     "source" "ErrorSource" NOT NULL DEFAULT 'CURATED',
ADD COLUMN     "status" "ErrorStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "subdomain_code" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "severity",
ADD COLUMN     "severity" "ErrorSeverity" NOT NULL DEFAULT 'MED';

-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "domain_id" TEXT,
ADD COLUMN     "subdomain_id" TEXT;

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subdomains" (
    "id" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "subdomains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_oa_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,

    CONSTRAINT "official_oa_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_OfficialOACodeToTopic" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OfficialOACodeToTopic_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ExerciseTargetErrors" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ExerciseTargetErrors_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "domains_code_key" ON "domains"("code");

-- CreateIndex
CREATE INDEX "subdomains_domain_id_idx" ON "subdomains"("domain_id");

-- CreateIndex
CREATE UNIQUE INDEX "subdomains_domain_id_code_key" ON "subdomains"("domain_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "official_oa_codes_code_key" ON "official_oa_codes"("code");

-- CreateIndex
CREATE INDEX "official_oa_codes_grade_idx" ON "official_oa_codes"("grade");

-- CreateIndex
CREATE INDEX "_OfficialOACodeToTopic_B_index" ON "_OfficialOACodeToTopic"("B");

-- CreateIndex
CREATE INDEX "_ExerciseTargetErrors_B_index" ON "_ExerciseTargetErrors"("B");

-- CreateIndex
CREATE INDEX "attempt_steps_error_tag_id_idx" ON "attempt_steps"("error_tag_id");

-- CreateIndex
CREATE INDEX "error_tags_domain_id_status_idx" ON "error_tags"("domain_id", "status");

-- CreateIndex
CREATE INDEX "error_tags_source_idx" ON "error_tags"("source");

-- CreateIndex
CREATE INDEX "topics_subdomain_id_idx" ON "topics"("subdomain_id");

-- CreateIndex
CREATE INDEX "topics_domain_id_idx" ON "topics"("domain_id");

-- AddForeignKey
ALTER TABLE "subdomains" ADD CONSTRAINT "subdomains_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_subdomain_id_fkey" FOREIGN KEY ("subdomain_id") REFERENCES "subdomains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_steps" ADD CONSTRAINT "attempt_steps_error_tag_id_fkey" FOREIGN KEY ("error_tag_id") REFERENCES "error_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_tags" ADD CONSTRAINT "error_tags_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_tags" ADD CONSTRAINT "error_tags_deprecated_by_id_fkey" FOREIGN KEY ("deprecated_by_id") REFERENCES "error_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OfficialOACodeToTopic" ADD CONSTRAINT "_OfficialOACodeToTopic_A_fkey" FOREIGN KEY ("A") REFERENCES "official_oa_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OfficialOACodeToTopic" ADD CONSTRAINT "_OfficialOACodeToTopic_B_fkey" FOREIGN KEY ("B") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExerciseTargetErrors" ADD CONSTRAINT "_ExerciseTargetErrors_A_fkey" FOREIGN KEY ("A") REFERENCES "error_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExerciseTargetErrors" ADD CONSTRAINT "_ExerciseTargetErrors_B_fkey" FOREIGN KEY ("B") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
