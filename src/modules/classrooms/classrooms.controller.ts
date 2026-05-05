import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ClassroomsService } from '@modules/classrooms/classrooms.service';
import { CreateClassroomDto } from '@modules/classrooms/dto/create-classroom.dto';
import { JoinClassroomDto } from '@modules/classrooms/dto/join-classroom.dto';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import type { AuthenticatedPrincipal } from '@modules/auth/jwt.strategy';

type AuthRequest = { user: AuthenticatedPrincipal };

@ApiTags('classrooms')
@UseGuards(JwtAuthGuard)
@Controller('classrooms')
export class ClassroomsController {
  constructor(private readonly classroomsService: ClassroomsService) {}

  @Post()
  @ApiOperation({ summary: 'Teacher creates a classroom' })
  @ApiBody({ type: CreateClassroomDto })
  create(@Request() req: AuthRequest, @Body() dto: CreateClassroomDto) {
    const userId = req.user.prismaUser?.id ?? req.user.sub;
    return this.classroomsService.createForTeacher(userId, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: "Get authenticated teacher's classrooms" })
  mine(@Request() req: AuthRequest) {
    const userId = req.user.prismaUser?.id ?? req.user.sub;
    return this.classroomsService.findMineAsTeacher(userId);
  }

  @Get('student/mine')
  @ApiOperation({ summary: "Get authenticated student's classroom" })
  studentMine(@Request() req: AuthRequest) {
    const userId = req.user.prismaUser?.id ?? req.user.sub;
    return this.classroomsService.findMineAsStudent(userId);
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
    const userId = req.user.prismaUser?.id ?? req.user.sub;
    const practiceBaseUrl = process.env['PUBLIC_PRACTICE_URL']!;
    return this.classroomsService.createInvite(id, userId, practiceBaseUrl);
  }

  @Post('join')
  @ApiOperation({ summary: 'Student joins a classroom via invitation code' })
  @ApiBody({ type: JoinClassroomDto })
  join(@Request() req: AuthRequest, @Body() dto: JoinClassroomDto) {
    const userId = req.user.prismaUser?.id ?? req.user.sub;
    return this.classroomsService.joinWithCode(dto.code, userId);
  }
}
