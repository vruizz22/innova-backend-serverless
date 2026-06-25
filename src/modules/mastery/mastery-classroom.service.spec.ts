import { MasteryService } from '@modules/mastery/mastery.service';
import { PrismaService } from '@infrastructure/database/prisma.service';

// Topic now links to the canonical taxonomy (subdomainId/domainId); the heatmap
// is driven by Domain → Subdomain, not by the Topic row itself.
const TOPIC = {
  id: 'topic-1',
  unitId: 'unit-1',
  subdomainId: 'sub-1',
  domainId: 'dom-1',
  code: 'T-SUB-BORROW',
  name: 'Resta con préstamo',
  description: null,
  bktPL0: 0.3,
  bktPTransit: 0.1,
  bktPSlip: 0.1,
  bktPGuess: 0.2,
  bktCalibratedAt: null,
};

const SUBDOMAIN = {
  id: 'sub-1',
  domainId: 'dom-1',
  code: 'SUB-BORROW',
  name: 'Resta con préstamo',
  domain: { id: 'dom-1', code: 'NUM-OPS', name: 'Números y operaciones' },
};

const STUDENT = {
  id: 'student-1',
  userId: 'user-1',
  displayName: 'Diego Vega',
  externalEmail: null,
  birthYear: null,
  createdAt: new Date(),
  deletedAt: null,
  topicMastery: [{ topicId: 'topic-1', pKnown: 0.65, topic: TOPIC }],
  attempts: [
    {
      id: 'attempt-1',
      exerciseId: 'exercise-1',
      exercise: {
        topicId: 'topic-1',
        topic: { subdomainId: 'sub-1', domainId: 'dom-1' },
        content: { prompt: '53 - 26 = ?', expectedAnswer: 27 },
      },
      isCorrect: false,
      errorTag: {
        id: 'tag-1',
        code: 'BORROW_OMITTED_TENS',
        name: 'Préstamo omitido en las decenas',
        domainId: 'dom-1',
        subdomainCode: 'SUB-BORROW',
      },
      classifierSource: 'RULE',
      confidence: 0.93,
      createdAt: new Date(),
    },
    {
      id: 'attempt-2',
      exerciseId: 'exercise-2',
      exercise: {
        topicId: 'topic-1',
        topic: { subdomainId: 'sub-1', domainId: 'dom-1' },
        content: { prompt: '72 - 48 = ?', expectedAnswer: 24 },
      },
      isCorrect: true,
      errorTag: null,
      classifierSource: 'RULE',
      confidence: 1.0,
      createdAt: new Date(),
    },
  ],
};

function buildMockPrisma(): PrismaService {
  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    enrollment: {
      findMany: jest.fn().mockResolvedValue([{ student: STUDENT }]),
    },
    subdomain: {
      findMany: jest.fn().mockResolvedValue([SUBDOMAIN]),
    },
    topic: {
      findMany: jest.fn().mockResolvedValue([TOPIC]),
      findUnique: jest.fn().mockResolvedValue(TOPIC),
    },
    studentTopicMastery: {
      findUnique: jest.fn().mockResolvedValue({ pKnown: 0.65 }),
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([{ topic: TOPIC, pKnown: 0.65 }]),
    },
  } as unknown as PrismaService;
}

describe('MasteryService — classroom/course mastery', () => {
  let service: MasteryService;

  beforeEach(() => {
    service = new MasteryService(buildMockPrisma());
  });

  it('getCourseMastery returns array of student mastery views', async () => {
    const result = await service.getCourseMastery('course-1');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('student view has displayName', async () => {
    const [student] = await service.getCourseMastery('course-1');
    expect(student.displayName).toBe('Diego Vega');
  });

  it('topics come from the live taxonomy (subdomain), not the Topic row', async () => {
    const [student] = await service.getCourseMastery('course-1');
    expect(Array.isArray(student.topics)).toBe(true);
    expect(student.topics).toHaveLength(1);
    expect(student.topics[0].topicCode).toBe('SUB-BORROW');
    expect(student.topics[0].topicName).toBe('Resta con préstamo');
    // BKT mastery overlay (0.65) wins over the raw accuracy proxy.
    expect(student.topics[0].pKnown).toBeCloseTo(0.65);
    expect(student.topics[0].attemptsCount).toBe(2);
  });

  it('student view has attempts with errorTagCode', async () => {
    const [student] = await service.getCourseMastery('course-1');
    expect(student.attempts).toHaveLength(2);
    expect(student.attempts[0].errorTagCode).toBe('BORROW_OMITTED_TENS');
    expect(student.attempts[1].errorTagCode).toBeNull();
  });

  it('errorFrequency aggregates errors correctly', async () => {
    const [student] = await service.getCourseMastery('course-1');
    expect(student.errorFrequency).toHaveLength(1);
    expect(student.errorFrequency[0].errorTagCode).toBe('BORROW_OMITTED_TENS');
    expect(student.errorFrequency[0].count).toBe(1);
  });

  it('getCourseHeatmap exposes live domains as units and subdomains as topics', async () => {
    const hm = await service.getCourseHeatmap('course-1');
    expect(hm.units).toHaveLength(1);
    expect(hm.units[0].code).toBe('NUM-OPS');
    expect(hm.students).toHaveLength(1);
    expect(hm.students[0].topics[0].topicCode).toBe('SUB-BORROW');
    expect(hm.students[0].units[0].topicCount).toBe(1);
  });

  it('getClassroomMastery is alias for getCourseMastery', async () => {
    const result = await service.getClassroomMastery('course-1');
    expect(result).toHaveLength(1);
  });

  it('getStudentMastery returns array of mastery states', async () => {
    const result = await service.getStudentMastery('student-1');
    expect(Array.isArray(result)).toBe(true);
  });
});
