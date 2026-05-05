import { Module } from '@nestjs/common';
import { ClassroomsController } from '@modules/classrooms/classrooms.controller';
import { ClassroomsService } from '@modules/classrooms/classrooms.service';

@Module({
  controllers: [ClassroomsController],
  providers: [ClassroomsService],
  exports: [ClassroomsService],
})
export class ClassroomsModule {}
