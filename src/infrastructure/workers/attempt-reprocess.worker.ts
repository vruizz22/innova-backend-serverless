import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AttemptsService } from '@modules/attempts/attempts.service';
import { MasteryService } from '@modules/mastery/mastery.service';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { AttemptReprocessMessage } from '@shared/sqs/guide-messages';
import { AttemptStepDto } from '@modules/attempts/dto/create-attempt.dto';

/**
 * Consumes `attempt-reprocess-queue` (ADR-120/121).
 *
 * Two shapes share the queue (retro-compatible contract, see 06c-guide-pipeline §6c.4):
 *  - Legacy OCR loop: `attempt_id` set, no `guide_*` fields → reclassify an
 *    existing attempt.
 *  - Guide submission: `guide_submission_id` set → create a brand-new
 *    Attempt(inputMode='PHOTO_GUIDE') as the canonical correction record, run
 *    classification, update BKT, and close the GuideSubmission.
 *
 * The grader NEVER assigns error tags (ADR-121): the definitive tag comes from
 * the rule engine (free, deterministic) or the by_domain LLM classifier. The
 * backend is the single writer of BKT.
 */
@Injectable()
export class AttemptReprocessWorker {
  private readonly logger = new Logger(AttemptReprocessWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attemptsService: AttemptsService,
    private readonly masteryService: MasteryService,
    private readonly sqs: SqsAdapter,
  ) {}

  async processMessage(message: AttemptReprocessMessage): Promise<void> {
    await this.prisma.ensureConnected();

    if (message.guide_submission_id) {
      await this.processGuideSubmission(message);
      return;
    }
    if (message.attempt_id) {
      await this.processLegacyOcr(message);
      return;
    }
    this.logger.warn(
      'Reprocess message without attempt_id or guide_submission_id — skipped',
    );
  }

  // -------------------------------------------------------------------
  // Guide submission grading (v9)
  // -------------------------------------------------------------------

