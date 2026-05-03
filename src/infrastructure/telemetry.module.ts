import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AttemptEvent,
  AttemptEventSchema,
} from '@infrastructure/database/schemas/attempt-event.schema';
import {
  LLMClassificationJob,
  LLMClassificationJobSchema,
} from '@infrastructure/database/schemas/llm-classification-job.schema';
import {
  OCRJob,
  OCRJobSchema,
} from '@infrastructure/database/schemas/ocr-job.schema';

/**
 * Telemetry Module (Post-Pivot v2.0)
 *
 * Registers MongoDB schemas for telemetry collections:
 * - attempt_events: keystroke-level telemetry for student math attempts
 * - llm_classification_jobs: audit log of LLM classification calls
 * - ocr_jobs: audit log of OCR calls with confidence metrics
 *
 * All collections are high-throughput, NO PII, and implement
 * S3 archival lifecycle policies (30 days).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AttemptEvent.name, schema: AttemptEventSchema },
      { name: LLMClassificationJob.name, schema: LLMClassificationJobSchema },
      { name: OCRJob.name, schema: OCRJobSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class TelemetryModule {}
