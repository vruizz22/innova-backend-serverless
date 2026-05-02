import { Module } from '@nestjs/common';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { MasteryModule } from '@modules/mastery/mastery.module';
import { AttemptsController } from '@modules/attempts/attempts.controller';
import { AttemptsService } from '@modules/attempts/attempts.service';
import { RuleEngineService } from '@modules/attempts/rule-engine/engine.service';
import { RuleEngineFactory } from '@modules/attempts/rule-engine/factory';
import { SubtractionBorrowStrategy } from '@modules/attempts/rule-engine/strategies/subtraction-borrow.strategy';
import { MathOCROrchestrator } from '@adapters/math-ocr/math-ocr.orchestrator';
import { GeminiVisionAdapter } from '@adapters/math-ocr/gemini-vision.adapter';
import { ClaudeVisionAdapter } from '@adapters/math-ocr/claude-vision.adapter';

@Module({
  imports: [MasteryModule],
  controllers: [AttemptsController],
  providers: [
    AttemptsService,
    RuleEngineService,
    RuleEngineFactory,
    SubtractionBorrowStrategy,
    SqsAdapter,
    MathOCROrchestrator,
    GeminiVisionAdapter,
    ClaudeVisionAdapter,
  ],
  exports: [AttemptsService],
})
export class AttemptsModule {}
