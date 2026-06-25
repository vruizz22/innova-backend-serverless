import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { PracticeService } from '@modules/practice/practice.service';

// Helpers to build typed Prisma mock rows
function makeExercise(
  id: string,
  topicId: string,
  irtA: number,
  irtB: number,
  topicCode = 'ARITH_ADDITION',
) {
  return {
    id,
    topicId,
    irtA,
    irtB,
    content: { prompt: `Ejercicio de ${topicCode}` },
    topic: { code: topicCode, name: `Nombre ${topicCode}` },
  };
}

function makePrisma(
  overrides: Partial<{
    student: { id: string } | null;
    exercises: ReturnType<typeof makeExercise>[];
    mastery: Array<{ topicId: string; pKnown: number }>;
  }> = {},
): PrismaService {
  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    student: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.student !== undefined
            ? overrides.student
            : { id: 'student-1' },
        ),
    },
    exercise: {
      findMany: jest.fn().mockResolvedValue(overrides.exercises ?? []),
    },
    studentTopicMastery: {
      findMany: jest.fn().mockResolvedValue(overrides.mastery ?? []),
    },
  } as unknown as PrismaService;
}

describe('PracticeService — createAssignment', () => {
  let service: PracticeService;

  beforeEach(() => {
    service = new PracticeService(makePrisma());
  });

  it('returns an assignment view with provided fields', () => {
    const result = service.createAssignment(
      'student-1',
      ['item-1', 'item-2'],
      '2026-06-01',
    );
    expect(result.studentId).toBe('student-1');
    expect(result.itemIds).toEqual(['item-1', 'item-2']);
    expect(result.dueAt).toBe('2026-06-01');
    expect(result.id).toBeDefined();
  });

  it('generates a unique id for each assignment', () => {
    const a = service.createAssignment('s1', ['item-1']);
    const b = service.createAssignment('s1', ['item-1']);
    expect(a.id).not.toBe(b.id);
  });

  it('works without dueAt', () => {
    const result = service.createAssignment('student-2', ['item-3']);
    expect(result.dueAt).toBeUndefined();
  });

  it('works with empty item list', () => {
    const result = service.createAssignment('student-3', []);
    expect(result.itemIds).toEqual([]);
  });
});

describe('PracticeService — recommendNext', () => {
  it('throws NotFoundException when student does not exist', async () => {
    const service = new PracticeService(makePrisma({ student: null }));
    await expect(service.recommendNext('no-student')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when no active exercises exist', async () => {
    const service = new PracticeService(makePrisma({ exercises: [] }));
    await expect(service.recommendNext('student-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns the single exercise when only one candidate', async () => {
    const ex = makeExercise('ex-1', 'topic-1', 1.0, 0.0);
    const service = new PracticeService(
      makePrisma({ exercises: [ex], mastery: [] }),
    );
    const result = await service.recommendNext('student-1');
    expect(result.exercise.id).toBe('ex-1');
    expect(result.exercise.topicCode).toBe('ARITH_ADDITION');
    expect(result.reasoning).toContain('Fisher máx');
  });

  it('picks the exercise whose irtB is closest to student theta (max Fisher info)', async () => {
    // pKnown=0.3 → theta≈−0.85; item with b=−0.85 maximises Fisher
    // ex-near has b=−0.8 (close to theta), ex-far has b=2.0 (far from theta)
    const exercises = [
      makeExercise('ex-far', 'topic-1', 1.0, 2.0),
      makeExercise('ex-near', 'topic-1', 1.0, -0.8),
    ];
    const service = new PracticeService(
      makePrisma({ exercises, mastery: [{ topicId: 'topic-1', pKnown: 0.3 }] }),
    );
    const result = await service.recommendNext('student-1');
    expect(result.exercise.id).toBe('ex-near');
  });

  it('uses default pKnown=0.3 when student has no mastery record', async () => {
    const exercises = [
      makeExercise('ex-a', 'topic-unknown', 1.2, -0.9),
      makeExercise('ex-b', 'topic-unknown', 1.2, 2.5),
    ];
    const service = new PracticeService(makePrisma({ exercises, mastery: [] }));
    const result = await service.recommendNext('student-1');
    // theta from pKnown=0.3 ≈ −0.85; ex-a (b=−0.9) should be closer
    expect(result.exercise.id).toBe('ex-a');
    expect(result.studentTheta).toBeCloseTo(Math.log(0.3 / 0.7), 5);
  });

  it('passes domainId filter to prisma exercise query', async () => {
    const ex = makeExercise('ex-1', 'topic-1', 1.0, 0.0);
    const prisma = makePrisma({ exercises: [ex] });
    const service = new PracticeService(prisma);
    await service.recommendNext('student-1', 'domain-abc');
    expect(prisma.exercise.findMany as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ topic: { domainId: 'domain-abc' } }),
      }),
    );
  });

  it('returns exercise detail and theta in the response', async () => {
    const ex = makeExercise('ex-1', 'topic-1', 1.5, 0.0);
    const service = new PracticeService(
      makePrisma({
        exercises: [ex],
        mastery: [{ topicId: 'topic-1', pKnown: 0.5 }],
      }),
    );
    const result = await service.recommendNext('student-1');
    // pKnown=0.5 → theta=0; b=0 → max Fisher point → I=a²*0.25=0.5625
    expect(result.studentTheta).toBeCloseTo(0, 5);
    expect(result.exercise.irtA).toBe(1.5);
    expect(result.exercise.topicName).toBe('Nombre ARITH_ADDITION');
    expect(result.exercise.problem).toContain('ARITH_ADDITION');
  });

  it('handles multiple topics with different mastery levels', async () => {
    // topic-easy: pKnown=0.9 → theta≈2.2; topic-hard: pKnown=0.1 → theta≈−2.2
    // ex on topic-easy with b=2.0 vs ex on topic-hard with b=−2.0
    const exercises = [
      makeExercise('ex-easy', 'topic-easy', 1.0, 2.0),
      makeExercise('ex-hard', 'topic-hard', 1.0, -2.0),
    ];
    const mastery = [
      { topicId: 'topic-easy', pKnown: 0.9 },
      { topicId: 'topic-hard', pKnown: 0.1 },
    ];
    const service = new PracticeService(makePrisma({ exercises, mastery }));
    const result = await service.recommendNext('student-1');
    // Both b ≈ theta for their respective topic → similar Fisher; both should be valid picks
    expect(['ex-easy', 'ex-hard']).toContain(result.exercise.id);
  });
});
