import { Test, TestingModule } from '@nestjs/testing';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from '@/application/profiles/profiles.service';
import { FslsmProfile } from '@/domain/profiles/fslsm-profile.entity';

describe('ProfilesController', () => {
  let controller: ProfilesController;
  let service: ProfilesService;

  const mockService = {
    createOrUpdateProfile: jest.fn(),
    getProfileByUserId: jest.fn(),
  };

  const mockProfile = new FslsmProfile('id-1', 'user-1', 1, 1, 1, 1);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        {
          provide: ProfilesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ProfilesController>(ProfilesController);
    service = module.get<ProfilesService>(ProfilesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should get profile by userId', async () => {
    mockService.getProfileByUserId.mockResolvedValue(mockProfile);

    const result = await controller.getProfile('user-1');

    expect(result.data).toEqual(mockProfile);
    expect(service.getProfileByUserId).toHaveBeenCalledWith('user-1');
  });

  it('should create or update profile', async () => {
    mockService.createOrUpdateProfile.mockResolvedValue(mockProfile);

    const dto = {
      userId: 'user-1',
      active: 1,
      sensing: 1,
      visual: 1,
      sequential: 1,
    };
    const result = await controller.createOrUpdateProfile(dto);

    expect(result.data).toEqual(mockProfile);
    expect(service.createOrUpdateProfile).toHaveBeenCalledWith(dto);
  });
});
