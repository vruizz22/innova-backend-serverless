import { Injectable, Logger } from '@nestjs/common';

interface ClassifyInput {
  attemptId: string;
  prompt: string;
}

interface ClassifyOutput {
  attemptId: string;
  errorType: string;
  confidence: number;
  evidence: string[];
}

@Injectable()
export class AnthropicAdapter {
  private readonly logger = new Logger(AnthropicAdapter.name);

  classifyBatch(payload: ClassifyInput[]): Promise<ClassifyOutput[]> {
    this.logger.log(
      `Classifying batch with prompt-cache enabled. Size=${payload.length}`,
    );

    return Promise.resolve(
      payload.map((entry) => ({
        attemptId: entry.attemptId,
        errorType: 'UNCLASSIFIED',
        confidence: 0.5,
        evidence: ['Stub adapter response'],
      })),
    );
  }
}
