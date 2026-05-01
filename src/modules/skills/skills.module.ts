import { Module } from '@nestjs/common';
import { SkillsController } from '@modules/skills/skills.controller';
import { SkillsService } from '@modules/skills/skills.service';

@Module({
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
