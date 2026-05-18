import { AlertsService } from '@modules/alerts/alerts.service';
import { PrismaService } from '@infrastructure/database/prisma.service';

const BASE_ALERT = {
  id: 'alert-1',
  teacherId: 'teacher-1',
  courseId: 'course-1',
  topicId: null,
  studentId: null,
  alertType: 'AT_RISK_STUDENT',
  severity: 'MED',
  payload: { message: 'Test alert' },
  createdAt: new Date(),
  resolvedAt: null,
  resolvedBy: null,
};

function buildMockPrisma(): PrismaService {
  const alerts = new Map<string, typeof BASE_ALERT>();
  alerts.set('alert-1', { ...BASE_ALERT });

  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    teacherAlert: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const alert = { ...BASE_ALERT, id: 'new-alert', ...data };
          alerts.set(alert.id, alert as typeof BASE_ALERT);
          return Promise.resolve(alert);
        }),
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { courseId: string; resolvedAt: null } }) => {
            return Promise.resolve(
              Array.from(alerts.values()).filter(
                (a) => a.courseId === where.courseId && a.resolvedAt === null,
              ),
            );
          },
        ),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) => {
          return Promise.resolve(alerts.get(where.id) ?? null);
        }),
      update: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const existing = alerts.get(where.id);
            if (!existing) return Promise.resolve(null);
            const updated = { ...existing, ...data };
            alerts.set(where.id, updated as typeof BASE_ALERT);
            return Promise.resolve(updated);
          },
        ),
    },
  } as unknown as PrismaService;
}

describe('AlertsService', () => {
  let service: AlertsService;

  beforeEach(() => {
    service = new AlertsService(buildMockPrisma());
  });

  it('create — creates an alert and returns AlertView', async () => {
    const result = await service.create({
      teacherId: 'teacher-1',
      courseId: 'course-1',
      alertType: 'AT_RISK_STUDENT',
      severity: 'HIGH',
      payload: { message: 'Test' },
    });
    expect(result.id).toBe('new-alert');
    expect(result.alertType).toBe('AT_RISK_STUDENT');
    expect(result.resolvedAt).toBeNull();
  });

  it('findByCourse — returns active alerts for course', async () => {
    const alerts = await service.findByCourse('course-1');
    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].courseId).toBe('course-1');
  });

  it('findByCourse — returns empty array for unknown course', async () => {
    const alerts = await service.findByCourse('unknown-course');
    expect(alerts).toHaveLength(0);
  });

  it('resolve — marks alert as resolved', async () => {
    const result = await service.resolve('alert-1');
    expect(result).not.toBeNull();
    expect(result?.resolvedAt).not.toBeNull();
  });

  it('resolve — returns null for unknown alert', async () => {
    const result = await service.resolve('nonexistent-id');
    expect(result).toBeNull();
  });

  it('findByClassroom — is alias for findByCourse', async () => {
    const result = await service.findByClassroom('course-1');
    expect(Array.isArray(result)).toBe(true);
  });
});
