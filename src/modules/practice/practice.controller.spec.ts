import { Test, TestingModule } from '@nestjs/testing';
import { PracticeController } from '@modules/practice/practice.controller';
import { PracticeService } from '@modules/practice/practice.service';
import { AssignmentService } from '@modules/assignment/assignment.service';
import { AssignmentReason } from '@modules/assignment/dto/create-assignment.dto';

const mockAssignmentView = {
  id: 'assignment-uuid',
  createdByTeacherId: 'teacher-001',
  title: 'Práctica asignada',
};

const mockRecommendResponse = {
  exerciseId: 'ex-001',
  topicId: 'topic-001',
  topicCode: 'ARITH_ADDITION',
  irtA: 1.0,
  irtB: -0.5,
  fisherInfo: 0.25,
  studentTheta: -0.85,
};

const mockAssignmentService = {
  create: jest.fn().mockResolvedValue(mockAssignmentView),
};

const mockPracticeService = {
  recommendNext: jest.fn().mockResolvedValue(mockRecommendResponse),
};

const mockAuthReq = { user: { prismaUserId: 'teacher-prisma-001' } };

describe('PracticeController', () => {
  let controller: PracticeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PracticeController],
      providers: [
        { provide: PracticeService, useValue: mockPracticeService },
        { provide: AssignmentService, useValue: mockAssignmentService },
      ],
    }).compile();

    controller = module.get<PracticeController>(PracticeController);
    jest.clearAllMocks();
    mockAssignmentService.create.mockResolvedValue(mockAssignmentView);
    mockPracticeService.recommendNext.mockResolvedValue(mockRecommendResponse);
  });

  describe('assign', () => {
    it('persists via AssignmentService', () => {
      const body = {
        studentId: 'student-001',
        itemIds: ['item-001', 'item-002'],
      };
      controller.assign(mockAuthReq as never, body);
      expect(mockAssignmentService.create).toHaveBeenCalledWith(
        'teacher-prisma-001',
        {
          studentIds: ['student-001'],
          exerciseIds: ['item-001', 'item-002'],
          title: 'Práctica asignada',
          reason: AssignmentReason.TEACHER_MANUAL,
          dueAt: undefined,
        },
      );
    });

    it('passes dueAt when provided', () => {
      const body = {
        studentId: 'student-001',
        itemIds: ['item-001'],
        dueAt: '2026-06-01',
      };
      controller.assign(mockAuthReq as never, body);
      expect(mockAssignmentService.create).toHaveBeenCalledWith(
        'teacher-prisma-001',
        expect.objectContaining({ dueAt: '2026-06-01' }),
      );
    });
  });

  describe('recommendNext', () => {
    it('delegates to PracticeService.recommendNext with studentId only', async () => {
      const result = await controller.recommendNext('student-001');
      expect(mockPracticeService.recommendNext).toHaveBeenCalledWith(
        'student-001',
        undefined,
      );
      expect(result).toEqual(mockRecommendResponse);
    });

    it('passes domainId when provided', async () => {
      await controller.recommendNext('student-001', 'domain-xyz');
      expect(mockPracticeService.recommendNext).toHaveBeenCalledWith(
        'student-001',
        'domain-xyz',
      );
    });
  });
});
