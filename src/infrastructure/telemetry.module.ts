import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TelemetryController } from '@/infrastructure/http/controllers/telemetry.controller';
import { TelemetryService } from '@/application/telemetry/telemetry.service';
import { TelemetryWorker } from '@/application/telemetry/telemetry.worker';
import {
  RawTelemetry,
  RawTelemetrySchema,
} from '@/infrastructure/database/schemas/raw-telemetry.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RawTelemetry.name, schema: RawTelemetrySchema },
    ]),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetryWorker],
})
export class TelemetryModule {}
