import { Module } from '@nestjs/common';
import { MasteryController } from '@modules/mastery/mastery.controller';
import { MasteryService } from '@modules/mastery/mastery.service';

@Module({
  controllers: [MasteryController],
  providers: [MasteryService],
  exports: [MasteryService],
})
export class MasteryModule {}
