import { Module } from '@nestjs/common';
import { AssignmentController } from '@modules/assignment/assignment.controller';
import { AssignmentService } from '@modules/assignment/assignment.service';

@Module({
  controllers: [AssignmentController],
  providers: [AssignmentService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
