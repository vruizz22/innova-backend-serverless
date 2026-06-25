import { Module } from '@nestjs/common';

import { ClaudeVisionAdapter } from '@adapters/math-ocr/claude-vision.adapter';
import { GeminiVisionAdapter } from '@adapters/math-ocr/gemini-vision.adapter';
import { MathOCROrchestrator } from '@adapters/math-ocr/math-ocr.orchestrator';
import { S3Adapter } from '@adapters/s3.adapter';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { AttemptsController } from '@modules/attempts/attempts.controller';
import { AttemptsService } from '@modules/attempts/attempts.service';
import { RuleEngineFactory } from '@modules/attempts/rule-engine/factory';
import { RuleEngineService } from '@modules/attempts/rule-engine/engine.service';
import { MasteryModule } from '@modules/mastery/mastery.module';
import { AttemptReprocessWorker } from '@infrastructure/workers/attempt-reprocess.worker';

// Strategies are instantiated inside RuleEngineFactory REGISTRY — not injected via DI.
// To add a new strategy for v8, register it in factory.ts REGISTRY only.

@Module({
  imports: [MasteryModule],
  controllers: [AttemptsController],
  providers: [
    AttemptsService,
    RuleEngineService,
    RuleEngineFactory,
    S3Adapter,
    SqsAdapter,
    MathOCROrchestrator,
    GeminiVisionAdapter,
    ClaudeVisionAdapter,
    AttemptReprocessWorker,
  ],
  exports: [AttemptsService, AttemptReprocessWorker],
})
export class AttemptsModule {}
