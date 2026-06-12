import { Module } from '@nestjs/common';
import { ParentController } from '@modules/parent/parent.controller';
import { ParentService } from '@modules/parent/parent.service';

@Module({
  controllers: [ParentController],
  providers: [ParentService],
  exports: [ParentService],
})
export class ParentModule {}
