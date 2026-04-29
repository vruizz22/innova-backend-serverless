import { FslsmProfile } from './fslsm-profile.entity';

export interface IProfileRepository {
  findByUserId(userId: string): Promise<FslsmProfile | null>;
  createProfile(profile: FslsmProfile): Promise<FslsmProfile>;
  updateProfile(
    userId: string,
    data: Partial<FslsmProfile>,
  ): Promise<FslsmProfile>;
}

export const IProfileRepository = Symbol('IProfileRepository');
