import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AssignmentService } from '@modules/assignment/assignment.service';
import { CreateAssignmentDto } from '@modules/assignment/dto/create-assignment.dto';
import type { SupabaseUser } from '@modules/auth/supabase-jwt.strategy';

type AuthRequest = { user: SupabaseUser };

@ApiTags('assignments')
@Controller('assignments')
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  @Post()
  @ApiOperation({
    summary: 'Teacher creates an assignment for a course or student subset',
  })
  @ApiBody({ type: CreateAssignmentDto })
  create(@Request() req: AuthRequest, @Body() dto: CreateAssignmentDto) {
    return this.assignmentService.create(req.user.prismaUserId, dto);
  }

  @Post('recommend')
  @ApiOperation({
    summary: 'Create a recommended assignment using Fisher information IRT',
  })
  @ApiQuery({ name: 'studentId', required: true })
  @ApiQuery({ name: 'topicId', required: false })
  recommend(
    @Request() req: AuthRequest,
    @Query('studentId') studentId: string,
    @Query('topicId') topicId?: string,
  ) {
    return this.assignmentService.createRecommended(
      req.user.prismaUserId,
      studentId,
      topicId,
    );
  }

  @Get('student/:id')
  @ApiOperation({
    summary: 'List assignments for a student (student or parent view)',
  })
  @ApiParam({ name: 'id' })
  findByStudent(@Param('id') studentId: string) {
    return this.assignmentService.findByStudent(studentId);
  }
}
