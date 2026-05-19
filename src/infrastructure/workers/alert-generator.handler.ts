import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

const logger = new Logger('AlertGenerator');

const AT_RISK_P_KNOWN_THRESHOLD = 0.4;
const AT_RISK_MIN_TOPICS = 2;
const STUDENT_DROP_DAYS = 3;
const UNIT_OFF_TRACK_THRESHOLD = 0.3;

interface AlertInput {
  teacherId: string;
  courseId: string;
  topicId: string | null;
  studentId: string | null;
  alertType: string;
  severity: string;
  payload: Prisma.InputJsonValue;
}

async function upsertAlertDedup(
  prisma: PrismaClient,
  alert: AlertInput,
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.teacherAlert.findFirst({
    where: {
      teacherId: alert.teacherId,
      alertType: alert.alertType,
      topicId: alert.topicId,
      studentId: alert.studentId,
      createdAt: { gte: today },
      resolvedAt: null,
    },
  });

  if (!existing) {
    await prisma.teacherAlert.create({ data: alert });
    logger.log(
      `Created alert type=${alert.alertType} teacher=${alert.teacherId}`,
    );
  }
}

export const handler = async (): Promise<void> => {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    logger.warn('DATABASE_URL not set — alert generator skipped');
    return;
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();

    const dropThreshold = new Date(
      Date.now() - STUDENT_DROP_DAYS * 24 * 60 * 60 * 1000,
    );

    const courses = await prisma.course.findMany({
      where: { archivedAt: null },
      include: {
        courseTeachers: { select: { teacherId: true } },
        enrollments: {
          where: { status: 'ACTIVE' },
          include: {
            student: {
              include: {
                topicMastery: {
                  include: {
                    topic: {
                      include: { unit: true },
                    },
                  },
                },
                attempts: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { createdAt: true, errorTagId: true },
                },
              },
            },
          },
        },
      },
    });

    for (const course of courses) {
      const teacherId = course.courseTeachers[0]?.teacherId;
      if (!teacherId) continue;

      // Aggregate unit p_known across all enrolled students
      const unitStats = new Map<
        string,
        { sum: number; count: number; name: string }
      >();

      for (const enrollment of course.enrollments) {
        const student = enrollment.student;

        // AT_RISK_STUDENT: p_known < threshold in ≥ N active topics
        const atRiskTopics = student.topicMastery.filter(
          (m) => m.pKnown < AT_RISK_P_KNOWN_THRESHOLD,
        );
        if (atRiskTopics.length >= AT_RISK_MIN_TOPICS) {
          await upsertAlertDedup(prisma, {
            teacherId,
            courseId: course.id,
            topicId: atRiskTopics[0].topicId,
            studentId: student.id,
            alertType: 'AT_RISK_STUDENT',
            severity: 'HIGH',
            payload: {
              message: `${student.displayName} tiene p_known < ${AT_RISK_P_KNOWN_THRESHOLD} en ${atRiskTopics.length} temas`,
              topics: atRiskTopics.map((m) => ({
                code: m.topic.code,
                pKnown: m.pKnown,
              })),
            } as Prisma.InputJsonValue,
          });
        }

        // STUDENT_DROP: no attempts in last N days
        const lastAttempt = student.attempts[0];
        if (!lastAttempt || lastAttempt.createdAt < dropThreshold) {
          await upsertAlertDedup(prisma, {
            teacherId,
            courseId: course.id,
            topicId: null,
            studentId: student.id,
            alertType: 'STUDENT_DROP',
            severity: 'MED',
            payload: {
              message: `${student.displayName} lleva más de ${STUDENT_DROP_DAYS} días sin intentos`,
              lastAttemptAt: lastAttempt?.createdAt?.toISOString() ?? null,
            } as Prisma.InputJsonValue,
          });
        }

        // Accumulate unit mastery for UNIT_OFF_TRACK check
        for (const mastery of student.topicMastery) {
          const unitId = mastery.topic.unitId;
          const unitName = mastery.topic.unit.name;
          const prev = unitStats.get(unitId) ?? {
            sum: 0,
            count: 0,
            name: unitName,
          };
          unitStats.set(unitId, {
            sum: prev.sum + mastery.pKnown,
            count: prev.count + 1,
            name: unitName,
          });
        }
      }

      // UNIT_OFF_TRACK: course-wide average p_known in a unit < threshold
      for (const [unitId, stats] of unitStats.entries()) {
        const avgPKnown = stats.count > 0 ? stats.sum / stats.count : 0;
        if (avgPKnown < UNIT_OFF_TRACK_THRESHOLD) {
          await upsertAlertDedup(prisma, {
            teacherId,
            courseId: course.id,
            topicId: null,
            studentId: null,
            alertType: 'UNIT_OFF_TRACK',
            severity: 'HIGH',
            payload: {
              message: `Promedio p_known=${avgPKnown.toFixed(2)} en unidad "${stats.name}"`,
              unitId,
              avgPKnown,
            } as Prisma.InputJsonValue,
          });
        }
      }
    }

    logger.log('Alert generator cycle complete');
  } catch (err) {
    logger.error(
      `Alert generator error: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  } finally {
    await prisma.$disconnect();
  }
};
