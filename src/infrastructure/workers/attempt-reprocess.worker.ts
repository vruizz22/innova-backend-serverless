import { Injectable, Logger } from '@nestjs/common';
import { SQSEvent } from 'aws-lambda';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AttemptsService } from '@modules/attempts/attempts.service';

interface AttemptReprocessMessage {
  attempt_id: string;
  steps: Array<{ expression: string; isFinal: boolean }>;
  provider: 'GEMINI' | 'CLAUDE';
  confidence: number;
}

@Injectable()
export class AttemptReprocessWorker {
  private readonly logger = new Logger(AttemptReprocessWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attemptsService: AttemptsService,
  ) {}

  async processMessage(message: AttemptReprocessMessage): Promise<void> {
    const { attempt_id, steps, provider, confidence } = message;

    await this.prisma.ensureConnected();

    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attempt_id },
      include: { exercise: { include: { topic: true } } },
    });

    if (!attempt) {
      this.logger.warn(`Attempt ${attempt_id} not found — skipping reprocess`);
      return;
    }

    // Update OCR metadata and persist steps
    await this.prisma.attempt.update({
      where: { id: attempt_id },
      data: {
        status: 'OCR_DONE',
        ocrConfidence: confidence,
        ocrProvider: provider,
      },
    });

    if (steps.length > 0) {
      await this.prisma.attemptStep.createMany({
        data: steps.map((step, idx) => ({
          attemptId: attempt_id,
          stepIndex: idx,
          contentLatex: step.expression,
          isCorrect: step.isFinal ? null : null,
        })),
        skipDuplicates: true,
      });
    }

    // Re-dispatch to rule engine if we have topic context
    if (attempt.exercise?.topic && attempt.studentId) {
      try {
        await this.attemptsService.create(
          {
            studentId: attempt.studentId,
            topicCode: attempt.exercise.topic.code,
            exerciseId: attempt.exerciseId ?? undefined,
            courseId: attempt.courseId ?? undefined,
            rawSteps: steps,
            expectedAnswer: 0,
            studentAnswer: steps[steps.length - 1]
              ? parseFloat(
                  steps[steps.length - 1].expression.replace(/[^0-9.-]/g, ''),
                ) || 0
              : 0,
          },
          attempt.traceId,
        );
      } catch (err) {
        this.logger.error(
          `Failed to re-classify attempt ${attempt_id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `Reprocessed attempt ${attempt_id} from OCR provider ${provider}`,
    );
  }
}

// Lambda SQS handler — standalone, does not use NestJS DI
export const handler = (event: SQSEvent): void => {
  const logger = new Logger('AttemptReprocessHandler');
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body) as AttemptReprocessMessage;
      logger.log(
        `Processing attempt-reprocess for attempt_id=${message.attempt_id}`,
      );
    } catch (err) {
      logger.error(
        `Failed to parse SQS message: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
};
