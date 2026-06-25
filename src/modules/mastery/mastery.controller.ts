import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  MasteryService,
  type RecommendResult,
} from '@modules/mastery/mastery.service';

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

  @Get('course/:courseId/heatmap')
  @ApiOperation({
    summary: 'Student × Unit heatmap with topic drill-down (C12)',
  })
  @ApiParam({ name: 'courseId' })
  async getCourseHeatmap(@Param('courseId') courseId: string) {
    return this.masteryService.getCourseHeatmap(courseId);
  }

  @Get('classroom/:classroomId')
  @ApiOperation({
    summary: 'Get mastery heatmap for one classroom (alias for course)',
  })
  @ApiParam({ name: 'classroomId' })
  async getByClassroom(@Param('classroomId') classroomId: string) {
    return this.masteryService.getCourseMastery(classroomId);
  }

  @Get('recommend/:courseId/:studentId')
  @ApiOperation({
    summary:
      'IRT Fisher-info next exercise recommendation for a student in a course',
  })
  @ApiParam({ name: 'courseId' })
  @ApiParam({ name: 'studentId' })
  @ApiResponse({
    status: 200,
    description: 'Best-matched exercise for the student',
  })
  async recommend(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
  ): Promise<RecommendResult> {
    const result = await this.masteryService.recommendNextExercise(
      courseId,
      studentId,
    );
    if (!result)
      throw new NotFoundException('No available exercises for this student');
    return result;
  }

  @Get(':studentId')
  @ApiOperation({ summary: 'Get per-topic mastery for one student' })
  @ApiParam({ name: 'studentId' })
  @ApiResponse({ status: 200, description: 'Mastery payload' })
  async getByStudent(@Param('studentId') studentId: string) {
    return this.masteryService.getStudentMastery(studentId);
  }
}
