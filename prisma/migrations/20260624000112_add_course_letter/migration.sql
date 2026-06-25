/*
  Warnings:

  - You are about to drop the column `cacheCreationInputTokens` on the `cost_events` table. All the data in the column will be lost.
  - You are about to drop the column `cacheReadInputTokens` on the `cost_events` table. All the data in the column will be lost.
  - You are about to drop the column `costUsd` on the `cost_events` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `cost_events` table. All the data in the column will be lost.
  - You are about to drop the column `inputTokens` on the `cost_events` table. All the data in the column will be lost.
  - You are about to drop the column `outputTokens` on the `cost_events` table. All the data in the column will be lost.
  - You are about to drop the column `traceId` on the `cost_events` table. All the data in the column will be lost.
  - Added the required column `cost_usd` to the `cost_events` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "cost_events_createdAt_idx";

-- DropIndex
DROP INDEX "cost_events_model_createdAt_idx";

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "cost_events" DROP COLUMN "cacheCreationInputTokens",
DROP COLUMN "cacheReadInputTokens",
DROP COLUMN "costUsd",
DROP COLUMN "createdAt",
DROP COLUMN "inputTokens",
DROP COLUMN "outputTokens",
DROP COLUMN "traceId",
ADD COLUMN     "cache_creation_input_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cache_read_input_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cost_usd" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "input_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "output_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trace_id" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "letter" TEXT;

-- CreateIndex
CREATE INDEX "cost_events_created_at_idx" ON "cost_events"("created_at");

-- CreateIndex
CREATE INDEX "cost_events_model_created_at_idx" ON "cost_events"("model", "created_at");
