import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ClassroomsService } from '@modules/classrooms/classrooms.service';
import { PrismaService } from '@infrastructure/database/prisma.service';

const TEACHER = {
  id: 'teacher-1',
  userId: 'user-teacher-1',
  displayName: 'Prof. Demo',
};
const SUBJECT = {
  id: 'subject-1',
  code: 'MATH',
  name: 'Matemáticas',
  language: 'es',
};
const SCHOOL = {
  id: 'school-1',
  name: 'Escuela Demo',
  organizationId: 'org-1',
};
const COURSE = {
  id: 'course-1',
  name: '4° A · Matemáticas',
  schoolId: 'school-1',
  subjectId: 'subject-1',
  gradeLevel: 4,
  academicYear: 2026,
};
const INVITE = {
  id: 'invite-1',
  code: 'abc123',
  courseId: 'course-1',
  createdBy: 'teacher-1',
  expiresAt: null,
  maxUses: null,
  useCount: 0,
  course: COURSE,
};
const STUDENT = {
  id: 'student-1',
  userId: 'user-student-1',
  displayName: 'Diego',
  enrollments: [{ status: 'ACTIVE', course: COURSE }],
};

function buildMockPrisma(
  overrides: Partial<Record<string, unknown>> = {},
): PrismaService {
  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    teacher: {
      findFirst: jest.fn().mockResolvedValue(TEACHER),
    },
    subject: {
      findFirst: jest.fn().mockResolvedValue(SUBJECT),
    },
    school: {
      findFirst: jest.fn().mockResolvedValue(SCHOOL),
    },
    course: {
      create: jest.fn().mockResolvedValue(COURSE),
      findUnique: jest.fn().mockResolvedValue(COURSE),
    },
    courseTeacher: {
      findMany: jest.fn().mockResolvedValue([{ course: COURSE }]),
      findFirst: jest
        .fn()
        .mockResolvedValue({ teacherId: 'teacher-1', courseId: 'course-1' }),
    },
    classroomInvite: {
      create: jest.fn().mockResolvedValue(INVITE),
      findUnique: jest.fn().mockResolvedValue(INVITE),
      update: jest.fn().mockResolvedValue({ ...INVITE, useCount: 1 }),
    },
    student: {
      findFirst: jest.fn().mockResolvedValue(STUDENT),
    },
    enrollment: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest
      .fn()
      .mockImplementation((ops: unknown[]) => Promise.all(ops)),
    ...overrides,
  } as unknown as PrismaService;
}

describe('ClassroomsService', () => {
  let service: ClassroomsService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = buildMockPrisma();
    service = new ClassroomsService(prisma);
  });

  describe('createForTeacher', () => {
    it('creates course for a teacher and returns it', async () => {
      const result = await service.createForTeacher('user-teacher-1', {
        name: '4° A · Matemáticas',
      });
      expect(result).toEqual(COURSE);
    });

    it('throws NotFoundException when teacher profile not found', async () => {
      (prisma.teacher.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.createForTeacher('user-teacher-1', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when MATH subject not found', async () => {
      (prisma.subject.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.createForTeacher('user-teacher-1', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when no school found', async () => {
      (prisma.school.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.createForTeacher('user-teacher-1', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findMineAsTeacher', () => {
    it('returns courses for teacher', async () => {
      const result = await service.findMineAsTeacher('user-teacher-1');
      expect(result).toEqual([COURSE]);
    });

    it('returns empty array when no teacher profile', async () => {
      (prisma.teacher.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await service.findMineAsTeacher('user-teacher-1');
      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns course by id', async () => {
      const result = await service.findById('course-1');
      expect(result).toEqual(COURSE);
    });

    it('returns null when not found', async () => {
      (prisma.course.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await service.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createInvite', () => {
    it('creates invite and returns code + url', async () => {
      const result = await service.createInvite(
        'course-1',
        'user-teacher-1',
        'http://localhost:3002',
      );
      expect(result.code).toBe('abc123');
      expect(result.url).toContain('abc123');
    });

    it('throws ForbiddenException when no teacher profile', async () => {
      (prisma.teacher.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.createInvite(
          'course-1',
          'user-teacher-1',
          'http://localhost:3002',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when teacher does not own course', async () => {
      (prisma.courseTeacher.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.createInvite(
          'course-1',
          'user-teacher-1',
          'http://localhost:3002',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findMineAsStudent', () => {
    it('returns courses for student', async () => {
      const result = await service.findMineAsStudent('user-student-1');
      expect(result).toEqual([COURSE]);
    });

    it('returns empty array when no student profile', async () => {
      (prisma.student.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await service.findMineAsStudent('user-student-1');
      expect(result).toEqual([]);
    });
  });

  describe('joinWithCode', () => {
    it('enrolls student in course and returns course', async () => {
      const result = await service.joinWithCode('abc123', 'user-student-1');
      expect(result).toEqual(COURSE);
    });

    it('throws NotFoundException for invalid code', async () => {
      (prisma.classroomInvite.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.joinWithCode('invalid', 'user-student-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for expired invite', async () => {
      (prisma.classroomInvite.findUnique as jest.Mock).mockResolvedValue({
        ...INVITE,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.joinWithCode('abc123', 'user-student-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when invite max uses reached', async () => {
      (prisma.classroomInvite.findUnique as jest.Mock).mockResolvedValue({
        ...INVITE,
        maxUses: 5,
        useCount: 5,
      });
      await expect(
        service.joinWithCode('abc123', 'user-student-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when student profile not found', async () => {
      (prisma.student.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.joinWithCode('abc123', 'user-student-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
