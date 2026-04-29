import { Injectable, Inject } from '@nestjs/common';
import { IProfileRepository } from '@/domain/profiles/profile.repository';
import { CreateProfileDto } from './dto/create-profile.dto';
import { FslsmProfile } from '@/domain/profiles/fslsm-profile.entity';
import { ResourceNotFoundException } from '@/shared/exceptions/domain.exception';

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(IProfileRepository)
    private readonly profileRepository: IProfileRepository,
  ) {}

  async createOrUpdateProfile(dto: CreateProfileDto): Promise<FslsmProfile> {
    const existing = await this.profileRepository.findByUserId(dto.userId);

    if (existing) {
      return this.profileRepository.updateProfile(dto.userId, {
        active: dto.active,
        sensing: dto.sensing,
        visual: dto.visual,
        sequential: dto.sequential,
      });
    }

    const newProfile = FslsmProfile.create({
      userId: dto.userId,
      active: dto.active,
      sensing: dto.sensing,
      visual: dto.visual,
      sequential: dto.sequential,
    });

    return this.profileRepository.createProfile(newProfile);
  }

  async getProfileByUserId(userId: string): Promise<FslsmProfile> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new ResourceNotFoundException('FslsmProfile', userId);
    }
    return profile;
  }
}
