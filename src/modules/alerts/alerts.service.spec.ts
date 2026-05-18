import { AlertsService } from '@modules/alerts/alerts.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { TeacherAlert } from '@prisma/client';

const BASE_ALERT: TeacherAlert = {
  id: 'alert-1',
  teacherId: 'teacher-1',
  classroomId: 'class-1',
  studentId: null,
  message: 'Test alert',
  resolved: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildMockPrisma(): PrismaService {
  const alerts = new Map<string, TeacherAlert>();
  alerts.set('alert-1', { ...BASE_ALERT });

  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    teacherAlert: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Partial<TeacherAlert> }) => {
          const alert = {
            ...BASE_ALERT,
            id: 'new-alert',
            ...data,
          } as TeacherAlert;
          alerts.set(alert.id, alert);
          return Promise.resolve(alert);
        }),
      findMany: jest
        .fn()
        .mockImplementation(
          ({
            where,
          }: {
            where: { classroomId: string; resolved: boolean };
          }) => {
            return Promise.resolve(
              Array.from(alerts.values()).filter(
                (a) =>
                  a.classroomId === where.classroomId &&
                  a.resolved === where.resolved,
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
            data: Partial<TeacherAlert>;
          }) => {
            const existing = alerts.get(where.id);
            if (!existing) return Promise.resolve(null);
            const updated = { ...existing, ...data } as TeacherAlert;
            alerts.set(where.id, updated);
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

  it('creates an alert', async () => {
    const alert = await service.create('class-1', 'New alert', 'teacher-1');
    expect(alert.message).toBe('New alert');
    expect(alert.classroomId).toBe('class-1');
    expect(alert.teacherId).toBe('teacher-1');
  });

  it('findByClassroom returns unresolved alerts for given classroom', async () => {
    const alerts = await service.findByClassroom('class-1');
    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.every((a) => !a.resolved)).toBe(true);
    expect(alerts.every((a) => a.classroomId === 'class-1')).toBe(true);
  });

  it('findByClassroom returns empty array for unknown classroom', async () => {
    const alerts = await service.findByClassroom('unknown');
    expect(alerts).toHaveLength(0);
  });

  it('resolve marks alert as resolved', async () => {
    const resolved = await service.resolve('alert-1');
    expect(resolved?.resolved).toBe(true);
  });

  it('resolve returns null for non-existent alert', async () => {
    const result = await service.resolve('non-existent');
    expect(result).toBeNull();
  });
});
