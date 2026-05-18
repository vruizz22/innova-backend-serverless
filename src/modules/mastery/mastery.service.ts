import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';

export interface MasteryState {
  studentId: string;
  topicCode: string;
  topicName?: string;
  pKnown: number;
}

export interface AttemptHistoryView {
  id: string;
  exercisePrompt: string;
  isCorrect: boolean;
  errorTagCode: string | null;
  classifierSource: string;
  confidence: number | null;
  createdAt: string;
}

export interface ErrorFrequencyView {
  errorTagCode: string;
  count: number;
  percentage: number;
}

export interface CourseStudentMasteryView {
  studentId: string;
  displayName: string;
  topics: Array<{
    topicCode: string;
    topicName: string;
    pKnown: number;
    attemptsCount: number;
  }>;
  attempts: AttemptHistoryView[];
  errorFrequency: ErrorFrequencyView[];
}

function contentString(value: unknown, key: string): string {
  if (value && typeof value === 'object' && key in value) {
    const nested = (value as Record<string, unknown>)[key];
    if (typeof nested === 'string') return nested;
    if (typeof nested === 'number' || typeof nested === 'boolean') {
      return String(nested);
    }
  }
  return '';
}

@Injectable()
export class MasteryService {
  constructor(private readonly prisma: PrismaService) {}

  async applyAttempt(
    studentId: string,
    topicId: string,
    isCorrect: boolean,
  ): Promise<MasteryState> {
    await this.prisma.ensureConnected();

    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
    });

    const pL0 = topic?.bktPL0 ?? 0.3;
    const pT = topic?.bktPTransit ?? 0.1;
    const pS = topic?.bktPSlip ?? 0.1;
    const pG = topic?.bktPGuess ?? 0.2;

    const existing = await this.prisma.studentTopicMastery.findUnique({
      where: { studentId_topicId: { studentId, topicId } },
    });

    const prior = existing?.pKnown ?? pL0;

    const posteriorGivenObs = isCorrect
      ? ((1 - pS) * prior) / ((1 - pS) * prior + pG * (1 - prior))
      : (pS * prior) / (pS * prior + (1 - pG) * (1 - prior));

    const pKnown = Math.min(
      1,
      Math.max(0, posteriorGivenObs + (1 - posteriorGivenObs) * pT),
    );

    await this.prisma.studentTopicMastery.upsert({
      where: { studentId_topicId: { studentId, topicId } },
      create: {
        studentId,
        topicId,
        pKnown,
        attemptsCount: 1,
        lastAttemptAt: new Date(),
      },
      update: {
        pKnown,
        attemptsCount: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });

    return { studentId, topicCode: topic?.code ?? topicId, pKnown };
  }

  async getStudentMastery(studentId: string): Promise<MasteryState[]> {
    await this.prisma.ensureConnected();
    const records = await this.prisma.studentTopicMastery.findMany({
      where: { studentId },
      include: { topic: true },
    });
    return records.map((r) => ({
      studentId,
      topicCode: r.topic.code,
      topicName: r.topic.name,
      pKnown: r.pKnown,
    }));
  }

  async getCourseMastery(
    courseId: string,
  ): Promise<CourseStudentMasteryView[]> {
    await this.prisma.ensureConnected();

    const [enrollments, topics] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { courseId, status: 'ACTIVE' },
        include: {
          student: {
            include: {
              topicMastery: { include: { topic: true } },
              attempts: {
                where: { courseId },
                include: { exercise: true, errorTag: true },
                orderBy: { createdAt: 'desc' },
                take: 20,
              },
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.topic.findMany({ orderBy: { unitId: 'asc' } }),
    ]);

    return enrollments.map(({ student }) => {
      const attempts = student.attempts.map((attempt) => {
        const content = attempt.exercise?.content ?? null;
        return {
          id: attempt.id,
          exercisePrompt: contentString(content, 'prompt'),
          isCorrect: attempt.isCorrect,
          errorTagCode: attempt.errorTag?.code ?? null,
          classifierSource: attempt.classifierSource,
          confidence: attempt.confidence,
          createdAt: attempt.createdAt.toISOString(),
        };
      });

      const errorCounts = new Map<string, number>();
      for (const attempt of student.attempts) {
        if (!attempt.errorTag || attempt.isCorrect) continue;
        errorCounts.set(
          attempt.errorTag.code,
          (errorCounts.get(attempt.errorTag.code) ?? 0) + 1,
        );
      }
      const totalErrors = Array.from(errorCounts.values()).reduce(
        (sum, count) => sum + count,
        0,
      );
      const errorFrequency = Array.from(errorCounts.entries())
        .sort(([, left], [, right]) => right - left)
        .map(([errorTagCode, count]) => ({
          errorTagCode,
          count,
          percentage: totalErrors > 0 ? count / totalErrors : 0,
        }));

      return {
        studentId: student.id,
        displayName: student.displayName,
        topics: topics.map((topic) => {
          const existing = student.topicMastery.find(
            (record) => record.topicId === topic.id,
          );
          const attemptsCount = student.attempts.filter(
            (a) => a.exercise?.topicId === topic.id,
          ).length;
          return {
            topicCode: topic.code,
            topicName: topic.name,
            pKnown: existing?.pKnown ?? topic.bktPL0,
            attemptsCount,
          };
        }),
        attempts,
        errorFrequency,
      };
    });
  }

  // Legacy compat: get mastery by old-style classroomId (now courseId)
  async getClassroomMastery(
    courseId: string,
  ): Promise<CourseStudentMasteryView[]> {
    return this.getCourseMastery(courseId);
  }
}
