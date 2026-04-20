import { Module } from '@nestjs/common';
import { ProfilesController } from '@/infrastructure/http/controllers/profiles.controller';
import { ProfilesService } from '@/application/profiles/profiles.service';
import { IProfileRepository } from '@/domain/profiles/profile.repository';
import { PrismaProfileRepository } from '@/infrastructure/database/prisma-profile.repository';
import { DatabaseModule } from '@/infrastructure/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ProfilesController],
  providers: [
    ProfilesService,
    {
      provide: IProfileRepository,
      useClass: PrismaProfileRepository,
    },
  ],
  exports: [ProfilesService],
})
export class ProfilesModule {}
