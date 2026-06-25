import { GuideSubmissionsController } from '@modules/guide-submissions/guide-submissions.controller';
import { GuideSubmissionsService } from '@modules/guide-submissions/guide-submissions.service';
import { Role } from '@modules/auth/roles.enum';
import type { SupabaseUser } from '@modules/auth/supabase-jwt.strategy';

const USER: SupabaseUser = {
  supabaseUid: 'supa-1',
  email: 'student@innova.demo',
  role: Role.STUDENT,
  prismaUserId: 'user-1',
};
const req = { user: USER };

describe('GuideSubmissionsController', () => {
  let service: jest.Mocked<GuideSubmissionsService>;
  let controller: GuideSubmissionsController;

  beforeEach(() => {
    service = {
      listGuides: jest.fn().mockResolvedValue([]),
      getQuiz: jest.fn().mockResolvedValue({ guide: {} }),
      createSubmission: jest.fn().mockResolvedValue({ submissionId: 's1' }),
      complete: jest.fn().mockResolvedValue({ status: 'UPLOADED' }),
      getStatus: jest.fn().mockResolvedValue({ status: 'GRADED' }),
      getResults: jest.fn().mockResolvedValue({ questions: [] }),
    } as unknown as jest.Mocked<GuideSubmissionsService>;
    controller = new GuideSubmissionsController(service);
  });

  it('listGuides delegates', async () => {
    await controller.listGuides(req);
    expect(service.listGuides).toHaveBeenCalledWith('user-1');
  });

  it('getQuiz delegates', async () => {
    await controller.getQuiz(req, 'g1');
    expect(service.getQuiz).toHaveBeenCalledWith('user-1', 'g1');
  });

  it('createSubmission delegates', async () => {
    await controller.createSubmission(req, 'g1', 'q1', { photoCount: 2 });
    expect(service.createSubmission).toHaveBeenCalledWith(
      'user-1',
      'g1',
      'q1',
      {
        photoCount: 2,
      },
    );
  });

  it('complete delegates', async () => {
    await controller.complete(req, 's1');
    expect(service.complete).toHaveBeenCalledWith('user-1', 's1');
  });

  it('getStatus delegates', async () => {
    await controller.getStatus(req, 's1');
    expect(service.getStatus).toHaveBeenCalledWith('user-1', 's1');
  });

  it('getResults delegates', async () => {
    await controller.getResults(req, 'g1');
    expect(service.getResults).toHaveBeenCalledWith('user-1', 'g1');
  });
});
