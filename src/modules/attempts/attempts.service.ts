import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { S3Adapter } from '@adapters/s3.adapter';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { MasteryService } from '@modules/mastery/mastery.service';
import {
  CreateAttemptDto,
  AttemptStepDto,
} from '@modules/attempts/dto/create-attempt.dto';
import { RuleEngineService } from '@modules/attempts/rule-engine/engine.service';
import { RuleClassificationResult } from '@modules/attempts/rule-engine/strategy.interface';
import { MathOCROrchestrator } from '@adapters/math-ocr/math-ocr.orchestrator';
import { ReportAttemptErrorDto } from '@modules/attempts/dto/report-attempt-error.dto';
import {
  SolveAdhocDto,
  type SolveAdhocResponse,
} from '@modules/attempts/dto/solve-adhoc.dto';

export interface OcrExtractExercise {
  problem: string;
  rawSteps: AttemptStepDto[];
  finalAnswer: string;
  topicHint: string | null;
  confidence: number;
}

export interface OcrExtractResult {
  exercises: OcrExtractExercise[];
}

export interface ReportAck {
  attemptId: string;
  reported: boolean;
}

export interface AttemptResponse {
  attemptId: string;
  isCorrect: boolean;
  errorTagCode: string;
  classifierSource: 'RULE' | 'LLM';
  confidence: number;
}

/**
 * Current classification of an attempt. `status` is `PENDING` while an
 * UNCLASSIFIED attempt waits for the async LLM worker, then `CLASSIFIED` once the
 * worker writes the real `errorTag`. `/scan` polls this for parity with guides
 * (which poll GuideSubmission status).
 */
export interface AttemptStatusResponse {
  attemptId: string;
  status: string;
  isCorrect: boolean;
  errorTagCode: string | null;
  errorTagName: string | null;
  classifierSource: string;
  confidence: number | null;
}

export interface AttemptStepView {
  stepIndex: number;
  contentLatex: string;
  isCorrect: boolean | null;
}

