import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Post-Pivot v2.0 — LLMClassificationJob Schema
 *
 * Audit log of every LLM classification call (request, response, cost, metrics).
 * Collection: llm_classification_jobs (MongoDB)
 *
 * Example:
 * {
 *   attempt_ids: ["attempt-123", "attempt-124"],
 *   trace_id: "trace-uuid",
 *   model: "claude-haiku-4-5-20251001",
 *   status: "completed",
 *   request_meta: {
 *     cached_tokens: 1200,
 *     input_tokens: 450,
 *     output_tokens: 120,
 *     tool_choice: {...},
 *     cache_hit: true
 *   },
 *   response_meta: {
 *     classifications: [
 *       {
 *         attempt_id: "attempt-123",
 *         error_type: "borrow_omitted_tens",
 *         evidence: "Student wrote 33, correct answer 27. No borrow operation visible.",
 *         confidence: 0.92
 *       }
 *     ],
 *     raw_response_id: "msg_123abc"
 *   },
 *   cost_estimated_usd: 0.0042,
 *   duration_ms: 1250,
 *   retries: 0,
 *   error_message: null,
 *   created_at: ISODate(...),
 *   completed_at: ISODate(...)
 * }
 */

@Schema({ _id: false })
export class RequestMeta {
  @Prop({ type: Number })
  cached_tokens?: number;

  @Prop({ type: Number, required: true })
  input_tokens!: number;

  @Prop({ type: Number, required: true })
  output_tokens!: number;

  @Prop({ type: Object })
  tool_choice?: Record<string, unknown>;

  @Prop({ type: Boolean, default: false })
  cache_hit?: boolean;
}
export const RequestMetaSchema = SchemaFactory.createForClass(RequestMeta);

@Schema({ _id: false })
export class Classification {
  @Prop({ type: String, required: true })
  attempt_id!: string;

  @Prop({ type: String, required: true })
  error_type!: string;

  @Prop({ type: String })
  evidence?: string;

  @Prop({ type: Number, required: true, min: 0, max: 1 })
  confidence!: number;
}
export const ClassificationSchema =
  SchemaFactory.createForClass(Classification);

@Schema({ _id: false })
export class ResponseMeta {
  @Prop({ type: [ClassificationSchema], required: true })
  classifications!: Classification[];

  @Prop({ type: String })
  raw_response_id?: string;
}
export const ResponseMetaSchema = SchemaFactory.createForClass(ResponseMeta);

export type LLMClassificationJobDocument = LLMClassificationJob & Document;

@Schema({ timestamps: true, collection: 'llm_classification_jobs' })
export class LLMClassificationJob {
  @Prop({ type: [String], required: true })
  attempt_ids!: string[];

  @Prop({ type: String, required: true, index: true })
  trace_id!: string;

  @Prop({ type: String, required: true })
  model!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed', 'dlq'],
    index: true,
  })
  status!: string;

  @Prop({ type: RequestMetaSchema })
  request_meta?: RequestMeta;

  @Prop({ type: ResponseMetaSchema })
  response_meta?: ResponseMeta;

  @Prop({ type: Number })
  cost_estimated_usd?: number;

  @Prop({ type: Number })
  duration_ms?: number;

  @Prop({ type: Number, default: 0 })
  retries?: number;

  @Prop({ type: String })
  error_message?: string;

  @Prop({ type: Date })
  completed_at?: Date;
}

export const LLMClassificationJobSchema =
  SchemaFactory.createForClass(LLMClassificationJob);

// Create indexes for efficient querying
LLMClassificationJobSchema.index({ status: 1 });
LLMClassificationJobSchema.index({ created_at: 1 });
LLMClassificationJobSchema.index({ trace_id: 1 });
