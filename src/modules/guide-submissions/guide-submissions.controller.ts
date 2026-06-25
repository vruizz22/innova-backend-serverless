import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { GuideSubmissionsService } from '@modules/guide-submissions/guide-submissions.service';
import { CreateSubmissionDto } from '@modules/guide-submissions/dto/create-submission.dto';
import { ProcessScanPageDto } from '@modules/guide-submissions/dto/scan-page.dto';
import { Roles } from '@modules/auth/roles.decorator';
import { Role } from '@modules/auth/roles.enum';
import type { SupabaseUser } from '@modules/auth/supabase-jwt.strategy';

type AuthRequest = { user: SupabaseUser };

@ApiTags('student-guides')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller('student')
export class GuideSubmissionsController {
  constructor(private readonly service: GuideSubmissionsService) {}

  @Get('guides')
  @ApiOperation({ summary: 'Published guides of my courses + progress' })
  listGuides(@Request() req: AuthRequest) {
    return this.service.listGuides(req.user.prismaUserId);
  }

  @Get('guides/:id')
  @ApiOperation({ summary: 'Quiz view (no solutions) + my submission states' })
  @ApiParam({ name: 'id' })
  getQuiz(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.getQuiz(req.user.prismaUserId, id);
  }

  @Post('guides/:id/questions/:qid/submissions')
  @ApiOperation({
    summary: 'Start a submission: get presigned PUTs for photos',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'qid' })
  @ApiBody({ type: CreateSubmissionDto })
  createSubmission(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Param('qid') qid: string,
    @Body() dto: CreateSubmissionDto,
  ) {
    return this.service.createSubmission(req.user.prismaUserId, id, qid, dto);
  }

  @Post('submissions/:id/complete')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Confirm uploads and enqueue grading' })
  @ApiParam({ name: 'id' })
  complete(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.complete(req.user.prismaUserId, id);
  }

  @Get('submissions/:id/status')
  @ApiOperation({ summary: 'Poll submission status / result' })
  @ApiParam({ name: 'id' })
  getStatus(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.getStatus(req.user.prismaUserId, id);
  }

  @Get('guides/:id/results')
  @ApiOperation({ summary: 'My per-question results for a guide' })
  @ApiParam({ name: 'id' })
  getResults(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.getResults(req.user.prismaUserId, id);
  }

  @Get('guides/:id/scan-page-url')
  @ApiOperation({
    summary:
      'Presigned PUT URL to upload a full-page photo for scan-page auto-split',
  })
  @ApiParam({ name: 'id' })
  getScanPageUploadUrl(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.getScanPageUploadUrl(req.user.prismaUserId, id);
  }

  @Post('guides/:id/scan-page')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'OCR a page photo and auto-create submissions for detected exercises',
  })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: ProcessScanPageDto })
  processScanPage(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: ProcessScanPageDto,
  ) {
    return this.service.processScanPage(
      req.user.prismaUserId,
      id,
      dto.photoKey,
    );
  }
}
