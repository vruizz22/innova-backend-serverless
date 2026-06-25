import { Body, Controller, Get, Post, Query, Request } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AssignmentService } from '@modules/assignment/assignment.service';
import { AssignmentReason } from '@modules/assignment/dto/create-assignment.dto';
import {
  PracticeService,
  type RecommendNextResponse,
} from '@modules/practice/practice.service';
import type { SupabaseUser } from '@modules/auth/supabase-jwt.strategy';

type AuthRequest = { user: SupabaseUser };

@ApiTags('practice')
@Controller('practice')
export class PracticeController {
  constructor(
    private readonly practiceService: PracticeService,
    private readonly assignmentService: AssignmentService,
  ) {}

  @Post('assign')
  @ApiOperation({ summary: 'Create adaptive assignment (persisted)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        studentId: { type: 'string' },
        itemIds: { type: 'array', items: { type: 'string' } },
        dueAt: { type: 'string' },
      },
      required: ['studentId', 'itemIds'],
    },
  })
  async assign(
    @Request() req: AuthRequest,
    @Body() body: { studentId: string; itemIds: string[]; dueAt?: string },
  ) {
    const assignment = await this.assignmentService.create(
      req.user.prismaUserId,
      {
        studentIds: [body.studentId],
        exerciseIds: body.itemIds,
        title: 'Práctica asignada',
        reason: AssignmentReason.TEACHER_MANUAL,
        dueAt: body.dueAt,
      },
    );
    return {
      id: assignment.id,
      studentId: body.studentId,
      itemIds: body.itemIds,
      ...(assignment.dueAt ? { dueAt: assignment.dueAt.toISOString() } : {}),
    };
  }

  @Get('recommend-next')
  @ApiOperation({
    summary:
      'IRT-based next exercise: returns the active exercise with maximum Fisher ' +
      "information for the student's current ability estimate (BKT pKnown → logit theta). " +
      'Optional domainId scopes the search to one curriculum domain.',
  })
  @ApiQuery({ name: 'studentId', required: true, description: 'Student UUID' })
  @ApiQuery({
    name: 'domainId',
    required: false,
    description: 'Curriculum domain UUID to filter exercises',
  })
  @ApiResponse({
    status: 200,
    description: 'Exercise with maximum Fisher information for the student',
  })
  @ApiResponse({
    status: 404,
    description: 'Student not found or no active exercises in scope',
  })
  recommendNext(
    @Query('studentId') studentId: string,
    @Query('domainId') domainId?: string,
  ): Promise<RecommendNextResponse> {
    return this.practiceService.recommendNext(studentId, domainId);
  }
}
