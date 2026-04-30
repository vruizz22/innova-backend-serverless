import { Module } from '@nestjs/common';
import { PracticeController } from '@modules/practice/practice.controller';
import { PracticeService } from '@modules/practice/practice.service';

@Module({
  controllers: [PracticeController],
  providers: [PracticeService],
  exports: [PracticeService],
})
export class PracticeModule {}
