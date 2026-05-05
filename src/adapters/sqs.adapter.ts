import { Injectable, Logger } from '@nestjs/common';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

interface FifoMessageInput {
  queueUrl: string;
  messageGroupId: string;
  messageBody: Record<string, unknown>;
}

interface StandardMessageInput {
  queueUrl: string;
  messageBody: Record<string, unknown>;
}

@Injectable()
export class SqsAdapter {
  private readonly logger = new Logger(SqsAdapter.name);
  private readonly client = new SQSClient({
    region: process.env['AWS_REGION'] ?? 'us-east-1',
  });

  async publishFifo(input: FifoMessageInput): Promise<void> {
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

  async publishStandard(input: StandardMessageInput): Promise<void> {
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
