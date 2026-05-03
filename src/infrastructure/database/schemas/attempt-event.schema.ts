import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * AttemptEvent Schema (Post-Pivot v2.0)
 *
 * Stores keystroke-level telemetry for student math attempts.
 * Collection: attempt_events (MongoDB)
 *
 * Example:
 * {
 *   attempt_id: "abc123",
 *   student_id: "student@innova.demo",
 *   classroom_id: "classroom-uuid",
 *   trace_id: "trace-uuid",
 *   events: [
 *     {
 *       timestamp_ms: 1234567890,
 *       type: "key_down",
 *       column: "units",
 *       value: "5",
 *       cursor_pos: 1
 *     },
 *     {
 *       timestamp_ms: 1234567900,
 *       type: "submit",
 *       column: "units",
 *       value: "5",
 *       cursor_pos: 1
 *     }
 *   ],
 *   summary: {
 *     total_events: 12,
 *     duration_ms: 45000,
 *     hints_used: 2,
 *     undo_count: 1,
 *     paste_count: 0
 *   },
 *   createdAt: ISODate(...),
 *   updatedAt: ISODate(...),
 *   archived_to_s3_at: null
 * }
 */

@Schema({ _id: false })
export class KeystrokeEvent {
  @Prop({ type: Number, required: true })
  timestamp_ms!: number;

  @Prop({
    type: String,
    required: true,
    enum: ['key_down', 'paste', 'submit', 'hint_request', 'erase', 'undo'],
  })
  type!: string;

  @Prop({
    type: String,
    required: true,
    enum: [
      'units',
      'tens',
      'hundreds',
      'thousands',
      'numerator',
      'denominator',
    ],
  })
  column!: string;

  @Prop({ type: String, required: true })
  value!: string;

  @Prop({ type: Number, required: true })
  cursor_pos!: number;
}
export const KeystrokeEventSchema =
  SchemaFactory.createForClass(KeystrokeEvent);

@Schema({ _id: false })
export class EventSummary {
  @Prop({ type: Number, required: true })
  total_events!: number;

  @Prop({ type: Number, required: true })
  duration_ms!: number;

  @Prop({ type: Number, required: true, default: 0 })
  hints_used!: number;

  @Prop({ type: Number, required: true, default: 0 })
  undo_count!: number;

  @Prop({ type: Number, required: true, default: 0 })
  paste_count!: number;
}
export const EventSummarySchema = SchemaFactory.createForClass(EventSummary);

export type AttemptEventDocument = AttemptEvent & Document;

@Schema({ timestamps: true, collection: 'attempt_events' })
export class AttemptEvent {
  @Prop({ type: String, required: true, index: true })
  attempt_id!: string;

  @Prop({ type: String, required: true, index: true })
  student_id!: string;

  @Prop({ type: String, required: true })
  classroom_id!: string;

  @Prop({ type: String, required: true, index: true })
  trace_id!: string;

  @Prop({ type: [KeystrokeEventSchema], required: true })
  events!: KeystrokeEvent[];

  @Prop({ type: EventSummarySchema, required: true })
  summary!: EventSummary;

  @Prop({ type: Date })
  archived_to_s3_at?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AttemptEventSchema = SchemaFactory.createForClass(AttemptEvent);

// Create indexes
AttemptEventSchema.index({ createdAt: 1, archived_to_s3_at: 1 });
