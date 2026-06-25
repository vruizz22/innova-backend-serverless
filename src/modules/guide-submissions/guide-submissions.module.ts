import { Module } from '@nestjs/common';
import { GuideSubmissionsController } from '@modules/guide-submissions/guide-submissions.controller';
import { GuideSubmissionsService } from '@modules/guide-submissions/guide-submissions.service';
import { S3Adapter } from '@adapters/s3.adapter';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { MathOCROrchestrator } from '@adapters/math-ocr/math-ocr.orchestrator';
import { GeminiVisionAdapter } from '@adapters/math-ocr/gemini-vision.adapter';
import { ClaudeVisionAdapter } from '@adapters/math-ocr/claude-vision.adapter';

@Module({
  controllers: [GuideSubmissionsController],
  providers: [
    GuideSubmissionsService,
    S3Adapter,
    SqsAdapter,
    MathOCROrchestrator,
    GeminiVisionAdapter,
    ClaudeVisionAdapter,
  ],
  exports: [GuideSubmissionsService],
})
export class GuideSubmissionsModule {}