export interface AttemptDetailResponse {
  attemptId: string;
  status: string;
  isCorrect: boolean;
  errorTagCode: string | null;
  errorTagName: string | null;
  classifierSource: string;
  confidence: number | null;
  steps: AttemptStepView[];
  submission: {
    photoUrls: string[];
    transcriptionLatex: string | null;
    transcriptionJson: Prisma.JsonValue | null;
    transcriptionConfidence: number | null;
  } | null;
}

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService,
    private readonly masteryService: MasteryService,
    private readonly sqsAdapter: SqsAdapter,
    private readonly ocrOrchestrator: MathOCROrchestrator,
    private readonly s3: S3Adapter,
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

  /**
   * Returns the live classification of an attempt so `/scan` can poll after a
   * submit (the synchronous response is RULE-only; UNCLASSIFIED attempts are
   * finished asynchronously by the LLM worker, which flips `status` to
   * CLASSIFIED and writes the real error tag).
   */
  async getStatus(attemptId: string): Promise<AttemptStatusResponse> {
    await this.prisma.ensureConnected();

    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        isCorrect: true,
        classifierSource: true,
        confidence: true,
        errorTag: { select: { code: true, name: true } },
      },
    });
    if (!attempt) {
      throw new NotFoundException(`Attempt ${attemptId} not found`);
    }

    return {
      attemptId: attempt.id,
      status: attempt.status,
      isCorrect: attempt.isCorrect,
      errorTagCode: attempt.errorTag?.code ?? null,
      errorTagName: attempt.errorTag?.name || null,
      classifierSource: attempt.classifierSource,
      confidence: attempt.confidence,
    };
  }

  async extractOcr(imageBuffer: Buffer): Promise<OcrExtractResult> {
    const result = await this.ocrOrchestrator.extract(imageBuffer);
    return {
      exercises: result.exercises.map((ex) => ({
        problem: ex.problem,
        rawSteps: ex.rawSteps,
        finalAnswer: ex.finalAnswer,
        topicHint: ex.topicHint,
        confidence: ex.confidence,
      })),
    };
  }

  /**
   * A10 — Creates a PENDING attempt for an ad-hoc scan (no guide context) and
   * enqueues it for the adhoc_solver worker. The student scanned an exercise
   * whose expected answer cannot be derived client-side (symbolic algebra). The
   * solver runs FULL-mode solution_generator, then writes the classification back
   * to the attempt row. Frontend polls GET /attempts/:id/status for the result.
   */
  async solveAdhoc(
    dto: SolveAdhocDto,
    traceId: string,
  ): Promise<SolveAdhocResponse> {
    await this.prisma.ensureConnected();

    const attempt = await this.prisma.attempt.create({
      data: {
        studentId: dto.studentId,
        exerciseId: null,
        courseId: dto.courseId ?? null,
        isCorrect: false,
        errorTagId: null,
        classifierSource: 'LLM',
        confidence: null,
        inputMode: 'SCAN_ADHOC',
        status: 'PENDING',
        traceId,
      },
    });

    await this.sqsAdapter.publishStandard({
      queueUrl: process.env['SQS_ADHOC_SOLVE_URL'] ?? '',
      messageBody: {
        attempt_id: attempt.id,
        problem_latex: dto.problemLatex,
        student_steps: dto.studentSteps ?? [],
        student_final_answer: dto.studentFinalAnswer,
        student_id: dto.studentId,
        grade_level: dto.gradeLevel ?? 7,
        trace_id: traceId,
      },
    });

    return { attemptId: attempt.id };
  }

  /**
   * v8 C4 — records a field-reported correct error tag for an attempt without
   * overwriting the original classification. The reporter's identity is optional
   * (the route is auth-guarded; user linkage is a follow-up).
   */
  async reportError(
    attemptId: string,
    dto: ReportAttemptErrorDto,
    reportedById: string | null,
  ): Promise<ReportAck> {
    await this.prisma.ensureConnected();

    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: { id: true },
    });
    if (!attempt) {
      throw new NotFoundException(`Attempt ${attemptId} not found`);
    }

    const errorTag = await this.prisma.errorTag.findUnique({
      where: { code: dto.errorTagCode },
      select: { id: true },
    });
    if (!errorTag) {
      throw new NotFoundException(`Error tag ${dto.errorTagCode} not found`);
    }

    await this.prisma.attemptErrorReport.create({
      data: {
        attemptId: attempt.id,
        errorTagId: errorTag.id,
        reportedById,
        comment: dto.comment ?? null,
        source: 'FIELD_REPORTED',
      },
    });

    return { attemptId: attempt.id, reported: true };
  }

  async getDetail(attemptId: string): Promise<AttemptDetailResponse> {
    await this.prisma.ensureConnected();

    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        isCorrect: true,
        classifierSource: true,
        confidence: true,
        errorTag: { select: { code: true, name: true } },
        steps: {
          select: { stepIndex: true, contentLatex: true, isCorrect: true },
          orderBy: { stepIndex: 'asc' },
        },
        guideSubmission: {
          select: {
            photoKeys: true,
            transcriptionLatex: true,
            transcriptionJson: true,
            transcriptionConfidence: true,
          },
        },
      },
    });

    if (!attempt) throw new NotFoundException(`Attempt ${attemptId} not found`);

    let submission: AttemptDetailResponse['submission'] = null;
    if (attempt.guideSubmission) {
      const bucket = process.env['S3_SUBMISSIONS_BUCKET'] ?? '';
      const photoUrls = bucket
        ? await Promise.all(
            attempt.guideSubmission.photoKeys.map((key) =>
              this.s3.createPresignedGetUrl({ bucket, key, ttlSeconds: 3600 }),
            ),
          )
        : [];
      submission = {
        photoUrls,
        transcriptionLatex: attempt.guideSubmission.transcriptionLatex,
        transcriptionJson: attempt.guideSubmission.transcriptionJson,
        transcriptionConfidence:
          attempt.guideSubmission.transcriptionConfidence,
      };
    }

    return {
      attemptId: attempt.id,
      status: attempt.status,
      isCorrect: attempt.isCorrect,
      errorTagCode: attempt.errorTag?.code ?? null,
      errorTagName: attempt.errorTag?.name ?? null,
      classifierSource: attempt.classifierSource,
      confidence: attempt.confidence,
      steps: attempt.steps.map((s) => ({
        stepIndex: s.stepIndex,
        contentLatex: s.contentLatex,
        isCorrect: s.isCorrect,
      })),
      submission,
    };
  }
}

// Re-export for use in rule engine
export type { RuleClassificationResult };
