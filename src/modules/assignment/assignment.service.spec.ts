import { NotFoundException } from '@nestjs/common';
import { AssignmentService } from '@modules/assignment/assignment.service';
import { AssignmentReason } from '@modules/assignment/dto/create-assignment.dto';
import { PrismaService } from '@infrastructure/database/prisma.service';

const TOPIC = {
  id: 'topic-1',
  code: 'T-SUB-BORROW',
  name: 'Resta con préstamo',
  prerequisites: [],
};

const MASTERY = {
  topicId: 'topic-1',
  pKnown: 0.5,
  topic: TOPIC,
};

const EXERCISE = {
  id: 'exercise-1',
  topicId: 'topic-1',
  status: 'ACTIVE',
  content: { prompt: '53 - 26 = ?' },
  irtA: 1.2,
  irtB: -0.3,
};

const TEACHER = { id: 'teacher-1', userId: 'user-1' };
const ASSIGNMENT = {
  id: 'assignment-1',
  title: 'Test',
  reason: 'TEACHER_MANUAL',
};

function buildMockPrisma(): PrismaService {
  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    teacher: {
      findFirst: jest.fn().mockResolvedValue(TEACHER),
    },
    assignment: {
      create: jest.fn().mockResolvedValue(ASSIGNMENT),
    },
    studentTopicMastery: {
      findMany: jest.fn().mockResolvedValue([MASTERY]),
    },
    exercise: {
      findMany: jest.fn().mockResolvedValue([EXERCISE]),
    },
    assignmentTarget: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

describe('AssignmentService', () => {
  let service: AssignmentService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = buildMockPrisma();
    service = new AssignmentService(prisma);
  });

  describe('create', () => {
    it('creates assignment for a teacher', async () => {
      const dto = {
        exerciseIds: ['exercise-1'],
        title: 'Tarea de resta',
        reason: AssignmentReason.TEACHER_MANUAL,
        courseId: 'course-1',
      };
      const result = await service.create('user-1', dto);
      expect(result).toEqual(ASSIGNMENT);
    });

    it('throws NotFoundException when teacher not found', async () => {
      (prisma.teacher.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.create('user-nonexistent', {
          exerciseIds: ['e1'],
          title: 'Test',
          reason: AssignmentReason.TEACHER_MANUAL,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('recommendForStudent', () => {
    it('returns exercises sorted by Fisher information', async () => {
      const results = await service.recommendForStudent('student-1');
      expect(results).toHaveLength(1);
      expect(results[0].exerciseId).toBe('exercise-1');
      expect(results[0].fisherInformation).toBeGreaterThan(0);
    });

    it('Fisher information is a²·P(θ)·(1-P(θ)) — positive for any θ', async () => {
      const results = await service.recommendForStudent('student-1');
      for (const r of results) {
        expect(r.fisherInformation).toBeGreaterThan(0);
        expect(r.pCorrect).toBeGreaterThan(0);
        expect(r.pCorrect).toBeLessThan(1);
      }
    });

    it('returns empty array when no mastery records', async () => {
      (prisma.studentTopicMastery.findMany as jest.Mock).mockResolvedValue([]);
      const results = await service.recommendForStudent('student-1');
      expect(results).toEqual([]);
    });

    it('skips topic when prerequisite mastery missing (defaults pKnown=0 < 0.6)', async () => {
      const topicWithPrereq = {
        ...TOPIC,
        prerequisites: [
          {
            prerequisiteTopicId: 'prereq-topic',
            prerequisite: { id: 'prereq-topic', code: 'T-ADD-CARRY' },
          },
        ],
      };
      // Only the topic with unmet prereq in the list; prereq-topic not in masteryRecords
      // → prereqMastery is undefined → pKnown defaults to 0 < 0.6 → topic skipped
      (prisma.studentTopicMastery.findMany as jest.Mock).mockResolvedValue([
        { ...MASTERY, topic: topicWithPrereq },
      ]);
      const results = await service.recommendForStudent('student-1', 'topic-1');
      expect(results).toEqual([]);
    });

    it('filters by topicId when provided', async () => {
      await service.recommendForStudent('student-1', 'topic-1');
      const findManyMock = prisma.studentTopicMastery.findMany as jest.Mock;
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId: 'student-1', topicId: 'topic-1' },
        }),
      );
    });

    it('respects topN limit', async () => {
      (prisma.exercise.findMany as jest.Mock).mockResolvedValue([
        { ...EXERCISE, id: 'e1', irtA: 1.0, irtB: -0.1 },
        { ...EXERCISE, id: 'e2', irtA: 1.1, irtB: -0.2 },
        { ...EXERCISE, id: 'e3', irtA: 1.2, irtB: -0.3 },
      ]);
      const results = await service.recommendForStudent(
        'student-1',
        undefined,
        2,
      );
      expect(results).toHaveLength(2);
    });
  });

  describe('findByStudent', () => {
    it('returns assignments for student', async () => {
      const result = await service.findByStudent('student-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('createRecommended', () => {
    it('creates recommended assignment', async () => {
      (prisma.assignment.create as jest.Mock).mockResolvedValue(ASSIGNMENT);
      const result = await service.createRecommended('user-1', 'student-1');
      expect(result).toEqual(ASSIGNMENT);
    });

    it('throws NotFoundException when no exercises found', async () => {
      (prisma.studentTopicMastery.findMany as jest.Mock).mockResolvedValue([]);
      await expect(
        service.createRecommended('user-1', 'student-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
