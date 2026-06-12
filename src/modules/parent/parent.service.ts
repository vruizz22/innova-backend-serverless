import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';

/** COPPA: parents see qualitative bands, never raw p_known numbers. */
export type MasteryBand = 'low' | 'mid' | 'high';

function toBand(pKnown: number): MasteryBand {
  if (pKnown >= 0.7) return 'high';
  if (pKnown >= 0.4) return 'mid';
  return 'low';
}

export interface ParentChild {
  studentId: string;
  displayName: string;
  relationship: string;
}

export interface ParentChildSummary {
  student: { id: string; displayName: string };
  units: Array<{ unitId: string; code: string; name: string; band: MasteryBand }>;
  recentGuides: Array<{
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
    gradedQuestions: number;
    totalQuestions: number;
  }>;
  alerts: Array<{ id: string; severity: string; alertType: string; createdAt: string }>;
}

@Injectable()
export class ParentService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveParent(userId: string) {
    const parent = await this.prisma.parent.findFirst({ where: { userId } });
    if (!parent) {
      throw new NotFoundException('Parent profile not found for current user');
    }
    return parent;
  }

  /** The parent's confirmed children. */
  async listChildren(parentUserId: string): Promise<ParentChild[]> {
    await this.prisma.ensureConnected();
    const parent = await this.resolveParent(parentUserId);

    const links = await this.prisma.parentLink.findMany({
      where: { parentId: parent.id, confirmedAt: { not: null } },
      include: { student: { select: { id: true, displayName: true } } },
    });

    return links.map((l) => ({
      studentId: l.studentId,
      displayName: l.student.displayName,
      relationship: l.relationship,
    }));
  }

  /** Asserts the (parent, student) link exists and is confirmed. */
  private async assertLinked(parentId: string, studentId: string): Promise<void> {
    const link = await this.prisma.parentLink.findFirst({
      where: { parentId, studentId, confirmedAt: { not: null } },
    });
    if (!link) throw new ForbiddenException('This child is not linked to your account');
  }

  async getChildSummary(
    parentUserId: string,
    studentId: string,
  ): Promise<ParentChildSummary> {
    await this.prisma.ensureConnected();
    const parent = await this.resolveParent(parentUserId);
    await this.assertLinked(parent.id, studentId);

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, displayName: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const [mastery, topics, courseIds] = await Promise.all([
      this.prisma.studentTopicMastery.findMany({ where: { studentId } }),
      this.prisma.topic.findMany({
        include: { unit: true },
        orderBy: [{ unit: { sequence: 'asc' } }, { code: 'asc' }],
      }),
      this.prisma.enrollment
        .findMany({
          where: { studentId, status: 'ACTIVE' },
          select: { courseId: true },
        })
        .then((rows) => rows.map((r) => r.courseId)),
    ]);

    // Mastery band per unit (mean of topic pKnown).
    const known = new Map(mastery.map((r) => [r.topicId, r.pKnown]));
    const byUnit = new Map<
      string,
      { code: string; name: string; sequence: number; sum: number; n: number }
    >();
    for (const t of topics) {
      const u = byUnit.get(t.unitId) ?? {
        code: t.unit.code,
        name: t.unit.name,
        sequence: t.unit.sequence,
        sum: 0,
        n: 0,
      };
      u.sum += known.get(t.id) ?? t.bktPL0;
      u.n += 1;
      byUnit.set(t.unitId, u);
    }
    const units = [...byUnit.entries()]
      .sort((a, b) => a[1].sequence - b[1].sequence)
      .map(([unitId, u]) => ({
        unitId,
        code: u.code,
        name: u.name,
        band: toBand(u.n > 0 ? u.sum / u.n : 0),
      }));

    // Recent published guides of the child's courses + progress.
    const guides =
      courseIds.length === 0
        ? []
        : await this.prisma.guide.findMany({
            where: { courseId: { in: courseIds }, status: 'PUBLISHED' },
            orderBy: { publishedAt: 'desc' },
            take: 8,
            include: {
              questions: {
                where: { status: 'APPROVED' },
                select: {
                  submissions: {
                    where: { studentId, status: 'GRADED' },
                    select: { id: true },
                    take: 1,
                  },
                },
              },
            },
          });

    const recentGuides = guides.map((g) => {
      const totalQuestions = g.questions.length;
      const gradedQuestions = g.questions.filter((q) => q.submissions.length > 0).length;
      return {
        id: g.id,
        title: g.title,
        status: g.status,
        dueAt: g.dueAt ? g.dueAt.toISOString() : null,
        gradedQuestions,
        totalQuestions,
      };
    });

    // Soft alerts (no numbers, just type + severity).
    const alertRows = await this.prisma.teacherAlert.findMany({
      where: { studentId, resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, severity: true, alertType: true, createdAt: true },
    });
    const alerts = alertRows.map((a) => ({
      id: a.id,
      severity: a.severity,
      alertType: a.alertType,
      createdAt: a.createdAt.toISOString(),
    }));

    return { student, units, recentGuides, alerts };
  }
}
