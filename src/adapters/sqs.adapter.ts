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

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: input.queueUrl,
        MessageBody: JSON.stringify(input.messageBody),
        MessageGroupId: input.messageGroupId,
      }),
    );

    this.logger.log(`FIFO message published to ${input.queueUrl}`);
  }

  async publishStandard(input: StandardMessageInput): Promise<void> {
    if (!input.queueUrl) {
      return;
    }

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: input.queueUrl,
        MessageBody: JSON.stringify(input.messageBody),
      }),
    );

    this.logger.log(`Standard message published to ${input.queueUrl}`);
  }
}
