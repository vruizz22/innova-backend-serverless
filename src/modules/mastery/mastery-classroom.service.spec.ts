import { MasteryService } from '@modules/mastery/mastery.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { ErrorType, ClassifierSource } from '@prisma/client';

const SKILL = {
  id: 'skill-1',
  key: 'subtraction_borrow',
  name: 'Resta con préstamo',
  bktParams: { pL0: 0.3 },
};

const STUDENT_WITH_ATTEMPTS = {
  id: 'student-1',
  userId: 'user-1',
  classroomId: 'class-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { email: 'student1@innova.demo' },
  mastery: [{ skillId: 'skill-1', pKnown: 0.65 }],
  attempts: [
    {
      id: 'attempt-1',
      itemId: 'item-1',
      item: {
        skillId: 'skill-1',
        content: { prompt: '53 - 26 = ?', expectedAnswer: 27 },
      },
      isCorrect: false,
      errorType: ErrorType.BORROW_OMITTED,
      classifierSource: ClassifierSource.RULE_ENGINE,
      confidence: 0.93,
      rawSteps: [{ expression: '53 - 26 = 33', isFinal: true }],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'attempt-2',
      itemId: null,
      item: null,
      isCorrect: true,
      errorType: null,
      classifierSource: ClassifierSource.RULE_ENGINE,
      confidence: 1.0,
      rawSteps: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

function buildMockPrismaForClassroom(): PrismaService {
  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    student: {
      findMany: jest.fn().mockResolvedValue([STUDENT_WITH_ATTEMPTS]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    skill: {
      findMany: jest.fn().mockResolvedValue([SKILL]),
      findUnique: jest.fn().mockResolvedValue(SKILL),
    },
    studentSkillMastery: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { skillId: 'skill-1', pKnown: 0.65, skill: SKILL },
        ]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

describe('MasteryService — getClassroomMastery', () => {
  let service: MasteryService;

  beforeEach(() => {
    service = new MasteryService(buildMockPrismaForClassroom());
  });

  it('returns classroom mastery views for all students', async () => {
    const views = await service.getClassroomMastery('class-1');
    expect(Array.isArray(views)).toBe(true);
    expect(views.length).toBe(1);
  });

  it('includes studentId and studentName in each view', async () => {
    const [view] = await service.getClassroomMastery('class-1');
    expect(view.studentId).toBe('student-1');
    expect(typeof view.studentName).toBe('string');
    expect(view.studentName.length).toBeGreaterThan(0);
  });

  it('includes skills array with pKnown per skill', async () => {
    const [view] = await service.getClassroomMastery('class-1');
    expect(Array.isArray(view.skills)).toBe(true);
    expect(view.skills[0].skillKey).toBe('subtraction_borrow');
    expect(typeof view.skills[0].pKnown).toBe('number');
  });

  it('includes attempts array', async () => {
    const [view] = await service.getClassroomMastery('class-1');
    expect(Array.isArray(view.attempts)).toBe(true);
    expect(view.attempts.length).toBe(2);
  });

  it('includes errorFrequency sorted by count desc', async () => {
    const [view] = await service.getClassroomMastery('class-1');
    expect(Array.isArray(view.errorFrequency)).toBe(true);
    // Only 1 error (attempt-2 is correct so not counted)
    expect(view.errorFrequency.length).toBe(1);
    expect(view.errorFrequency[0].errorType).toBe('BORROW_OMITTED');
    expect(view.errorFrequency[0].count).toBe(1);
    expect(view.errorFrequency[0].percentage).toBe(1);
  });

  it('returns empty array for classroom with no students', async () => {
    const emptyPrisma = {
      ensureConnected: jest.fn().mockResolvedValue(undefined),
      student: { findMany: jest.fn().mockResolvedValue([]) },
      skill: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const emptyService = new MasteryService(emptyPrisma);
    const views = await emptyService.getClassroomMastery('unknown-class');
    expect(views).toEqual([]);
  });
});

describe('MasteryService — getStudentMastery', () => {
  let service: MasteryService;

  beforeEach(() => {
    service = new MasteryService(buildMockPrismaForClassroom());
  });

  it('returns mastery records for a student', async () => {
    const records = await service.getStudentMastery('student-1');
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBe(1);
    expect(records[0].skillKey).toBe('subtraction_borrow');
    expect(records[0].pKnown).toBe(0.65);
  });
});
