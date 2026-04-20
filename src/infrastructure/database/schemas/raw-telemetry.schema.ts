import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class TelemetryEvent {
  @Prop({ required: true })
  eventType!: string;

  @Prop({ required: true })
  x!: number;

  @Prop({ required: true })
  y!: number;

  @Prop({ required: true })
  durationMs!: number;

  @Prop({ required: true })
  timestamp!: Date;
}
export const TelemetryEventSchema =
  SchemaFactory.createForClass(TelemetryEvent);

@Schema({ _id: false })
export class TelemetryMetadata {
  @Prop({ required: true })
  deviceType!: string;

  @Prop({ required: true })
  clientVersion!: string;

  @Prop({ required: true })
  fps!: number;
}
export const TelemetryMetadataSchema =
  SchemaFactory.createForClass(TelemetryMetadata);

export type RawTelemetryDocument = RawTelemetry & Document;

@Schema({ timestamps: true, collection: 'raw_telemetries' })
export class RawTelemetry {
  @Prop({ required: true, index: true })
  student_uuid!: string;

  @Prop({ required: true })
  gameId!: string;

  @Prop({ required: true, index: true })
  sessionId!: string;

  @Prop({ required: true, default: Date.now })
  timestamp!: Date;

  @Prop({ type: [TelemetryEventSchema], default: [] })
  events!: TelemetryEvent[];

  @Prop({ type: TelemetryMetadataSchema, required: true })
  metadata!: TelemetryMetadata;
}

export const RawTelemetrySchema = SchemaFactory.createForClass(RawTelemetry);
