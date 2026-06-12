import { Test, TestingModule } from '@nestjs/testing';
import { PracticeController } from '@modules/practice/practice.controller';
import { PracticeService } from '@modules/practice/practice.service';

const mockAssignmentView = {
  id: 'assignment-uuid',
  studentId: 'student-001',
  itemIds: ['item-001', 'item-002'],
  dueAt: undefined,
};

const mockPracticeService = {
  createAssignment: jest.fn().mockReturnValue(mockAssignmentView),
};

describe('PracticeController', () => {
  let controller: PracticeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PracticeController],
      providers: [{ provide: PracticeService, useValue: mockPracticeService }],
    }).compile();

    controller = module.get<PracticeController>(PracticeController);
    jest.clearAllMocks();
  });

  it('assign delegates to PracticeService', () => {
    const body = {
      studentId: 'student-001',
      itemIds: ['item-001', 'item-002'],
    };
    const result = controller.assign(body);
    expect(mockPracticeService.createAssignment).toHaveBeenCalledWith(
      'student-001',
      ['item-001', 'item-002'],
      undefined,
    );
    expect(result).toEqual(mockAssignmentView);
  });

  it('assign passes dueAt when provided', () => {
    const body = {
      studentId: 'student-001',
      itemIds: ['item-001'],
      dueAt: '2026-06-01',
    };
    controller.assign(body);
    expect(mockPracticeService.createAssignment).toHaveBeenCalledWith(
      'student-001',
      ['item-001'],
      '2026-06-01',
    );
  });
});
