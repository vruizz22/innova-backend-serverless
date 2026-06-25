import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

function resolveDisplayName(
  displayName: string,
  email: string | null | undefined,
): string {
  if (displayName !== 'Nuevo Alumno') return displayName;
  if (email) return email.split('@')[0] ?? displayName;
  return displayName;
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

    // "Temas vivos": the heatmap axes come from the canonical taxonomy
    // (Domain → Subdomain — the same 17×106 the error catalog uses), not from the
    // 3 hardcoded Topic rows. A subdomain is shown only when it has real signal in
    // this course (a classified attempt or a BKT record), so new guides surface new
    // subdomains automatically and untouched ones never appear as a false "0%".
    const [enrollments, subdomains] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { courseId, status: 'ACTIVE' },
        include: {
          student: {
            include: {
              user: { select: { email: true } },
              topicMastery: { include: { topic: true } },
              attempts: {
                where: { courseId },
                include: {
                  exercise: { include: { topic: true } },
                  errorTag: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 50,
              },
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.subdomain.findMany({ include: { domain: true } }),
    ]);

    // ErrorTag references a subdomain by (domainId, subdomainCode) string, not FK.
    const subById = new Map(subdomains.map((s) => [s.id, s]));
    const subByDomainCode = new Map(
      subdomains.map((s) => [`${s.domainId}:${s.code}`, s]),
    );

    return enrollments.map(({ student }) => {
      const attempts = student.attempts.slice(0, 20).map((attempt) => {
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

      // Per-subdomain accuracy from real attempts, with a BKT mastery overlay.
      const stats = new Map<string, { total: number; correct: number }>();
      for (const a of student.attempts) {
        const subId = this.subdomainOfAttempt(a, subByDomainCode);
        if (!subId) continue;
        const s = stats.get(subId) ?? { total: 0, correct: 0 };
        s.total += 1;
        if (a.isCorrect) s.correct += 1;
        stats.set(subId, s);
      }
      const masteryBySub = new Map<string, number[]>();
      for (const m of student.topicMastery) {
        const subId = m.topic.subdomainId;
        if (!subId) continue;
        const arr = masteryBySub.get(subId) ?? [];
        arr.push(m.pKnown);
        masteryBySub.set(subId, arr);
      }

      const liveSubs = [...new Set([...stats.keys(), ...masteryBySub.keys()])]
        .map((id) => subById.get(id))
        .filter((s): s is (typeof subdomains)[number] => s !== undefined)
        .sort(
          (a, b) =>
            a.domain.name.localeCompare(b.domain.name) ||
            a.code.localeCompare(b.code),
        );

      const topics = liveSubs.map((sub) => ({
        topicCode: sub.code,
        topicName: sub.name,
        pKnown: this.subdomainPKnown(
          masteryBySub.get(sub.id),
          stats.get(sub.id),
        ),
        attemptsCount: stats.get(sub.id)?.total ?? 0,
      }));

      return {
        studentId: student.id,
        displayName: resolveDisplayName(
          student.displayName,
          student.user?.email,
        ),
        topics,
        attempts,
        errorFrequency,
      };
    });
  }

  /**
   * The subdomain a graded attempt belongs to: a classified error carries
   * (domainId, subdomainCode); otherwise we fall back to the exercise's topic.
   * Returns null when the attempt can't be placed (e.g. a correct guide attempt
   * with no exercise link) — it simply doesn't contribute to that cell.
   */
  private subdomainOfAttempt(
    attempt: {
      errorTag: {
        domainId: string | null;
        subdomainCode: string | null;
      } | null;
      exercise: { topic: { subdomainId: string | null } | null } | null;
    },
    subByDomainCode: Map<string, { id: string }>,
  ): string | null {
    const tag = attempt.errorTag;
    if (tag?.domainId && tag.subdomainCode) {
      const sub = subByDomainCode.get(`${tag.domainId}:${tag.subdomainCode}`);
      if (sub) return sub.id;
    }
    return attempt.exercise?.topic?.subdomainId ?? null;
  }

  /** BKT mastery mean when present, else attempt accuracy, else the BKT prior. */
  private subdomainPKnown(
    mastery: number[] | undefined,
    stats: { total: number; correct: number } | undefined,
  ): number {
    if (mastery && mastery.length > 0) {
      return mastery.reduce((x, y) => x + y, 0) / mastery.length;
    }
    if (stats && stats.total > 0) return stats.correct / stats.total;
    return 0.3;
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

    // Same taxonomy-driven model as getCourseMastery, aggregated for the
    // Student × Domain heatmap with a Student × Subdomain drill-down. Units are
    // the live Domains; topics are the live Subdomains. Read-only.
    const [enrollments, subdomains] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { courseId, status: 'ACTIVE' },
        include: {
          student: {
            include: {
              user: { select: { email: true } },
              topicMastery: { include: { topic: true } },
              attempts: {
                where: { courseId },
                include: {
                  exercise: { include: { topic: true } },
                  errorTag: true,
                },
                take: 100,
              },
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.subdomain.findMany({ include: { domain: true } }),
    ]);

    const subById = new Map(subdomains.map((s) => [s.id, s]));
    const subByDomainCode = new Map(
      subdomains.map((s) => [`${s.domainId}:${s.code}`, s]),
    );

    // Per-student pKnown by subdomain + the set of subdomains live course-wide.
    const courseLiveSubs = new Set<string>();
    const perStudent = enrollments.map(({ student }) => {
      const stats = new Map<string, { total: number; correct: number }>();
      for (const a of student.attempts) {
        const subId = this.subdomainOfAttempt(a, subByDomainCode);
        if (!subId) continue;
        const s = stats.get(subId) ?? { total: 0, correct: 0 };
        s.total += 1;
        if (a.isCorrect) s.correct += 1;
        stats.set(subId, s);
      }
      const masteryBySub = new Map<string, number[]>();
      for (const m of student.topicMastery) {
        const subId = m.topic.subdomainId;
        if (!subId) continue;
        const arr = masteryBySub.get(subId) ?? [];
        arr.push(m.pKnown);
        masteryBySub.set(subId, arr);
      }
      const subPKnown = new Map<string, number>();
      for (const subId of new Set([...stats.keys(), ...masteryBySub.keys()])) {
        if (!subById.has(subId)) continue;
        courseLiveSubs.add(subId);
        subPKnown.set(
          subId,
          this.subdomainPKnown(masteryBySub.get(subId), stats.get(subId)),
        );
      }
      return { student, subPKnown };
    });

    // Units = live Domains (stable by code); group the live subdomains under each.
    const liveDomains = new Map<
      string,
      { id: string; code: string; name: string }
    >();
    const subsByDomain = new Map<string, (typeof subdomains)[number][]>();
    for (const subId of courseLiveSubs) {
      const sub = subById.get(subId);
      if (!sub) continue;
      liveDomains.set(sub.domainId, {
        id: sub.domain.id,
        code: sub.domain.code,
        name: sub.domain.name,
      });
      const list = subsByDomain.get(sub.domainId) ?? [];
      list.push(sub);
      subsByDomain.set(sub.domainId, list);
    }
    const units = [...liveDomains.values()]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((d, idx) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        sequence: idx + 1,
      }));

    const students = perStudent.map(({ student, subPKnown }) => {
      const topicCells = [...courseLiveSubs]
        .map((id) => subById.get(id))
        .filter((s): s is (typeof subdomains)[number] => s !== undefined)
        .filter((s) => subPKnown.has(s.id))
        .map((s) => ({
          topicId: s.id,
          unitId: s.domainId,
          topicCode: s.code,
          topicName: s.name,
          pKnown: subPKnown.get(s.id) ?? 0,
        }));
      const unitCells = units
        .map((u) => {
          const subs = (subsByDomain.get(u.id) ?? []).filter((s) =>
            subPKnown.has(s.id),
          );
          const sum = subs.reduce(
            (acc, s) => acc + (subPKnown.get(s.id) ?? 0),
            0,
          );
          return {
            unitId: u.id,
            pKnown: subs.length > 0 ? sum / subs.length : 0,
            topicCount: subs.length,
          };
        })
        .filter((c) => c.topicCount > 0);
      return {
        studentId: student.id,
        displayName: resolveDisplayName(
          student.displayName,
          student.user?.email,
        ),
        units: unitCells,
        topics: topicCells,
      };
    });

    return { courseId, units, students };
  }

  /**
   * IRT Fisher-information item picker. Finds the student's weakest topic
   * (lowest pKnown), converts to ability theta via logit, then selects the
   * exercise that maximises Fisher info: I(θ) = a² · P(θ) · (1−P(θ)).
   *
   * Returns null when no active exercises are available (new students with no
   * mastery records also return null).
   */
  async recommendNextExercise(
    courseId: string,
    studentId: string,
  ): Promise<RecommendResult | null> {
    // Weakest topics first
    const mastery = await this.prisma.studentTopicMastery.findMany({
      where: { studentId },
      include: { topic: { select: { id: true, code: true, name: true } } },
      orderBy: { pKnown: 'asc' },
    });

    if (mastery.length === 0) return null;

    // Exclude exercises the student already got right in this course last 7 days
    const recentCorrect = await this.prisma.attempt.findMany({
      where: {
        studentId,
        courseId,
        isCorrect: true,
        createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      select: { exerciseId: true },
    });
    const excludeIds = new Set(
      recentCorrect.flatMap((a) => (a.exerciseId ? [a.exerciseId] : [])),
    );

    for (const m of mastery) {
      const pClamped = Math.min(0.99, Math.max(0.01, m.pKnown));
      const theta = Math.log(pClamped / (1 - pClamped));

      const whereExclusion: Prisma.ExerciseWhereInput =
        excludeIds.size > 0 ? { NOT: { id: { in: [...excludeIds] } } } : {};

      const exercises = await this.prisma.exercise.findMany({
        where: { topicId: m.topic.id, status: 'ACTIVE', ...whereExclusion },
        select: { id: true, content: true, irtA: true, irtB: true },
        take: 50,
      });

      if (exercises.length === 0) continue;

      let best = exercises[0];
      let bestInfo = -1;
      for (const ex of exercises) {
        const P = 1.0 / (1.0 + Math.exp(-ex.irtA * (theta - ex.irtB)));
        const info = ex.irtA * ex.irtA * P * (1.0 - P);
        if (info > bestInfo) {
          bestInfo = info;
          best = ex;
        }
      }

      const content = best.content as Prisma.JsonObject;
      const rawPrompt = content['prompt'];
      const rawProblem = content['problem'];
      const problem =
        typeof rawPrompt === 'string'
          ? rawPrompt
          : typeof rawProblem === 'string'
            ? rawProblem
            : '—';

      return {
        exercise: {
          id: best.id,
          problem,
          topicCode: m.topic.code,
          topicName: m.topic.name,
          irtA: best.irtA,
          irtB: best.irtB,
        },
        studentTheta: theta,
        reasoning: `Tema: ${m.topic.name} · p=${m.pKnown.toFixed(2)} · θ=${theta.toFixed(2)} · Fisher=${bestInfo.toFixed(3)}`,
      };
    }

    return null;
  }
}

export interface RecommendResult {
  exercise: {
    id: string;
    problem: string;
    topicCode: string;
    topicName: string;
    irtA: number;
    irtB: number;
  };
  studentTheta: number;
  reasoning: string;
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
