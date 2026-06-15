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
  errorTagName: string | null;
  classifierSource: string;
  confidence: number | null;
  createdAt: string;
}

export interface ErrorFrequencyView {
  errorTagCode: string;
  errorTagName: string | null;
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
          // `name` may be "" (Prisma @default) for freshly imported tags →
          // `|| null` so the FE degrades to its local humanizer, never "".
          errorTagName: attempt.errorTag?.name || null,
          classifierSource: attempt.classifierSource,
          confidence: attempt.confidence,
          createdAt: attempt.createdAt.toISOString(),
        };
      });

      const errorCounts = new Map<
        string,
        { name: string | null; count: number }
      >();
      for (const attempt of student.attempts) {
        if (!attempt.errorTag || attempt.isCorrect) continue;
        const entry = errorCounts.get(attempt.errorTag.code) ?? {
          name: attempt.errorTag.name || null,
          count: 0,
        };
        entry.count += 1;
        errorCounts.set(attempt.errorTag.code, entry);
      }
      const totalErrors = Array.from(errorCounts.values()).reduce(
        (sum, entry) => sum + entry.count,
        0,
      );
      const errorFrequency = Array.from(errorCounts.entries())
        .sort(([, left], [, right]) => right.count - left.count)
        .map(([errorTagCode, entry]) => ({
          errorTagCode,
          errorTagName: entry.name,
          count: entry.count,
          percentage: totalErrors > 0 ? entry.count / totalErrors : 0,
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

  /**
   * Student × Unit heatmap (C12). pKnown per unit is the mean of its topics'
   * pKnown (default bktPL0 when a student has no record yet). Topics are kept
   * for the drill-down (Student × Topic). Read-only.
   */
  async getCourseHeatmap(courseId: string): Promise<CourseHeatmapView> {
    await this.prisma.ensureConnected();

    const [enrollments, topics] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { courseId, status: 'ACTIVE' },
        include: { student: { include: { topicMastery: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.topic.findMany({
        include: { unit: true },
        orderBy: [{ unit: { sequence: 'asc' } }, { code: 'asc' }],
      }),
    ]);

    // Distinct units in stable curricular order.
    const unitMap = new Map<
      string,
      { id: string; code: string; name: string; sequence: number }
    >();
    for (const t of topics) {
      if (!unitMap.has(t.unitId)) {
        unitMap.set(t.unitId, {
          id: t.unit.id,
          code: t.unit.code,
          name: t.unit.name,
          sequence: t.unit.sequence,
        });
      }
    }
    const units = [...unitMap.values()].sort((a, b) => a.sequence - b.sequence);
    const topicsByUnit = new Map<string, typeof topics>();
    for (const t of topics) {
      const list = topicsByUnit.get(t.unitId) ?? [];
      list.push(t);
      topicsByUnit.set(t.unitId, list);
    }

    const students = enrollments.map(({ student }) => {
      const known = new Map(
        student.topicMastery.map((r) => [r.topicId, r.pKnown]),
      );
      const topicCells = topics.map((t) => ({
        topicId: t.id,
        unitId: t.unitId,
        topicCode: t.code,
        topicName: t.name,
        pKnown: known.get(t.id) ?? t.bktPL0,
      }));
      const unitCells = units.map((u) => {
        const us = topicsByUnit.get(u.id) ?? [];
        const sum = us.reduce(
          (acc, t) => acc + (known.get(t.id) ?? t.bktPL0),
          0,
        );
        return {
          unitId: u.id,
          pKnown: us.length > 0 ? sum / us.length : 0,
          topicCount: us.length,
        };
      });
      return {
        studentId: student.id,
        displayName: student.displayName,
        units: unitCells,
        topics: topicCells,
      };
    });

    return { courseId, units, students };
  }
}

export interface CourseHeatmapView {
  courseId: string;
  units: Array<{ id: string; code: string; name: string; sequence: number }>;
  students: Array<{
    studentId: string;
    displayName: string;
    units: Array<{ unitId: string; pKnown: number; topicCount: number }>;
    topics: Array<{
      topicId: string;
      unitId: string;
      topicCode: string;
      topicName: string;
      pKnown: number;
    }>;
  }>;
}
