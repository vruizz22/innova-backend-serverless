import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@infrastructure/database/prisma.service';

export interface AssignmentView {
  id: string;
  studentId: string;
  itemIds: string[];
  dueAt?: string;
}

export interface RecommendNextExercise {
  id: string;
  problem: string;
  topicCode: string;
  topicName: string;
  irtA: number;
  irtB: number;
}

export interface RecommendNextResponse {
  exercise: RecommendNextExercise;
  studentTheta: number;
  reasoning: string;
}

// IRT 2-PL Fisher information: I(θ) = a² · P(θ) · (1 − P(θ))
function fisherInformation(a: number, b: number, theta: number): number {
  const p = 1.0 / (1.0 + Math.exp(-a * (theta - b)));
  return a * a * p * (1.0 - p);
}

// Logit transform of pKnown (clamped to avoid ±∞).
function thetaFromPKnown(pKnown: number): number {
  const c = Math.min(Math.max(pKnown, 0.05), 0.95);
  return Math.log(c / (1.0 - c));
}

@Injectable()
export class PracticeService {
  constructor(private readonly prisma: PrismaService) {}

  createAssignment(
    studentId: string,
    itemIds: string[],
    dueAt?: string,
  ): AssignmentView {
    return {
      id: randomUUID(),
      studentId,
      itemIds,
      dueAt,
    };
  }

  /**
   * Returns the exercise from the active pool that maximises Fisher information
   * for the student's current ability estimate (derived from BKT pKnown via
   * logit). Optionally scoped to a single domain.
   *
   * Algorithm:
   *  1. Load the student's mastery per topic (pKnown → theta via logit).
   *  2. Load active exercises for the domain (or all domains).
   *  3. For each exercise compute I(theta_topic) using the 2-PL IRT formula.
   *  4. Return the exercise with max Fisher info.
   *
   * If the student has no mastery record for a topic we use the BKT prior
   * pKnown = 0.3 (→ theta ≈ −0.85), which steers toward slightly-below-average
   * difficulty items — appropriate for an unobserved topic.
   */
  async recommendNext(
    studentId: string,
    domainId?: string,
  ): Promise<RecommendNextResponse> {
    await this.prisma.ensureConnected();

    // Check student exists
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException(`Student ${studentId} not found`);

    // Load exercises (cap at 500 to bound query size)
    const exercises = await this.prisma.exercise.findMany({
      where: {
        status: 'ACTIVE',
        ...(domainId ? { topic: { domainId } } : {}),
      },
      select: {
        id: true,
        topicId: true,
        irtA: true,
        irtB: true,
        content: true,
        topic: { select: { code: true, name: true } },
      },
      take: 500,
    });

    if (exercises.length === 0) {
      throw new NotFoundException(
        domainId
          ? `No active exercises found for domain ${domainId}`
          : 'No active exercises found',
      );
    }

    // Load student mastery for the relevant topics
    const topicIds = [...new Set(exercises.map((e) => e.topicId))];
    const masteryRows = await this.prisma.studentTopicMastery.findMany({
      where: { studentId, topicId: { in: topicIds } },
      select: { topicId: true, pKnown: true },
    });
    const masteryByTopic = new Map(
      masteryRows.map((m) => [m.topicId, m.pKnown]),
    );

    // Pick the exercise with maximum Fisher information
    let bestExercise = exercises[0];
    let bestInfo = -1;
    let bestTheta = 0;

    for (const ex of exercises) {
      const pKnown = masteryByTopic.get(ex.topicId) ?? 0.3;
      const theta = thetaFromPKnown(pKnown);
      const info = fisherInformation(ex.irtA, ex.irtB, theta);
      if (info > bestInfo) {
        bestInfo = info;
        bestExercise = ex;
        bestTheta = theta;
      }
    }

    const content = bestExercise.content as
      | Record<string, unknown>
      | null
      | undefined;
    const problem =
      typeof content?.['prompt'] === 'string'
        ? content['prompt']
        : `Ejercicio ${bestExercise.id.slice(0, 8)}`;

    return {
      exercise: {
        id: bestExercise.id,
        problem,
        topicCode: bestExercise.topic.code,
        topicName: bestExercise.topic.name,
        irtA: bestExercise.irtA,
        irtB: bestExercise.irtB,
      },
      studentTheta: bestTheta,
      reasoning: `θ = ${bestTheta.toFixed(2)}, b = ${bestExercise.irtB.toFixed(2)} → I(θ) = ${bestInfo.toFixed(3)} (Fisher máx)`,
    };
  }
}
