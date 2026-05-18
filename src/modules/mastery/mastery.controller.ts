import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MasteryService } from '@modules/mastery/mastery.service';

@ApiTags('mastery')
@Controller('mastery')
export class MasteryController {
  constructor(private readonly masteryService: MasteryService) {}

  @Get('course/:courseId')
  @ApiOperation({ summary: 'Get mastery heatmap for one course' })
  @ApiParam({ name: 'courseId' })
  @ApiResponse({ status: 200, description: 'Course mastery payload' })
  async getByCourse(@Param('courseId') courseId: string) {
    return this.masteryService.getCourseMastery(courseId);
  }

  @Get('classroom/:classroomId')
  @ApiOperation({
    summary: 'Get mastery heatmap for one classroom (alias for course)',
  })
  @ApiParam({ name: 'classroomId' })
  async getByClassroom(@Param('classroomId') classroomId: string) {
    return this.masteryService.getCourseMastery(classroomId);
  }

  @Get(':studentId')
  @ApiOperation({ summary: 'Get per-topic mastery for one student' })
  @ApiParam({ name: 'studentId' })
  @ApiResponse({ status: 200, description: 'Mastery payload' })
  async getByStudent(@Param('studentId') studentId: string) {
    return this.masteryService.getStudentMastery(studentId);
  }
}
