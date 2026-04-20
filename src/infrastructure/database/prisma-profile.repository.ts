import { Injectable } from '@nestjs/common';
import { IProfileRepository } from '@/domain/profiles/profile.repository';
import { PrismaService } from '@/infrastructure/database/prisma.service';
import { FslsmProfile } from '@/domain/profiles/fslsm-profile.entity';

@Injectable()
export class PrismaProfileRepository implements IProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapToDomain(record: any): FslsmProfile {
    return new FslsmProfile(
      record.id,
      record.userId,
      record.active,
      record.sensing,
      record.visual,
      record.sequential,
    );
  }

  async findByUserId(userId: string): Promise<FslsmProfile | null> {
    const record = await this.prisma.fslsmProfile.findUnique({
      where: { userId },
    });

    if (!record) {
      return null;
    }

    return this.mapToDomain(record);
  }

  async createProfile(profile: FslsmProfile): Promise<FslsmProfile> {
    const record = await this.prisma.fslsmProfile.create({
      data: {
        userId: profile.userId,
        active: profile.active,
        sensing: profile.sensing,
        visual: profile.visual,
        sequential: profile.sequential,
      },
    });

    return this.mapToDomain(record);
  }

  async updateProfile(
    userId: string,
    data: Partial<FslsmProfile>,
  ): Promise<FslsmProfile> {
    const record = await this.prisma.fslsmProfile.update({
      where: { userId },
      data: {
        active: data.active,
        sensing: data.sensing,
        visual: data.visual,
        sequential: data.sequential,
      },
    });

    return this.mapToDomain(record);
  }
}
