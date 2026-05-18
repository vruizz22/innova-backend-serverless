import { Test, TestingModule } from '@nestjs/testing';
import { AlertsController } from '@modules/alerts/alerts.controller';
import { AlertsService, AlertView } from '@modules/alerts/alerts.service';

const ALERT: AlertView = {
  id: 'alert-1',
  teacherId: 'teacher-1',
  courseId: 'course-1',
  topicId: 'topic-1',
  studentId: 'student-1',
  alertType: 'AT_RISK_STUDENT',
  severity: 'HIGH',
  payload: { message: 'Diego tiene 3 errores seguidos' },
  createdAt: new Date().toISOString(),
  resolvedAt: null,
};

function buildMockService() {
  return {
    findByCourse: jest.fn().mockResolvedValue([ALERT]),
    create: jest.fn().mockResolvedValue(ALERT),
    resolve: jest
      .fn()
      .mockResolvedValue({ ...ALERT, resolvedAt: new Date().toISOString() }),
  };
}

describe('AlertsController', () => {
  let controller: AlertsController;
  let service: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    service = buildMockService();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [{ provide: AlertsService, useValue: service }],
    }).compile();

    controller = module.get<AlertsController>(AlertsController);
  });

  describe('list', () => {
    it('delegates to findByCourse with courseId query param', async () => {
      const result = await controller.list('course-1', undefined);
      expect(service.findByCourse).toHaveBeenCalledWith('course-1');
      expect(result).toEqual([ALERT]);
    });

    it('falls back to classroomId when courseId is undefined', async () => {
      const result = await controller.list(undefined, 'classroom-1');
      expect(service.findByCourse).toHaveBeenCalledWith('classroom-1');
      expect(result).toEqual([ALERT]);
    });

    it('passes empty string when both params are undefined', async () => {
      await controller.list(undefined, undefined);
      expect(service.findByCourse).toHaveBeenCalledWith('');
    });
  });

  describe('create', () => {
    it('delegates to service.create and returns alert', async () => {
      const body = {
        courseId: 'course-1',
        teacherId: 'teacher-1',
        alertType: 'AT_RISK_STUDENT',
        topicId: 'topic-1',
        studentId: 'student-1',
        severity: 'HIGH',
        payload: { message: 'test' },
      };
      const result = await controller.create(body);
      expect(service.create).toHaveBeenCalledWith(body);
      expect(result).toEqual(ALERT);
    });
  });

  describe('resolve', () => {
    it('delegates to service.resolve with alert id', async () => {
      const result = await controller.resolve('alert-1');
      expect(service.resolve).toHaveBeenCalledWith('alert-1');
      expect(result).toMatchObject({ id: 'alert-1' });
    });
  });
});
