import { Injectable } from '@nestjs/common';
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
  errorTagCode: string;
  classifierSource: 'RULE' | 'LLM';
  confidence: number;
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

    // Map topicCode to topic record (include subdomain for rule engine routing)
    const topic = await this.prisma.topic.findFirst({
      where: { code: dto.topicCode },
      include: {
        subdomain: { select: { code: true } },
        domain: { select: { id: true, code: true } },
      },
    });

    const subdomainCode = topic?.subdomain?.code
      ? `${topic.domain?.code ?? ''}_${topic.subdomain.code}`
      : 'UNKNOWN';
    const classified = this.ruleEngine.classify(dto, subdomainCode);
    const isUnclassified = classified.errorType === 'UNCLASSIFIED';

    // Find matching ErrorTag
    const errorTag = isUnclassified
      ? await this.prisma.errorTag.findUnique({
          where: { code: 'UNCLASSIFIED' },
        })
      : classified.errorType === 'CORRECT'
        ? await this.prisma.errorTag.findUnique({ where: { code: 'CORRECT' } })
        : await this.prisma.errorTag.findFirst({
            where: { code: classified.errorType },
          });

    const attempt = await this.prisma.attempt.create({
      data: {
        studentId: dto.studentId,
        exerciseId: dto.exerciseId ?? null,
        courseId: dto.courseId ?? null,
        isCorrect: classified.isCorrect,
        errorTagId: errorTag?.id ?? null,
        classifierSource: isUnclassified ? 'LLM' : 'RULE',
        confidence: classified.confidence,
        inputMode: 'DIGITAL',
        status: isUnclassified ? 'PENDING' : 'CLASSIFIED',
        traceId,
      },
    });

    // Persist steps
    if (dto.rawSteps.length > 0) {
      await this.prisma.attemptStep.createMany({
        data: dto.rawSteps.map((step, idx) => ({
          attemptId: attempt.id,
          stepIndex: idx,
          contentLatex: step.expression,
          isCorrect: step.isFinal ? classified.isCorrect : null,
        })),
        skipDuplicates: true,
      });
    }

    // BKT update if we have a topic
    if (topic) {
      await this.masteryService.applyAttempt(
        dto.studentId,
        topic.id,
        classified.isCorrect,
      );
    }

    // Telemetry FIFO
    await this.sqsAdapter.publishFifo({
      queueUrl: process.env['SQS_ATTEMPT_STREAM_URL'] ?? '',
      messageGroupId: dto.studentId,
      messageBody: {
        attemptId: attempt.id,
        traceId,
        rawSteps: dto.rawSteps,
      },
    });

    // LLM classify queue for UNCLASSIFIED
    if (isUnclassified) {
      const exercise = dto.exerciseId
        ? await this.prisma.exercise.findUnique({
            where: { id: dto.exerciseId },
          })
        : null;

      const content = exercise?.content as
        | Record<string, unknown>
        | null
        | undefined;
      const problemStatement =
        typeof content?.['prompt'] === 'string'
          ? content['prompt']
          : `${dto.minuend ?? ''} - ${dto.subtrahend ?? ''} = ?`;

      await this.sqsAdapter.publishStandard({
        queueUrl: process.env['SQS_LLM_CLASSIFY_URL'] ?? '',
        messageBody: {
          id: attempt.id,
          topic: dto.topicCode,
          domain_id: topic?.domainId ?? null,
          subdomain_code: topic?.subdomain?.code ?? null,
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
      errorTagCode: classified.errorType,
      classifierSource: isUnclassified ? 'LLM' : 'RULE',
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

// Re-export for use in rule engine
export type { RuleClassificationResult };
