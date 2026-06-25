import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ClassroomsService } from '@modules/classrooms/classrooms.service';
import { CreateClassroomDto } from '@modules/classrooms/dto/create-classroom.dto';
import { JoinClassroomDto } from '@modules/classrooms/dto/join-classroom.dto';
import type { SupabaseUser } from '@modules/auth/supabase-jwt.strategy';

type AuthRequest = { user: SupabaseUser };

@ApiTags('classrooms')
@Controller('classrooms')
export class ClassroomsController {
  constructor(private readonly classroomsService: ClassroomsService) {}

  @Post()
  @ApiOperation({ summary: 'Teacher creates a classroom' })
  @ApiBody({ type: CreateClassroomDto })
  create(@Request() req: AuthRequest, @Body() dto: CreateClassroomDto) {
    return this.classroomsService.createForTeacher(req.user.prismaUserId, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: "Get authenticated teacher's classrooms" })
  mine(@Request() req: AuthRequest) {
    return this.classroomsService.findMineAsTeacher(req.user.prismaUserId);
  }

  @Get('student/mine')
  @ApiOperation({ summary: "Get authenticated student's classroom" })
  studentMine(@Request() req: AuthRequest) {
    return this.classroomsService.findMineAsStudent(req.user.prismaUserId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get classroom by ID' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string) {
    return this.classroomsService.findById(id);
  }

  @Post(':id/invite')
  @ApiOperation({ summary: 'Generate invitation link for a classroom' })
  @ApiParam({ name: 'id' })
  invite(@Request() req: AuthRequest, @Param('id') id: string) {
    const practiceBaseUrl = process.env['PUBLIC_APP_URL'] ?? '';
    return this.classroomsService.createInvite(
      id,
      req.user.prismaUserId,
      practiceBaseUrl,
    );
  }

  @Post('join')
  @ApiOperation({ summary: 'Student joins a classroom via invitation code' })
  @ApiBody({ type: JoinClassroomDto })
  join(@Request() req: AuthRequest, @Body() dto: JoinClassroomDto) {
    return this.classroomsService.joinWithCode(dto.code, req.user.prismaUserId);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete (archive) a course owned by the teacher',
  })
  @ApiParam({ name: 'id' })
  archive(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.classroomsService.archiveCourse(id, req.user.prismaUserId);
  }
}
