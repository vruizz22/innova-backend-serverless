import { Injectable, Logger } from '@nestjs/common';
import {
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';

@Injectable()
export class SsmAdapter {
  private readonly logger = new Logger(SsmAdapter.name);
  // Mirror the SQS adapter pattern: local dev uses AWS_ENDPOINT_URL (LocalStack);
  // prod uses real AWS with task-role credentials.
  private readonly client = new SSMClient({
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

  /**
   * Read a boolean SSM parameter. Returns false (not paused) on any error so a
   * transient SSM outage or missing local parameter never silently blocks the
   * pipeline — fail-open matches innova-ai-engine killswitch.py semantics.
   */
  async isParamTrue(name: string): Promise<boolean> {
    try {
      const resp = await this.client.send(
        new GetParameterCommand({ Name: name }),
      );
      return resp.Parameter?.Value?.toLowerCase() === 'true';
    } catch {
      this.logger.debug(`SSM ${name} unavailable — defaulting to false`);
      return false;
    }
  }

  /**
   * Write (or overwrite) a String SSM parameter. Uses `Overwrite: true` so
   * the first call creates the param in LocalStack/prod and subsequent calls
   * update it — idempotent from the caller's perspective.
   */
  async putParam(name: string, value: string): Promise<void> {
    try {
      await this.client.send(
        new PutParameterCommand({
          Name: name,
          Value: value,
          Type: 'String',
          Overwrite: true,
        }),
      );
    } catch (err) {
      this.logger.warn(`SSM putParam ${name} failed: ${String(err)}`);
      throw err;
    }
  }
}
