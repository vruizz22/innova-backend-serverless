import { Injectable } from '@nestjs/common';
import { ErrorType, Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { MasteryService } from '@modules/mastery/mastery.service';
import {
  CreateAttemptDto,
  AttemptStepDto,
} from '@modules/attempts/dto/create-attempt.dto';
import { RuleEngineService } from '@modules/attempts/rule-engine/engine.service';
import { RuleClassificationResult } from '@modules/attempts/rule-engine/strategy.interface';
import { MathOCROrchestrator } from '@adapters/math-ocr/math-ocr.orchestrator';

export interface OcrExtractResult {
  rawSteps: AttemptStepDto[];
  finalAnswer: string;
  topicHint: string | null;
  confidence: number;
}

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
    private readonly ocrOrchestrator: MathOCROrchestrator,
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
      const item = dto.itemId
        ? await this.prisma.item.findUnique({ where: { id: dto.itemId } })
        : null;

      // Build problem_statement from item.content JSON or from minuend/subtrahend fields
      const content = item?.content as
        | Record<string, unknown>
        | null
        | undefined;
      const problemStatement =
        typeof content?.['problemStatement'] === 'string'
          ? content['problemStatement']
          : `${dto.minuend ?? ''} - ${dto.subtrahend ?? ''} = ?`;

      await this.sqsAdapter.publishStandard({
        queueUrl: process.env['SQS_LLM_CLASSIFY_URL'] ?? '',
        messageBody: {
          id: attempt.id,
          topic: dto.skillKey,
          problem_statement: problemStatement,
          canonical_solution: String(dto.expectedAnswer),
          raw_steps: dto.rawSteps,
          final_answer: String(dto.studentAnswer),
          student_id: dto.studentId,
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

  async extractOcr(imageBuffer: Buffer): Promise<OcrExtractResult> {
    const result = await this.ocrOrchestrator.extract(imageBuffer);
    return {
      rawSteps: result.rawSteps,
      finalAnswer: result.finalAnswer,
      topicHint: result.topicHint,
      confidence: result.confidence,
    };
  }
}
