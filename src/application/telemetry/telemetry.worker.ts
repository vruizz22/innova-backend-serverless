import { Injectable, Logger } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { ParseRawTelemetryDto } from './dto/raw-telemetry.dto';
import { SQSEvent } from 'aws-lambda';

@Injectable()
export class TelemetryWorker {
  private readonly logger = new Logger(TelemetryWorker.name);

  constructor(private readonly telemetryService: TelemetryService) {}

  /**
   * Lambda handler entry point for SQS events
   */
  async processSQSBatch(event: SQSEvent): Promise<void> {
    this.logger.log(
      `Received SQS Batch. Message count: ${event.Records.length}`,
    );
    const validPayloads: ParseRawTelemetryDto[] = [];

    for (const record of event.Records) {
      try {
        // Normally, you would use class-validator directly here to parse SQS string
        // Assuming Api Gateway validation handled string parsing:
        const parsed: ParseRawTelemetryDto = JSON.parse(record.body);
        validPayloads.push(parsed);
      } catch (error) {
        this.logger.error(
          `Failed to parse SQS message ID: ${record.messageId}`,
          error,
        );
        // Returning to DLQ if strict
      }
    }

    if (validPayloads.length > 0) {
      await this.telemetryService.batchProcessTelemetry(validPayloads);
    }
  }
}
