import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class TelemetryEvent {
  @Prop({ type: String, required: true })
  eventType!: string;

  @Prop({ type: Number, required: true })
  x!: number;

  @Prop({ type: Number, required: true })
  y!: number;

  @Prop({ type: Number, required: true })
  durationMs!: number;

  @Prop({ type: Date, required: true })
  timestamp!: Date;
}
export const TelemetryEventSchema =
  SchemaFactory.createForClass(TelemetryEvent);

@Schema({ _id: false })
export class TelemetryMetadata {
  @Prop({ type: String, required: true })
  deviceType!: string;

  @Prop({ type: String, required: true })
  clientVersion!: string;

  @Prop({ type: Number, required: true })
  fps!: number;
}
export const TelemetryMetadataSchema =
  SchemaFactory.createForClass(TelemetryMetadata);

export type RawTelemetryDocument = RawTelemetry & Document;

@Schema({ timestamps: true, collection: 'raw_telemetries' })
export class RawTelemetry {
  @Prop({ type: String, required: true, index: true })
  student_uuid!: string;

  @Prop({ type: String, required: true })
  gameId!: string;

  @Prop({ type: String, required: true, index: true })
  sessionId!: string;

  @Prop({ type: Date, required: true, default: Date.now })
  timestamp!: Date;

  @Prop({ type: [TelemetryEventSchema], default: [] })
  events!: TelemetryEvent[];

  @Prop({ type: TelemetryMetadataSchema, required: true })
  metadata!: TelemetryMetadata;
}

export const RawTelemetrySchema = SchemaFactory.createForClass(RawTelemetry);
