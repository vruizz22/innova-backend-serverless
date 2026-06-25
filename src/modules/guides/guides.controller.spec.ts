import { GuidesController } from '@modules/guides/guides.controller';
import { GuidesService } from '@modules/guides/guides.service';
import { Role } from '@modules/auth/roles.enum';
import type { SupabaseUser } from '@modules/auth/supabase-jwt.strategy';

const USER: SupabaseUser = {
  supabaseUid: 'supa-1',
  email: 'teacher@innova.demo',
  role: Role.TEACHER,
  prismaUserId: 'user-1',
};
const req = { user: USER };

describe('GuidesController', () => {
  let service: jest.Mocked<GuidesService>;
  let controller: GuidesController;

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue({ guideId: 'g1' }),
      ingest: jest.fn().mockResolvedValue({ status: 'EXTRACTING' }),
      list: jest.fn().mockResolvedValue({ items: [] }),
      getDetail: jest.fn().mockResolvedValue({ id: 'g1' }),
      updateGuide: jest.fn().mockResolvedValue({ id: 'g1' }),
      updateQuestion: jest.fn().mockResolvedValue({ id: 'q1' }),
      updateSolution: jest.fn().mockResolvedValue({ id: 'sol-1' }),
      regenerateSolution: jest.fn().mockResolvedValue({ enqueued: true }),
      publish: jest.fn().mockResolvedValue({ assignmentId: 'a1' }),
      archive: jest.fn().mockResolvedValue({ status: 'ARCHIVED' }),
      getResultsMatrix: jest.fn().mockResolvedValue({ cells: [] }),
      getSubmissionDetail: jest.fn().mockResolvedValue({ submissionId: 's1' }),
      overrideSubmissionErrorTag: jest
        .fn()
        .mockResolvedValue({ isOverridden: true }),
    } as unknown as jest.Mocked<GuidesService>;
    controller = new GuidesController(service);
  });

  it('create delegates with the prisma user id', async () => {
    await controller.create(req, { courseId: 'c1', title: 'T' });
    expect(service.create).toHaveBeenCalledWith('user-1', {
      courseId: 'c1',
      title: 'T',
    });
  });

  it('ingest delegates', async () => {
    await controller.ingest(req, 'g1');
    expect(service.ingest).toHaveBeenCalledWith('user-1', 'g1');
  });

  it('list forwards parsed numeric query params', async () => {
    await controller.list(req, 'c1', 'PUBLISHED', '2', '50');
    expect(service.list).toHaveBeenCalledWith('user-1', {
      courseId: 'c1',
      status: 'PUBLISHED',
      page: 2,
      pageSize: 50,
    });
  });

  it('list leaves pagination undefined when not given', async () => {
    await controller.list(req);
    expect(service.list).toHaveBeenCalledWith('user-1', {
      courseId: undefined,
      status: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });

  it('getDetail delegates', async () => {
    await controller.getDetail(req, 'g1');
    expect(service.getDetail).toHaveBeenCalledWith('user-1', 'g1');
  });

  it('update delegates', async () => {
    await controller.update(req, 'g1', { title: 'X' });
    expect(service.updateGuide).toHaveBeenCalledWith('user-1', 'g1', {
      title: 'X',
    });
  });

  it('updateQuestion delegates', async () => {
    await controller.updateQuestion(req, 'g1', 'q1', { label: 'a' });
    expect(service.updateQuestion).toHaveBeenCalledWith('user-1', 'g1', 'q1', {
      label: 'a',
    });
  });

  it('updateSolution delegates', async () => {
    await controller.updateSolution(req, 'g1', 'q1', {
      stepsJson: {},
      finalAnswer: '42',
    });
    expect(service.updateSolution).toHaveBeenCalledWith('user-1', 'g1', 'q1', {
      stepsJson: {},
      finalAnswer: '42',
    });
  });

  it('regenerate delegates', async () => {
    await controller.regenerate(req, 'g1', 'q1');
    expect(service.regenerateSolution).toHaveBeenCalledWith(
      'user-1',
      'g1',
      'q1',
    );
  });

  it('publish delegates', async () => {
    await controller.publish(req, 'g1');
    expect(service.publish).toHaveBeenCalledWith('user-1', 'g1');
  });

  it('archive delegates', async () => {
    await controller.archive(req, 'g1');
    expect(service.archive).toHaveBeenCalledWith('user-1', 'g1');
  });

  it('results delegates', async () => {
    await controller.results(req, 'g1');
    expect(service.getResultsMatrix).toHaveBeenCalledWith('user-1', 'g1');
  });

  it('submissionDetail delegates', async () => {
    await controller.submissionDetail(req, 'g1', 's1');
    expect(service.getSubmissionDetail).toHaveBeenCalledWith(
      'user-1',
      'g1',
      's1',
    );
  });

  it('overrideError forwards the code (defaulting null)', async () => {
    await controller.overrideError(req, 'g1', 's1', { errorTagCode: 'E1' });
    expect(service.overrideSubmissionErrorTag).toHaveBeenCalledWith(
      'user-1',
      'g1',
      's1',
      'E1',
    );

    await controller.overrideError(req, 'g1', 's1', {});
    expect(service.overrideSubmissionErrorTag).toHaveBeenLastCalledWith(
      'user-1',
      'g1',
      's1',
      null,
    );
  });
});
