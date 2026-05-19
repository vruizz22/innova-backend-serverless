import { MasteryService } from '@modules/mastery/mastery.service';
import { PrismaService } from '@infrastructure/database/prisma.service';

const TOPIC_ID = 'topic-uuid-001';
const DEFAULT_TOPIC = {
  id: TOPIC_ID,
  code: 'T-SUB-BORROW',
  name: 'Sustracción con préstamo',
  unitId: 'unit-001',
  description: null,
  bktPL0: 0.3,
  bktPTransit: 0.1,
  bktPSlip: 0.1,
  bktPGuess: 0.2,
  bktCalibratedAt: null,
};

function buildMockPrisma(): PrismaService {
  const store = new Map<string, number>();

  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    topic: {
      findUnique: jest.fn().mockResolvedValue(DEFAULT_TOPIC),
      findFirst: jest.fn().mockResolvedValue(DEFAULT_TOPIC),
      findMany: jest.fn().mockResolvedValue([DEFAULT_TOPIC]),
    },
    studentTopicMastery: {
      findUnique: jest.fn().mockImplementation(
        ({
          where,
        }: {
          where: {
            studentId_topicId: { studentId: string; topicId: string };
          };
        }) => {
          const { studentId, topicId } = where.studentId_topicId;
          const stored = store.get(`${studentId}:${topicId}`);
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
            studentId_topicId: { studentId: string; topicId: string };
          };
          create: { pKnown: number };
          update: { pKnown: number };
        }) => {
          const { studentId, topicId } = where.studentId_topicId;
          store.set(`${studentId}:${topicId}`, update.pKnown ?? create.pKnown);
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
    const result = await service.applyAttempt('s1', TOPIC_ID, true);
    expect(result.pKnown).toBeGreaterThan(0);
    expect(result.pKnown).toBeLessThanOrEqual(1);
  });

  it('pKnown stays in [0, 1] after correct answer', async () => {
    const result = await service.applyAttempt('s1', TOPIC_ID, true);
    expect(result.pKnown).toBeGreaterThanOrEqual(0);
    expect(result.pKnown).toBeLessThanOrEqual(1);
  });

  it('pKnown stays in [0, 1] after incorrect answer', async () => {
    const result = await service.applyAttempt('s2', TOPIC_ID, false);
    expect(result.pKnown).toBeGreaterThanOrEqual(0);
    expect(result.pKnown).toBeLessThanOrEqual(1);
  });

  it('monotonically increases pKnown under consecutive correct answers', async () => {
    const values: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await service.applyAttempt('s3', TOPIC_ID, true);
      values.push(r.pKnown);
    }
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it('pKnown near 1 stays near 1 after correct answer (near-idempotency at ceiling)', async () => {
    for (let i = 0; i < 30; i++) {
      await service.applyAttempt('s4', TOPIC_ID, true);
    }
    const before = await service.applyAttempt('s4', TOPIC_ID, true);
    const after = await service.applyAttempt('s4', TOPIC_ID, true);
    expect(after.pKnown).toBeGreaterThanOrEqual(before.pKnown - 0.01);
  });

  it('getStudentMastery returns records for given student', async () => {
    const records = await service.getStudentMastery('student-A');
    expect(Array.isArray(records)).toBe(true);
  });
});
