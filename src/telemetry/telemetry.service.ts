import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RawTelemetry,
  RawTelemetryDocument,
} from './schemas/raw-telemetry.schema';
import { ParseRawTelemetryDto } from './dto/raw-telemetry.dto';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectModel(RawTelemetry.name)
    private readonly rawTelemetryModel: Model<RawTelemetryDocument>,
  ) {}

  /**
   * SQS Consumer target logic for Batch Processing
   * @param payloads Array of validated RawTelemetry payloads
   * @returns Resolves when batch is saved
   */
  async batchProcessTelemetry(payloads: ParseRawTelemetryDto[]): Promise<void> {
    try {
      this.logger.log(
        `Processing batch of ${payloads.length} telemetry records...`,
      );
      // Firehose rapid insert
      await this.rawTelemetryModel.insertMany(payloads);
      this.logger.log('Batch successfully inserted into MongoDB Atlas.');
    } catch (error) {
      this.logger.error('Failed to process batch telemetry', error);
      throw error;
    }
  }

  /**
   * Temporary HTTP Endpoint fallback or single manual trigger
   * @param payload
   */
  async processSingleTelemetry(payload: ParseRawTelemetryDto): Promise<void> {
    const record = new this.rawTelemetryModel(payload);
    await record.save();
    this.logger.log(`Saved telemetry for student: ${payload.student_uuid}`);
  }
}
