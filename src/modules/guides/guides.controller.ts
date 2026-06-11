import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { GuidesService } from '@modules/guides/guides.service';
import { CreateGuideDto } from '@modules/guides/dto/create-guide.dto';
import { UpdateGuideDto } from '@modules/guides/dto/update-guide.dto';
import { UpdateGuideQuestionDto } from '@modules/guides/dto/update-guide-question.dto';
import { UpdateGuideSolutionDto } from '@modules/guides/dto/update-guide-solution.dto';
import { OverrideSubmissionErrorDto } from '@modules/guides/dto/override-submission-error.dto';
import { Roles } from '@modules/auth/roles.decorator';
import { Role } from '@modules/auth/roles.enum';
import type { GuideStatusValue } from '@modules/guides/guide-state-machine';
import type { SupabaseUser } from '@modules/auth/supabase-jwt.strategy';

type AuthRequest = { user: SupabaseUser };

@ApiTags('guides')
@ApiBearerAuth()
@Roles(Role.TEACHER)
@Controller('guides')
export class GuidesController {
  constructor(private readonly guidesService: GuidesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a guide and get a presigned PUT for the PDF',
  })
  @ApiBody({ type: CreateGuideDto })
  create(@Request() req: AuthRequest, @Body() dto: CreateGuideDto) {
    return this.guidesService.create(req.user.prismaUserId, dto);
  }

  @Post(':id/ingest')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start (or retry) extraction of an uploaded PDF' })
  @ApiParam({ name: 'id' })
  ingest(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.guidesService.ingest(req.user.prismaUserId, id);
  }

  @Get()
  @ApiOperation({ summary: "List the teacher's guides" })
  @ApiQuery({ name: 'courseId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  list(
    @Request() req: AuthRequest,
    @Query('courseId') courseId?: string,
    @Query('status') status?: GuideStatusValue,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.guidesService.list(req.user.prismaUserId, {
      courseId,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Guide detail: questions + current solutions (wizard)',
  })
  @ApiParam({ name: 'id' })
  getDetail(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.guidesService.getDetail(req.user.prismaUserId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update guide metadata' })
  @ApiParam({ name: 'id' })
  update(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateGuideDto,
  ) {
    return this.guidesService.updateGuide(req.user.prismaUserId, id, dto);
  }

  @Patch(':id/questions/:qid')
  @ApiOperation({
    summary: 'Edit a question / confirm topic / approve|exclude',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'qid' })
  updateQuestion(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Param('qid') qid: string,
    @Body() dto: UpdateGuideQuestionDto,
  ) {
    return this.guidesService.updateQuestion(
      req.user.prismaUserId,
      id,
      qid,
      dto,
    );
  }

  @Patch(':id/questions/:qid/solution')
  @ApiOperation({
    summary: 'Save an edited solution (new version, TEACHER_EDITED)',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'qid' })
  updateSolution(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Param('qid') qid: string,
    @Body() dto: UpdateGuideSolutionDto,
  ) {
    return this.guidesService.updateSolution(
      req.user.prismaUserId,
      id,
      qid,
      dto,
    );
  }

  @Post(':id/questions/:qid/regenerate-solution')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Re-enqueue LLM solution generation for one question',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'qid' })
  regenerate(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Param('qid') qid: string,
  ) {
    return this.guidesService.regenerateSolution(
      req.user.prismaUserId,
      id,
      qid,
    );
  }

  @Post(':id/publish')
  @ApiOperation({
    summary:
      'Publish: materialize exercises + assignment, make visible to students',
  })
  @ApiParam({ name: 'id' })
  publish(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.guidesService.publish(req.user.prismaUserId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a guide' })
  @ApiParam({ name: 'id' })
  archive(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.guidesService.archive(req.user.prismaUserId, id);
  }

  @Get(':id/results')
  @ApiOperation({
    summary: 'Results matrix: latest submission per student × question (C11)',
  })
  @ApiParam({ name: 'id' })
  results(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.guidesService.getResultsMatrix(req.user.prismaUserId, id);
  }

  @Get(':id/submissions/:sid')
  @ApiOperation({
    summary: 'Submission detail for the results drawer (photos + alignment) (C11)',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'sid' })
  submissionDetail(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Param('sid') sid: string,
  ) {
    return this.guidesService.getSubmissionDetail(req.user.prismaUserId, id, sid);
  }

  @Patch(':id/submissions/:sid/error-tag')
  @ApiOperation({
    summary: 'Override (or clear) a submission error tag by hand (C11)',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'sid' })
  overrideError(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Body() dto: OverrideSubmissionErrorDto,
  ) {
    return this.guidesService.overrideSubmissionErrorTag(
      req.user.prismaUserId,
      id,
      sid,
      dto.errorTagCode ?? null,
    );
  }
}
