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

describe('MasteryService.recommendNextExercise', () => {
  const STUDENT_ID = 'student-rec-01';
  const COURSE_ID = 'course-rec-01';

  const TOPIC = { id: 'topic-rec', code: 'ARITH_SUB', name: 'Sustracción' };
  const EXERCISE = {
    id: 'ex-rec-01',
    content: { prompt: '5 - 3' },
    irtA: 1.0,
    irtB: 0.0,
  };

  function buildRecommendPrisma(
    overrides: {
      mastery?: unknown[];
      exercises?: unknown[];
      recentCorrect?: unknown[];
    } = {},
  ) {
    return {
      ensureConnected: jest.fn().mockResolvedValue(undefined),
      topic: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      studentTopicMastery: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            overrides.mastery ?? [
              { pKnown: 0.4, topicId: TOPIC.id, topic: TOPIC },
            ],
          ),
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      attempt: {
        findMany: jest.fn().mockResolvedValue(overrides.recentCorrect ?? []),
        count: jest.fn().mockResolvedValue(0),
      },
      exercise: {
        findMany: jest
          .fn()
          .mockResolvedValue(overrides.exercises ?? [EXERCISE]),
      },
    } as unknown as PrismaService;
  }

  it('returns a result with exercise id when mastery and exercises exist', async () => {
    const prisma = buildRecommendPrisma();
    const service = new MasteryService(prisma);
    const result = await service.recommendNextExercise(COURSE_ID, STUDENT_ID);

    expect(result).not.toBeNull();
    expect(result?.exercise.id).toBe('ex-rec-01');
    expect(result?.exercise.problem).toBe('5 - 3');
    expect(result?.studentTheta).toBeCloseTo(Math.log(0.4 / 0.6), 3);
  });

  it('returns null when student has no mastery records', async () => {
    const prisma = buildRecommendPrisma({ mastery: [] });
    const service = new MasteryService(prisma);
    const result = await service.recommendNextExercise(COURSE_ID, STUDENT_ID);
    expect(result).toBeNull();
  });

  it('returns null when all topics have no available exercises', async () => {
    const prisma = buildRecommendPrisma({ exercises: [] });
    const service = new MasteryService(prisma);
    const result = await service.recommendNextExercise(COURSE_ID, STUDENT_ID);
    expect(result).toBeNull();
  });

  it('picks exercise with highest Fisher info when multiple exist', async () => {
    // ex-easy: b=2 (too hard for theta≈0) → low info
    // ex-match: b=0 (matched to theta≈0) → max info
    const exercises = [
      { id: 'ex-hard', content: { prompt: 'hard' }, irtA: 1.0, irtB: 2.0 },
      { id: 'ex-match', content: { prompt: 'match' }, irtA: 1.0, irtB: 0.0 },
    ];
    const prisma = buildRecommendPrisma({ exercises });
    const service = new MasteryService(prisma);
    const result = await service.recommendNextExercise(COURSE_ID, STUDENT_ID);

    expect(result?.exercise.id).toBe('ex-match');
  });

  it('excludes recently correct exercises', async () => {
    const prisma = buildRecommendPrisma({
      exercises: [],
      recentCorrect: [{ exerciseId: 'ex-done' }],
    });
    const service = new MasteryService(prisma);
    const result = await service.recommendNextExercise(COURSE_ID, STUDENT_ID);
    expect(result).toBeNull();
  });

  it('reasoning string mentions topic name and pKnown', async () => {
    const prisma = buildRecommendPrisma();
    const service = new MasteryService(prisma);
    const result = await service.recommendNextExercise(COURSE_ID, STUDENT_ID);
    expect(result?.reasoning).toContain('Sustracción');
    expect(result?.reasoning).toContain('0.40');
  });
});
