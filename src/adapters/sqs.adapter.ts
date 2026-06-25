import { Injectable, Logger } from '@nestjs/common';
import {
  GetQueueAttributesCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

interface FifoMessageInput<T extends object = Record<string, unknown>> {
  queueUrl: string;
  messageGroupId: string;
  messageBody: T;
}

interface StandardMessageInput<T extends object = Record<string, unknown>> {
  queueUrl: string;
  messageBody: T;
}

@Injectable()
export class SqsAdapter {
  private readonly logger = new Logger(SqsAdapter.name);
  // AWS_ENDPOINT_URL is set ONLY in local dev (LocalStack) → route SQS there.
  // Without this the client targets real AWS SQS and every publish silently
  // fails (caught + "skipped"), so the v9 pipeline never gets queued. Unset in
  // prod → real AWS endpoint + task-role credentials.
  private readonly client = new SQSClient({
    region: process.env['AWS_REGION'] ?? 'us-east-1',
    ...(process.env['AWS_ENDPOINT_URL']
      ? {
          endpoint: process.env['AWS_ENDPOINT_URL'],
          credentials: {
            accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? 'test',
            secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? 'test',
          },
        }
      : {}),
  });

  async publishFifo<T extends object>(
    input: FifoMessageInput<T>,
  ): Promise<void> {
    if (!input.queueUrl) {
      return;
    }

    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: input.queueUrl,
          MessageBody: JSON.stringify(input.messageBody),
          MessageGroupId: input.messageGroupId,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `FIFO message skipped for ${input.queueUrl}: ${
          error instanceof Error ? error.message : 'Unknown SQS error'
        }`,
      );
    }
  }

  /**
   * Returns the approximate number of messages in a queue, or -1 when the URL
   * is not configured / the SQS call fails (non-blocking — admin status degrades
   * gracefully rather than erroring out).
   */
  async getQueueDepth(queueUrl: string): Promise<number> {
    if (!queueUrl) return -1;
    try {
      const resp = await this.client.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ['ApproximateNumberOfMessages'],
        }),
      );
      return parseInt(
        resp.Attributes?.['ApproximateNumberOfMessages'] ?? '0',
        10,
      );
    } catch {
      return -1;
    }
  }

  async publishStandard<T extends object>(
    input: StandardMessageInput<T>,
  ): Promise<void> {
    if (!input.queueUrl) {
      return;
    }

    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: input.queueUrl,
          MessageBody: JSON.stringify(input.messageBody),
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Standard message skipped for ${input.queueUrl}: ${
          error instanceof Error ? error.message : 'Unknown SQS error'
        }`,
      );
    }
  }
}
