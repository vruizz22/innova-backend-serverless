-- CreateTable
CREATE TABLE "cost_events" (
    "id" TEXT NOT NULL,
    "worker" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationInputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadInputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "traceId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_events_createdAt_idx" ON "cost_events"("createdAt");

-- CreateIndex
CREATE INDEX "cost_events_model_createdAt_idx" ON "cost_events"("model", "createdAt");
