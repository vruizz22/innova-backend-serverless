import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ParentService } from '@modules/parent/parent.service';
import { PrismaService } from '@infrastructure/database/prisma.service';

function buildMockPrisma(
  overrides: Partial<Record<string, unknown>> = {},
): PrismaService {
  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    parent: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'parent-1', userId: 'user-1' }),
    },
    parentLink: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest
        .fn()
        .mockResolvedValue({ parentId: 'parent-1', studentId: 'stu-1' }),
    },
    student: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'stu-1', displayName: 'Ana' }),
    },
    studentTopicMastery: { findMany: jest.fn().mockResolvedValue([]) },
    topic: { findMany: jest.fn().mockResolvedValue([]) },
    enrollment: { findMany: jest.fn().mockResolvedValue([]) },
    guide: { findMany: jest.fn().mockResolvedValue([]) },
    teacherAlert: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaService;
}

describe('ParentService', () => {
  it('throws NotFound when the user has no parent profile', async () => {
    const prisma = buildMockPrisma();
    (prisma.parent.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ParentService(prisma);

    await expect(service.listChildren('user-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists only confirmed children', async () => {
    const prisma = buildMockPrisma();
    (prisma.parentLink.findMany as jest.Mock).mockResolvedValue([
      {
        studentId: 'stu-1',
        relationship: 'madre',
        student: { id: 'stu-1', displayName: 'Ana' },
      },
    ]);
    const service = new ParentService(prisma);

    const children = await service.listChildren('user-1');

    expect(prisma.parentLink.findMany as jest.Mock).toHaveBeenCalledWith({
      where: { parentId: 'parent-1', confirmedAt: { not: null } },
      include: { student: { select: { id: true, displayName: true } } },
    });
    expect(children).toEqual([
      { studentId: 'stu-1', displayName: 'Ana', relationship: 'madre' },
    ]);
  });

  it('forbids a child summary when no confirmed link exists', async () => {
    const prisma = buildMockPrisma();
    (prisma.parentLink.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new ParentService(prisma);

    await expect(
      service.getChildSummary('user-1', 'stu-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('maps unit pKnown to qualitative bands (COPPA: no raw numbers)', async () => {
    const prisma = buildMockPrisma();
    // Two units, sequence order; topics drive the band.
    (prisma.topic.findMany as jest.Mock).mockResolvedValue([
      {
        id: 't1',
        unitId: 'u1',
        code: 'T1',
        name: 'Suma',
        bktPL0: 0.3,
        unit: { code: 'U1', name: 'Unidad 1', sequence: 1 },
      },
      {
        id: 't2',
        unitId: 'u2',
        code: 'T2',
        name: 'Resta',
        bktPL0: 0.3,
        unit: { code: 'U2', name: 'Unidad 2', sequence: 2 },
      },
    ]);
    (prisma.studentTopicMastery.findMany as jest.Mock).mockResolvedValue([
      { topicId: 't1', pKnown: 0.9 }, // high
      { topicId: 't2', pKnown: 0.2 }, // low
    ]);
    const service = new ParentService(prisma);

    const summary = await service.getChildSummary('user-1', 'stu-1');

    expect(summary.units).toEqual([
      { unitId: 'u1', code: 'U1', name: 'Unidad 1', band: 'high' },
      { unitId: 'u2', code: 'U2', name: 'Unidad 2', band: 'low' },
    ]);
    // No raw pKnown leaks into the payload.
    expect(JSON.stringify(summary.units)).not.toContain('0.9');
  });
});
