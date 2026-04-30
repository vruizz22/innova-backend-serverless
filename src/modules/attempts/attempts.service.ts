import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { MasteryService } from '@modules/mastery/mastery.service';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import { RuleEngineService } from '@modules/attempts/rule-engine/engine.service';

export interface AttemptResponse {
  attemptId: string;
  isCorrect: boolean;
  errorType: string;
  classifierSource: 'RULE_ENGINE' | 'LLM';
  confidence: number;
}

@Injectable()
export class AttemptsService {
  constructor(
    private readonly ruleEngine: RuleEngineService,
    private readonly masteryService: MasteryService,
    private readonly sqsAdapter: SqsAdapter,
  ) {}

  async create(
    dto: CreateAttemptDto,
    traceId: string,
  ): Promise<AttemptResponse> {
    const classified = this.ruleEngine.classify(dto);
    const attemptId = randomUUID();

    await this.masteryService.applyAttempt(
      dto.studentId,
      dto.skillKey,
      classified.isCorrect,
    );

    await this.sqsAdapter.publishFifo({
      queueUrl: process.env['SQS_ATTEMPT_STREAM_URL'] ?? '',
      messageGroupId: dto.studentId,
      messageBody: {
        attemptId,
        traceId,
        rawSteps: dto.rawSteps,
      },
    });

    if (classified.errorType === 'UNCLASSIFIED') {
      await this.sqsAdapter.publishStandard({
        queueUrl: process.env['SQS_LLM_CLASSIFY_URL'] ?? '',
        messageBody: {
          attemptId,
          traceId,
          studentId: dto.studentId,
          skillKey: dto.skillKey,
        },
      });
    }

    return {
      attemptId,
      isCorrect: classified.isCorrect,
      errorType: classified.errorType,
      classifierSource:
        classified.errorType === 'UNCLASSIFIED' ? 'LLM' : 'RULE_ENGINE',
      confidence: classified.confidence,
    };
  }
}
