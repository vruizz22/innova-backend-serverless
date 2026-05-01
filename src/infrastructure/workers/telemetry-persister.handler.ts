import { NestFactory } from '@nestjs/core';
import { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { Logger } from '@nestjs/common';
import { TelemetryModule } from '@infrastructure/telemetry.module';
import { TelemetryService } from '@/application/telemetry/telemetry.service';
import { ParseRawTelemetryDto } from '@/application/telemetry/dto/raw-telemetry.dto';

const logger = new Logger('TelemetryPersisterHandler');
let cachedService: TelemetryService | null = null;

async function getService(): Promise<TelemetryService> {
  if (cachedService === null) {
    const app = await NestFactory.createApplicationContext(TelemetryModule, {
      logger: ['error', 'warn'],
    });
    cachedService = app.get(TelemetryService);
  }
  return cachedService as TelemetryService;
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const service = await getService();
  const valid: ParseRawTelemetryDto[] = [];
  const failures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    try {
      const parsed: unknown = JSON.parse(record.body);
      const dto = plainToInstance(ParseRawTelemetryDto, parsed);
      await validateOrReject(dto);
      valid.push(dto);
    } catch (err) {
      logger.error(`Invalid SQS message ${record.messageId}`, err);
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  if (valid.length > 0) {
    await service.batchProcessTelemetry(valid);
  }

  return { batchItemFailures: failures };
};
