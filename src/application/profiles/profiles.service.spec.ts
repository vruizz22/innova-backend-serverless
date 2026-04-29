import { Test, TestingModule } from '@nestjs/testing';
import { ProfilesService } from './profiles.service';
import { IProfileRepository } from '@/domain/profiles/profile.repository';
import { FslsmProfile } from '@/domain/profiles/fslsm-profile.entity';
import { ResourceNotFoundException } from '@/shared/exceptions/domain.exception';

describe('ProfilesService', () => {
  let service: ProfilesService;

  const mockProfile = new FslsmProfile('id-1', 'user-1', 1, 1, 1, 1);

  const mockRepo = {
    findByUserId: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        {
          provide: IProfileRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfileByUserId', () => {
    it('should return profile if exists', async () => {
      mockRepo.findByUserId.mockResolvedValue(mockProfile);

      const result = await service.getProfileByUserId('user-1');
      expect(result).toEqual(mockProfile);
      expect(mockRepo.findByUserId).toHaveBeenCalledWith('user-1');
    });

    it('should throw ResourceNotFoundException if profile does not exist', async () => {
      mockRepo.findByUserId.mockResolvedValue(null);

      await expect(service.getProfileByUserId('user-2')).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  describe('createOrUpdateProfile', () => {
    it('should update profile if it exists', async () => {
      mockRepo.findByUserId.mockResolvedValue(mockProfile);
      const updatedProfile = new FslsmProfile('id-1', 'user-1', 3, 3, 3, 3);
      mockRepo.updateProfile.mockResolvedValue(updatedProfile);

      const dto = {
        userId: 'user-1',
        active: 3,
        sensing: 3,
        visual: 3,
        sequential: 3,
      };
      const result = await service.createOrUpdateProfile(dto);

      expect(mockRepo.updateProfile).toHaveBeenCalledWith('user-1', {
        active: 3,
        sensing: 3,
        visual: 3,
        sequential: 3,
      });
      expect(result.active).toEqual(3);
    });

    it('should create new profile if it does not exist', async () => {
      mockRepo.findByUserId.mockResolvedValue(null);
      const newProfile = new FslsmProfile('id-new', 'user-2', 5, 5, 5, 5);
      mockRepo.createProfile.mockResolvedValue(newProfile);

      const dto = {
        userId: 'user-2',
        active: 5,
        sensing: 5,
        visual: 5,
        sequential: 5,
      };
      const result = await service.createOrUpdateProfile(dto);

      expect(mockRepo.createProfile).toHaveBeenCalled();
      expect(result).toEqual(newProfile);
    });
  });
});
