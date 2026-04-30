import { Injectable, NotImplementedException } from '@nestjs/common';
import { IProfileRepository } from '@/domain/profiles/profile.repository';
import { FslsmProfile } from '@/domain/profiles/fslsm-profile.entity';

// V1 FSLSM repository stub — FslsmProfile model removed in post-pivot migration.
// Full cleanup scheduled for chore/remove-v1-fslsm branch (TODO-15).
@Injectable()
export class PrismaProfileRepository implements IProfileRepository {
  findByUserId(_userId: string): Promise<FslsmProfile | null> {
    throw new NotImplementedException('FSLSM profiles removed in v2 pivot');
  }

  createProfile(_profile: FslsmProfile): Promise<FslsmProfile> {
    throw new NotImplementedException('FSLSM profiles removed in v2 pivot');
  }

  updateProfile(
    _userId: string,
    _data: Partial<FslsmProfile>,
  ): Promise<FslsmProfile> {
    throw new NotImplementedException('FSLSM profiles removed in v2 pivot');
  }
}
