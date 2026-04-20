import { Injectable, Logger } from '@nestjs/common';
import { TelemetryService } from '@/application/telemetry/telemetry.service';
import { ParseRawTelemetryDto } from '@/application/telemetry/dto/raw-telemetry.dto';
import { SQSEvent } from 'aws-lambda';
import { validateOrReject } from 'class-validator';
import { plainToInstance } from 'class-transformer';

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
        const rawStringData: string = record.body;
        const parsedJson: unknown = JSON.parse(rawStringData);

        const dtoInstance = plainToInstance(ParseRawTelemetryDto, parsedJson);
        await validateOrReject(dtoInstance);

        validPayloads.push(dtoInstance);
      } catch (error) {
        this.logger.error(
          `Failed to parse SQS message ID: ${record.messageId}`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    if (validPayloads.length > 0) {
      await this.telemetryService.batchProcessTelemetry(validPayloads);
    }
  }
}
