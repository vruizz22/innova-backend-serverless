/**
 * Local consumer for `attempt-reprocess-queue` (dev only).
 *
 * In prod, an SQS event-source-mapping invokes the Lambda `handler` exported by
 * `attempt-reprocess.ts` whenever the ai-engine `submission_grader`
 * publishes a message. Locally there is no mapping: `pnpm start:dev` only serves
 * the HTTP API, so the queue is never drained and the v9 pipeline stalls right
 * after grading (the photo is read, but no Attempt is created, no rule engine,
 * no BKT, no classified errors in the dashboards).
 *
 * This script closes that gap: it polls LocalStack and dispatches each message to
 * the same `handler`, with an SQS-shaped event, deleting it only when the handler
 * reports no `batchItemFailures` (identical contract to prod). Mirrors the Python
 * `scripts/local_pipeline_consumer.py` on the ai-engine side.
 *
 * Run (Victor, 4th terminal):
 *   pnpm consume:reprocess
 */
import 'dotenv/config';
import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
// Eval AppModule first so its module graph (AppModule → AttemptsModule → worker)
// initializes in the same order as `main.ts`. Importing the worker first instead
// would re-enter AttemptsModule while the worker is still mid-evaluation, leaving
// `AttemptReprocessWorker` undefined in its providers array → CircularDependencyException.
import '@/app.module';
import { handler } from '@infrastructure/workers/attempt-reprocess';

const QUEUE_NAME = 'attempt-reprocess-queue';
const endpoint = process.env['AWS_ENDPOINT_URL'];

const client = new SQSClient({
  region: process.env['AWS_REGION'] ?? 'us-east-1',
  ...(endpoint
    ? {
        endpoint,
        credentials: {
          accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? 'test',
          secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? 'test',
        },
      }
    : {}),
});

async function resolveQueueUrl(): Promise<string> {
  const fromEnv = process.env['SQS_ATTEMPT_REPROCESS_URL'];
  if (fromEnv) {
    return fromEnv;
  }
  const out = await client.send(
    new GetQueueUrlCommand({ QueueName: QUEUE_NAME }),
  );
  if (!out.QueueUrl) {
    throw new Error(`Could not resolve queue URL for ${QUEUE_NAME}`);
  }
  return out.QueueUrl;
}

function toSqsEvent(
  messageId: string,
  receiptHandle: string,
  body: string,
): SQSEvent {
  const record: SQSRecord = {
    messageId,
    receiptHandle,
    body,
    attributes: {
      ApproximateReceiveCount: '1',
      SentTimestamp: `${Date.now()}`,
      SenderId: 'local',
      ApproximateFirstReceiveTimestamp: `${Date.now()}`,
    },
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: `arn:aws:sqs:local:000000000000:${QUEUE_NAME}`,
    awsRegion: process.env['AWS_REGION'] ?? 'us-east-1',
  };
  return { Records: [record] };
}

async function main(): Promise<void> {
  const queueUrl = await resolveQueueUrl();
  // eslint-disable-next-line no-console
  console.log(`[reprocess-consumer] polling ${queueUrl}`);

  for (;;) {
    const resp = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: 2,
        MessageAttributeNames: ['All'],
      }),
    );

    for (const msg of resp.Messages ?? []) {
      if (!msg.MessageId || !msg.ReceiptHandle || msg.Body === undefined) {
        continue;
      }
      const event = toSqsEvent(msg.MessageId, msg.ReceiptHandle, msg.Body);
      try {
        const outcome = await handler(event);
        if (outcome.batchItemFailures.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(`[reprocess-consumer] left on queue: ${msg.MessageId}`);
          continue;
        }
        await client.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: msg.ReceiptHandle,
          }),
        );
        // eslint-disable-next-line no-console
        console.log(`[reprocess-consumer] processed ${msg.MessageId}`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          `[reprocess-consumer] error on ${msg.MessageId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}

void main();
