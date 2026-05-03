import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Post-Pivot v2.0 — OCRJob Schema
 *
 * Audit log of every OCR call (image S3 key, response, cost, confidence).
 * Collection: ocr_jobs (MongoDB)
 *
 * Example:
 * {
 *   upload_id: "upload-unique-id",
 *   student_id: "student-uuid",
 *   trace_id: "trace-uuid",
 *   s3_key: "uploads/student-uuid/image-uuid.jpg",
 *   s3_purge_at: ISODate(...) // 30 days after upload,
 *   primary_provider: "gemini",
 *   used_fallback: false,
 *   fallback_provider: null,
 *   ocr_result: {
 *     topic_hint: "subtraction_borrow",
 *     steps: [
 *       { rawText: "53", type: "initial_value", position: {x: 10, y: 20, w: 50, h: 30}, confidence: 0.98 },
 *       { rawText: "-26", type: "operation", position: {x: 10, y: 60, w: 50, h: 30}, confidence: 0.95 }
 *     ],
 *     final_answer: "27",
 *     overall_confidence: 0.96
 *   },
 *   cost_estimated_usd: 0.0015,
 *   duration_ms: 850,
 *   status: "completed",
 *   error_message: null,
 *   attempt_id: "attempt-abc123",
 *   created_at: ISODate(...),
 *   completed_at: ISODate(...)
 * }
 */

@Schema({ _id: false })
export class TextPosition {
  @Prop({ type: Number, required: true })
  x!: number;

  @Prop({ type: Number, required: true })
  y!: number;

  @Prop({ type: Number, required: true })
  w!: number;

  @Prop({ type: Number, required: true })
  h!: number;
}
export const TextPositionSchema = SchemaFactory.createForClass(TextPosition);

@Schema({ _id: false })
export class RecognizedStep {
  @Prop({ type: String, required: true })
  rawText!: string;

  @Prop({ type: String, required: true })
  type!: string;

  @Prop({ type: TextPositionSchema, required: true })
  position!: TextPosition;

  @Prop({ type: Number, required: true, min: 0, max: 1 })
  confidence!: number;
}
export const RecognizedStepSchema =
  SchemaFactory.createForClass(RecognizedStep);

@Schema({ _id: false })
export class OCRResult {
  @Prop({ type: String })
  topic_hint?: string;

  @Prop({ type: [RecognizedStepSchema] })
  steps?: RecognizedStep[];

  @Prop({ type: String })
  final_answer?: string;

  @Prop({ type: Number, min: 0, max: 1 })
  overall_confidence?: number;
}
export const OCRResultSchema = SchemaFactory.createForClass(OCRResult);

export type OCRJobDocument = OCRJob & Document;

@Schema({ timestamps: true, collection: 'ocr_jobs' })
export class OCRJob {
  @Prop({ type: String, required: true, index: true, unique: true })
  upload_id!: string;

  @Prop({ type: String, required: true, index: true })
  student_id!: string;

  @Prop({ type: String, required: true })
  trace_id!: string;

  @Prop({ type: String, required: true })
  s3_key!: string;

  @Prop({ type: Date })
  s3_purge_at?: Date;

  @Prop({ type: String, required: true })
  primary_provider!: string;

  @Prop({ type: Boolean, default: false })
  used_fallback?: boolean;

  @Prop({ type: String })
  fallback_provider?: string;

  @Prop({ type: OCRResultSchema })
  ocr_result?: OCRResult;

  @Prop({ type: Number })
  cost_estimated_usd?: number;

  @Prop({ type: Number })
  duration_ms?: number;

  @Prop({
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed', 'low_confidence_review'],
    index: true,
  })
  status!: string;

  @Prop({ type: String })
  error_message?: string;

  @Prop({ type: String })
  attempt_id?: string;

  @Prop({ type: Date })
  completed_at?: Date;
}

export const OCRJobSchema = SchemaFactory.createForClass(OCRJob);

// Create indexes for efficient querying
OCRJobSchema.index({ student_id: 1 });
OCRJobSchema.index({ status: 1 });
OCRJobSchema.index({ upload_id: 1 });
OCRJobSchema.index({ created_at: 1 });