  private async processGuideSubmission(
    message: AttemptReprocessMessage,
  ): Promise<void> {
    const submissionId = message.guide_submission_id!;

    const submission = await this.prisma.guideSubmission.findUnique({
      where: { id: submissionId },
      include: {
        guide: { select: { id: true, courseId: true, assignmentId: true } },
        question: {
          include: {
            topic: {
              include: {
                subdomain: { select: { code: true } },
                domain: { select: { id: true, code: true } },
              },
            },
            solutions: { where: { isCurrent: true }, take: 1 },
          },
        },
      },
    });

    if (!submission) {
      this.logger.warn(`GuideSubmission ${submissionId} not found — skipping`);
      return;
    }
    // Idempotency: SQS may redeliver. A graded submission is terminal.
    if (submission.status === 'GRADED' && submission.attemptId) {
      this.logger.log(
        `GuideSubmission ${submissionId} already graded — skipping`,
      );
      return;
    }

    const { question, guide } = submission;
    const score = message.alignment_summary?.score_0_1 ?? 0;
    const isCorrect = score >= 0.999;
    const rawSteps: AttemptStepDto[] = (message.latex_steps ?? []).map(
      (expression, idx, arr): AttemptStepDto => ({
        expression,
        isFinal: idx === arr.length - 1,
      }),
    );

    await this.prisma.guideSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'GRADING',
        transcriptionLatex: (message.latex_steps ?? []).join(' \\\\ '),
        transcriptionConfidence: message.confidence,
        score,
        isCorrect,
        modelUsed: message.provider,
      },
    });

    // Canonical correction record (ADR-120): a PHOTO_GUIDE attempt 1:1.
    // isCorrect comes from alignment; the specific error tag is resolved by the
    // by_domain LLM classifier (rule strategies need structured numeric inputs
    // that a free-form guide question does not provide).
    const needsClassification = !isCorrect;
    const correctTag = await this.prisma.errorTag.findUnique({
      where: { code: 'CORRECT' },
      select: { id: true },
    });

    const attempt = await this.prisma.attempt.create({
      data: {
        studentId: submission.studentId,
        exerciseId: question.exerciseId ?? null,
        courseId: guide.courseId,
        assignmentId: guide.assignmentId ?? null,
        inputMode: 'PHOTO_GUIDE',
        isCorrect,
        classifierSource: needsClassification ? 'LLM' : 'RULE',
        errorTagId: isCorrect ? (correctTag?.id ?? null) : null,
        confidence: message.confidence,
        ocrConfidence: submission.transcriptionConfidence ?? message.confidence,
        ocrProvider: message.provider,
        status: needsClassification ? 'PENDING' : 'CLASSIFIED',
        traceId: message.trace_id,
        classifiedAt: needsClassification ? null : new Date(),
      },
    });

    if (rawSteps.length > 0) {
      await this.prisma.attemptStep.createMany({
        data: rawSteps.map((step, idx) => ({
          attemptId: attempt.id,
          stepIndex: idx,
          contentLatex: step.expression,
          isCorrect: step.isFinal ? isCorrect : null,
        })),
        skipDuplicates: true,
      });
    }

    // BKT only when the question has a teacher-confirmed topic (ADR-122 §5.6).
    if (question.topicId) {
      await this.masteryService.applyAttempt(
        submission.studentId,
        question.topicId,
        isCorrect,
      );
    }

    // Incorrect → route to the by_domain LLM classifier for the error tag.
    if (needsClassification) {
      const solution = question.solutions[0];
      await this.sqs.publishStandard({
        queueUrl: process.env['SQS_LLM_CLASSIFY_URL'] ?? '',
        messageBody: {
          id: attempt.id,
          topic: question.topic?.code ?? null,
          domain_id: question.topic?.domain?.id ?? question.domainId ?? null,
          subdomain_code: question.topic?.subdomain?.code ?? null,
          problem_statement: question.statementLatex,
          canonical_solution: solution?.finalAnswer ?? '',
          raw_steps: rawSteps,
          final_answer: rawSteps[rawSteps.length - 1]?.expression ?? '',
          student_id: submission.studentId,
        },
      });
    }

    await this.prisma.guideSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'GRADED',
        attemptId: attempt.id,
        gradedAt: new Date(),
        alignmentJson: message.alignment_summary
          ? (message.alignment_summary as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });

    this.logger.log(
      `Graded GuideSubmission ${submissionId} → attempt ${attempt.id} ` +
        `(score=${score}, correct=${isCorrect}, classify=${needsClassification})`,
    );
  }

  // -------------------------------------------------------------------
  // Legacy OCR loop (v7) — unchanged behaviour, adapted to latex_steps
  // -------------------------------------------------------------------

  private async processLegacyOcr(
    message: AttemptReprocessMessage,
  ): Promise<void> {
    const attemptId = message.attempt_id!;
    const rawSteps: AttemptStepDto[] = (message.latex_steps ?? []).map(
      (expression, idx, arr): AttemptStepDto => ({
        expression,
        isFinal: idx === arr.length - 1,
      }),
    );

    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { exercise: { include: { topic: true } } },
    });
    if (!attempt) {
      this.logger.warn(`Attempt ${attemptId} not found — skipping reprocess`);
      return;
    }

    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: {
        status: 'OCR_DONE',
        ocrConfidence: message.confidence,
        ocrProvider: message.provider,
      },
    });

    if (attempt.exercise?.topic && attempt.studentId) {
      const lastExpr = rawSteps[rawSteps.length - 1]?.expression ?? '';
      try {
        await this.attemptsService.create(
          {
            studentId: attempt.studentId,
            topicCode: attempt.exercise.topic.code,
            exerciseId: attempt.exerciseId ?? undefined,
            courseId: attempt.courseId ?? undefined,
            rawSteps,
            expectedAnswer: 0,
            studentAnswer: parseFloat(lastExpr.replace(/[^0-9.-]/g, '')) || 0,
          },
          attempt.traceId,
        );
      } catch (err) {
        this.logger.error(
          `Failed to re-classify attempt ${attemptId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `Reprocessed attempt ${attemptId} from OCR ${message.provider}`,
    );
  }
}
