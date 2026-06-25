import { Logger } from '@nestjs/common';
import { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { AttemptReprocessWorker } from '@infrastructure/workers/attempt-reprocess.worker';
import { AttemptReprocessMessage } from '@shared/sqs/guide-messages';

// ---------------------------------------------------------------------
// Lambda SQS handler — boots a cached Nest application context and reports
// per-record failures so SQS can redrive only the ones that threw.
// ---------------------------------------------------------------------

let cachedWorker: AttemptReprocessWorker | null = null;

async function getWorker(): Promise<AttemptReprocessWorker> {
  if (cachedWorker) {
    return cachedWorker;
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const worker = app.get(AttemptReprocessWorker);
  cachedWorker = worker;
  return worker;
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const logger = new Logger('AttemptReprocessHandler');
  const worker = await getWorker();
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body) as AttemptReprocessMessage;
      await worker.processMessage(message);
    } catch (err) {
      logger.error(
        `Failed to process record ${record.messageId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
