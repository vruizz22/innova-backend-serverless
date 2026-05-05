import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MasteryService } from '@modules/mastery/mastery.service';

@ApiTags('mastery')
@Controller('mastery')
export class MasteryController {
  constructor(private readonly masteryService: MasteryService) {}

  @Get('classroom/:classroomId')
  @ApiOperation({ summary: 'Get mastery heatmap for one classroom' })
  @ApiParam({ name: 'classroomId' })
  @ApiResponse({ status: 200, description: 'Classroom mastery payload' })
  async getByClassroom(@Param('classroomId') classroomId: string) {
    return this.masteryService.getClassroomMastery(classroomId);
  }

  @Get(':studentId')
  @ApiOperation({ summary: 'Get per-skill mastery for one student' })
  @ApiParam({ name: 'studentId' })
  @ApiResponse({ status: 200, description: 'Mastery payload' })
  async getByStudent(@Param('studentId') studentId: string) {
    return this.masteryService.getStudentMastery(studentId);
  }
}
