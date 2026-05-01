import { Injectable } from '@nestjs/common';
import { ErrorType, Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { MasteryService } from '@modules/mastery/mastery.service';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import { RuleEngineService } from '@modules/attempts/rule-engine/engine.service';
import { RuleClassificationResult } from '@modules/attempts/rule-engine/strategy.interface';

export interface AttemptResponse {
  attemptId: string;
  isCorrect: boolean;
  errorType: string;
  classifierSource: 'RULE_ENGINE' | 'LLM';
  confidence: number;
}

function toPrismaErrorType(
  errorType: RuleClassificationResult['errorType'],
): ErrorType | null {
  const map: Partial<Record<RuleClassificationResult['errorType'], ErrorType>> =
    {
      BORROW_OMITTED: ErrorType.BORROW_OMITTED,
      BORROW_OMITTED_TENS: ErrorType.BORROW_OMITTED,
      BORROW_OMITTED_HUNDREDS: ErrorType.BORROW_OMITTED,
      BORROW_FROM_ZERO_ERROR: ErrorType.BORROW_FROM_ZERO_ERROR,
      SIGN_ERROR: ErrorType.SIGN_ERROR,
      SUBTRAHEND_MINUEND_SWAPPED: ErrorType.SUBTRAHEND_MINUEND_SWAPPED,
      PLACE_VALUE_ERROR: ErrorType.PLACE_VALUE_ERROR,
      BASIC_FACT_ERROR: ErrorType.BASIC_FACT_ERROR,
      PARTIAL_BORROW_ERROR: ErrorType.PARTIAL_BORROW_ERROR,
      DIGIT_TRANSPOSITION: ErrorType.UNCLASSIFIED,
      UNCLASSIFIED: ErrorType.UNCLASSIFIED,
    };
  return map[errorType] ?? null;
}

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService,
    private readonly masteryService: MasteryService,
    private readonly sqsAdapter: SqsAdapter,
  ) {}

  async create(
    dto: CreateAttemptDto,
    traceId: string,
  ): Promise<AttemptResponse> {
    await this.prisma.ensureConnected();

    const classified = this.ruleEngine.classify(dto);
    const prismaErrorType = toPrismaErrorType(classified.errorType);

    const attempt = await this.prisma.attempt.create({
      data: {
        studentId: dto.studentId,
        itemId: dto.itemId ?? null,
        isCorrect: classified.isCorrect,
        errorType: prismaErrorType,
        classifierSource:
          classified.errorType === 'UNCLASSIFIED' ? 'LLM' : 'RULE_ENGINE',
        confidence: classified.confidence,
        rawSteps: JSON.parse(
          JSON.stringify(dto.rawSteps),
        ) as Prisma.InputJsonValue,
      },
    });

    await this.masteryService.applyAttempt(
      dto.studentId,
      dto.skillKey,
      classified.isCorrect,
    );

    await this.sqsAdapter.publishFifo({
      queueUrl: process.env['SQS_ATTEMPT_STREAM_URL'] ?? '',
      messageGroupId: dto.studentId,
      messageBody: {
        attemptId: attempt.id,
        traceId,
        rawSteps: dto.rawSteps,
      },
    });

    if (classified.errorType === 'UNCLASSIFIED') {
      await this.sqsAdapter.publishStandard({
        queueUrl: process.env['SQS_LLM_CLASSIFY_URL'] ?? '',
        messageBody: {
          attemptId: attempt.id,
          traceId,
          studentId: dto.studentId,
          skillKey: dto.skillKey,
        },
      });
    }

    return {
      attemptId: attempt.id,
      isCorrect: classified.isCorrect,
      errorType: classified.errorType,
      classifierSource:
        classified.errorType === 'UNCLASSIFIED' ? 'LLM' : 'RULE_ENGINE',
      confidence: classified.confidence,
    };
  }
}
