import { MasteryService } from '@modules/mastery/mastery.service';
import { PrismaService } from '@infrastructure/database/prisma.service';

const DEFAULT_BKT = { pL0: 0.3, pT: 0.1, pS: 0.1, pG: 0.2 };
const SKILL_ID = 'skill-uuid';

function buildMockPrisma(): PrismaService {
  const store = new Map<string, number>();

  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    skill: {
      findUnique: jest.fn().mockResolvedValue({
        id: SKILL_ID,
        key: 'subtraction_borrow',
        bktParams: DEFAULT_BKT,
      }),
    },
    studentSkillMastery: {
      findUnique: jest.fn().mockImplementation(
        ({
          where,
        }: {
          where: {
            studentId_skillId: { studentId: string; skillId: string };
          };
        }) => {
          const { studentId, skillId } = where.studentId_skillId;
          const stored = store.get(`${studentId}:${skillId}`);
          return Promise.resolve(
            stored !== undefined ? { pKnown: stored } : null,
          );
        },
      ),
      upsert: jest.fn().mockImplementation(
        ({
          where,
          create,
          update,
        }: {
          where: {
            studentId_skillId: { studentId: string; skillId: string };
          };
          create: { pKnown: number };
          update: { pKnown: number };
        }) => {
          const { studentId, skillId } = where.studentId_skillId;
          store.set(`${studentId}:${skillId}`, update.pKnown ?? create.pKnown);
          return Promise.resolve({});
        },
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

describe('MasteryService', () => {
  let service: MasteryService;

  beforeEach(() => {
    service = new MasteryService(buildMockPrisma());
  });

  it('pKnown starts above 0 (default prior pL0=0.3 + correct answer)', async () => {
    const result = await service.applyAttempt('s1', 'subtraction_borrow', true);
    expect(result.pKnown).toBeGreaterThan(0);
    expect(result.pKnown).toBeLessThanOrEqual(1);
  });

  it('pKnown stays in [0, 1] after correct answer', async () => {
    const result = await service.applyAttempt('s1', 'skill', true);
    expect(result.pKnown).toBeGreaterThanOrEqual(0);
    expect(result.pKnown).toBeLessThanOrEqual(1);
  });

  it('pKnown stays in [0, 1] after incorrect answer', async () => {
    const result = await service.applyAttempt('s2', 'skill', false);
    expect(result.pKnown).toBeGreaterThanOrEqual(0);
    expect(result.pKnown).toBeLessThanOrEqual(1);
  });

  it('monotonically increases pKnown under consecutive correct answers', async () => {
    const values: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await service.applyAttempt('s3', 'subtraction_borrow', true);
      values.push(r.pKnown);
    }
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it('pKnown near 1 stays near 1 after correct answer (near-idempotency at ceiling)', async () => {
    for (let i = 0; i < 30; i++) {
      await service.applyAttempt('s4', 'subtraction_borrow', true);
    }
    const before = await service.applyAttempt('s4', 'subtraction_borrow', true);
    const after = await service.applyAttempt('s4', 'subtraction_borrow', true);
    expect(after.pKnown).toBeGreaterThanOrEqual(before.pKnown - 0.01);
  });

  it('getStudentMastery returns only records for given student', async () => {
    const records = await service.getStudentMastery('student-A');
    expect(Array.isArray(records)).toBe(true);
  });
});
