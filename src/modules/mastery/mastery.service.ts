import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';

export interface MasteryState {
  studentId: string;
  skillKey: string;
  skillLabel?: string;
  pKnown: number;
}

export interface AttemptHistoryView {
  id: string;
  itemContent: { problem: string; canonicalSolution: string };
  finalAnswer: string;
  isCorrect: boolean;
  errorType: string | null;
  classifierSource: string;
  confidence: number | null;
  durationMs: number;
  createdAt: string;
}

export interface ErrorFrequencyView {
  errorType: string;
  count: number;
  percentage: number;
}

export interface ClassroomStudentMasteryView {
  studentId: string;
  studentName: string;
  skills: Array<{
    skillKey: string;
    skillLabel: string;
    pKnown: number;
    attemptsCount: number;
  }>;
  attempts: AttemptHistoryView[];
  errorFrequency: ErrorFrequencyView[];
}

function displayStudentName(email: string): string {
  const localPart = email.split('@')[0] ?? email;
  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function finalExpression(rawSteps: unknown): string {
  if (!Array.isArray(rawSteps)) return '';
  const items: unknown[] = rawSteps;
  const finalStep: unknown = [...items]
    .reverse()
    .find(
      (step) =>
        step !== null &&
        typeof step === 'object' &&
        (step as { isFinal?: unknown }).isFinal === true,
    );
  const step: unknown = finalStep ?? items.at(-1);
  if (!step || typeof step !== 'object') return '';
  const expression = (step as { expression?: unknown }).expression;
  return typeof expression === 'string' ? expression : '';
}

@Injectable()
export class MasteryService {
  constructor(private readonly prisma: PrismaService) {}

  async applyAttempt(
    studentId: string,
    skillKey: string,
    isCorrect: boolean,
  ): Promise<MasteryState> {
    await this.prisma.ensureConnected();

    const skill = await this.prisma.skill.findUnique({
      where: { key: skillKey },
      include: { bktParams: true },
    });

    const pL0 = skill?.bktParams?.pL0 ?? 0.3;
    const pT = skill?.bktParams?.pT ?? 0.1;
    const pS = skill?.bktParams?.pS ?? 0.1;
    const pG = skill?.bktParams?.pG ?? 0.2;

    const existing = skill
      ? await this.prisma.studentSkillMastery.findUnique({
          where: { studentId_skillId: { studentId, skillId: skill.id } },
        })
      : null;

    const prior = existing?.pKnown ?? pL0;

    const posteriorGivenObs = isCorrect
      ? ((1 - pS) * prior) / ((1 - pS) * prior + pG * (1 - prior))
      : (pS * prior) / (pS * prior + (1 - pG) * (1 - prior));

    const pKnown = Math.min(
      1,
      Math.max(0, posteriorGivenObs + (1 - posteriorGivenObs) * pT),
    );

    if (skill) {
      await this.prisma.studentSkillMastery.upsert({
        where: { studentId_skillId: { studentId, skillId: skill.id } },
        create: { studentId, skillId: skill.id, pKnown },
        update: { pKnown },
      });
    }

    return { studentId, skillKey, pKnown };
  }

  async getStudentMastery(studentId: string): Promise<MasteryState[]> {
    await this.prisma.ensureConnected();
    const records = await this.prisma.studentSkillMastery.findMany({
      where: { studentId },
      include: { skill: true },
    });
    return records.map((r) => ({
      studentId,
      skillKey: r.skill.key,
      skillLabel: r.skill.name,
      pKnown: r.pKnown,
    }));
  }

  async getClassroomMastery(
    classroomId: string,
  ): Promise<ClassroomStudentMasteryView[]> {
    await this.prisma.ensureConnected();

    const [students, skills] = await Promise.all([
      this.prisma.student.findMany({
        where: { classroomId },
        include: {
          user: { select: { email: true } },
          mastery: { include: { skill: true } },
          attempts: {
            include: { item: true },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.skill.findMany({
        include: { bktParams: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return students.map((student) => {
      const attemptsBySkill = new Map<string, number>();
      for (const attempt of student.attempts) {
        const skillId = attempt.item?.skillId;
        if (!skillId) continue;
        attemptsBySkill.set(skillId, (attemptsBySkill.get(skillId) ?? 0) + 1);
      }

      const attempts = student.attempts.map((attempt) => {
        const content = attempt.item?.content ?? null;
        return {
          id: attempt.id,
          itemContent: {
            problem: contentString(content, 'prompt'),
            canonicalSolution: String(contentString(content, 'expectedAnswer')),
          },
          finalAnswer: finalExpression(attempt.rawSteps),
          isCorrect: attempt.isCorrect,
          errorType: attempt.errorType,
          classifierSource: attempt.classifierSource,
          confidence: attempt.confidence,
          durationMs: 0,
          createdAt: attempt.createdAt.toISOString(),
        };
      });

      const errorCounts = new Map<string, number>();
      for (const attempt of student.attempts) {
        if (!attempt.errorType || attempt.isCorrect) continue;
        errorCounts.set(
          attempt.errorType,
          (errorCounts.get(attempt.errorType) ?? 0) + 1,
        );
      }
      const totalErrors = Array.from(errorCounts.values()).reduce(
        (sum, count) => sum + count,
        0,
      );
      const errorFrequency = Array.from(errorCounts.entries())
        .sort(([, left], [, right]) => right - left)
        .map(([errorType, count]) => ({
          errorType,
          count,
          percentage: totalErrors > 0 ? count / totalErrors : 0,
        }));

      return {
        studentId: student.id,
        studentName: displayStudentName(student.user.email),
        skills: skills.map((skill) => {
          const existing = student.mastery.find(
            (record) => record.skillId === skill.id,
          );
          return {
            skillKey: skill.key,
            skillLabel: skill.name,
            pKnown: existing?.pKnown ?? skill.bktParams?.pL0 ?? 0.3,
            attemptsCount: attemptsBySkill.get(skill.id) ?? 0,
          };
        }),
        attempts,
        errorFrequency,
      };
    });
  }
}
