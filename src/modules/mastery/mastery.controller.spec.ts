import { Test, TestingModule } from '@nestjs/testing';
import { MasteryController } from '@modules/mastery/mastery.controller';
import { MasteryService } from '@modules/mastery/mastery.service';

const MASTERY_STATE = [
  { studentId: 'student-1', topicCode: 'T-SUB-BORROW', pKnown: 0.65 },
];
const COURSE_MASTERY = [
  {
    studentId: 'student-1',
    displayName: 'Diego',
    topics: [],
    attempts: [],
    errorFrequency: [],
  },
];

function buildMockService() {
  return {
    getStudentMastery: jest.fn().mockResolvedValue(MASTERY_STATE),
    getCourseMastery: jest.fn().mockResolvedValue(COURSE_MASTERY),
    getClassroomMastery: jest.fn().mockResolvedValue(COURSE_MASTERY),
  };
}

describe('MasteryController', () => {
  let controller: MasteryController;
  let service: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    service = buildMockService();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MasteryController],
      providers: [{ provide: MasteryService, useValue: service }],
    }).compile();

    controller = module.get<MasteryController>(MasteryController);
  });

  it('getByStudent delegates to service.getStudentMastery', async () => {
    const result = await controller.getByStudent('student-1');
    expect(service.getStudentMastery).toHaveBeenCalledWith('student-1');
    expect(result).toEqual(MASTERY_STATE);
  });

  it('getByCourse delegates to service.getCourseMastery', async () => {
    const result = await controller.getByCourse('course-1');
    expect(service.getCourseMastery).toHaveBeenCalledWith('course-1');
    expect(result).toEqual(COURSE_MASTERY);
  });

  it('getByClassroom delegates to service.getCourseMastery with classroomId', async () => {
    const result = await controller.getByClassroom('classroom-1');
    expect(service.getCourseMastery).toHaveBeenCalledWith('classroom-1');
    expect(result).toEqual(COURSE_MASTERY);
  });
});
