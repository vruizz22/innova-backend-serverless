import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import {
  RawTelemetry,
  RawTelemetrySchema,
} from './schemas/raw-telemetry.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RawTelemetry.name, schema: RawTelemetrySchema },
    ]),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService],
})
export class TelemetryModule {}
