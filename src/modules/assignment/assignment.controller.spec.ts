import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentController } from '@modules/assignment/assignment.controller';
import { AssignmentService } from '@modules/assignment/assignment.service';
import { AssignmentReason } from '@modules/assignment/dto/create-assignment.dto';
import { Role } from '@modules/auth/roles.enum';
import type { SupabaseUser } from '@modules/auth/supabase-jwt.strategy';

const mockUser: SupabaseUser = {
  supabaseUid: 'supa-uid',
  email: 'teacher@innova.demo',
  role: Role.TEACHER,
  prismaUserId: 'teacher-user-id',
};

const mockAssignment = {
  id: 'assignment-001',
  title: 'Test Assignment',
  reason: AssignmentReason.TEACHER_MANUAL,
  createdByTeacherId: 'teacher-001',
  courseId: null,
  dueAt: null,
  createdAt: new Date(),
};

const mockAssignmentService = {
  create: jest.fn().mockResolvedValue(mockAssignment),
  createRecommended: jest.fn().mockResolvedValue(mockAssignment),
  findByStudent: jest.fn().mockResolvedValue([mockAssignment]),
};

describe('AssignmentController', () => {
  let controller: AssignmentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssignmentController],
      providers: [
        { provide: AssignmentService, useValue: mockAssignmentService },
      ],
    }).compile();

    controller = module.get<AssignmentController>(AssignmentController);
    jest.clearAllMocks();
  });

  it('create delegates to AssignmentService with user id', async () => {
    const dto = {
      exerciseIds: ['ex-001'],
      title: 'Test Assignment',
      reason: AssignmentReason.TEACHER_MANUAL,
    };
    const req = { user: mockUser };
    const result = await controller.create(req as { user: SupabaseUser }, dto);
    expect(mockAssignmentService.create).toHaveBeenCalledWith(
      'teacher-user-id',
      dto,
    );
    expect(result).toEqual(mockAssignment);
  });

  it('recommend delegates to AssignmentService', async () => {
    const req = { user: mockUser };
    const result = await controller.recommend(
      req as { user: SupabaseUser },
      'student-001',
      'topic-001',
    );
    expect(mockAssignmentService.createRecommended).toHaveBeenCalledWith(
      'teacher-user-id',
      'student-001',
      'topic-001',
    );
    expect(result).toEqual(mockAssignment);
  });

  it('recommend without topicId passes undefined', async () => {
    const req = { user: mockUser };
    await controller.recommend(req as { user: SupabaseUser }, 'student-001');
    expect(mockAssignmentService.createRecommended).toHaveBeenCalledWith(
      'teacher-user-id',
      'student-001',
      undefined,
    );
  });

  it('findByStudent returns student assignments', async () => {
    const result = await controller.findByStudent('student-001');
    expect(mockAssignmentService.findByStudent).toHaveBeenCalledWith(
      'student-001',
    );
    expect(result).toEqual([mockAssignment]);
  });
});
