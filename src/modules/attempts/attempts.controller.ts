import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import { ReportAttemptErrorDto } from '@modules/attempts/dto/report-attempt-error.dto';
import {
  SolveAdhocDto,
  type SolveAdhocResponse,
} from '@modules/attempts/dto/solve-adhoc.dto';
import {
  AttemptsService,
  AttemptDetailResponse,
  AttemptStatusResponse,
  OcrExtractResult,
  ReportAck,
} from '@modules/attempts/attempts.service';
import type { SupabaseUser } from '@modules/auth/supabase-jwt.strategy';

interface AuthenticatedRequest {
  user?: SupabaseUser;
}

@ApiTags('attempts')
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Post()
  @ApiOperation({ summary: 'Ingest one student attempt' })
  @ApiBody({ type: CreateAttemptDto })
  @ApiResponse({ status: 201, description: 'Attempt ingested' })
  async create(
    @Body() dto: CreateAttemptDto,
    @Headers('x-trace-id') traceIdHeader?: string,
  ) {
    const traceId = traceIdHeader ?? randomUUID();
    return this.attemptsService.create(dto, traceId);
  }

  @Post('solve-adhoc')
  @ApiOperation({
    summary:
      'Create a PENDING attempt for an ad-hoc scan (no guide context) and enqueue it for the A10 adhoc_solver worker. Poll GET /attempts/:id/status for the classification result.',
  })
  @ApiBody({ type: SolveAdhocDto })
  @ApiResponse({ status: 201, description: 'Attempt id for polling' })
  async solveAdhoc(
    @Body() dto: SolveAdhocDto,
    @Headers('x-trace-id') traceIdHeader?: string,
  ): Promise<SolveAdhocResponse> {
    const traceId = traceIdHeader ?? randomUUID();
    return this.attemptsService.solveAdhoc(dto, traceId);
  }

  @Post('ocr-extract')
  @ApiOperation({
    summary: 'Extract math steps from a handwritten image (OCR)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string', format: 'binary' },
      },
      required: ['image'],
    },
  })
  @ApiResponse({ status: 201, description: 'OCR extraction result' })
  @UseInterceptors(FileInterceptor('image'))
  async ocrExtract(
    @UploadedFile() file: { buffer: Buffer },
  ): Promise<OcrExtractResult> {
    return this.attemptsService.extractOcr(file.buffer);
  }

  @Get(':id/status')
  @ApiOperation({
    summary: 'Get the live classification of an attempt (poll after submit)',
  })
  @ApiParam({ name: 'id', description: 'Attempt id' })
  @ApiResponse({ status: 200, description: 'Attempt classification status' })
  async status(@Param('id') attemptId: string): Promise<AttemptStatusResponse> {
    return this.attemptsService.getStatus(attemptId);
  }

  @Get(':id/detail')
  @ApiOperation({
    summary:
      'Steps + presigned photo URLs for an attempt (lightbox in drilldown)',
  })
  @ApiParam({ name: 'id', description: 'Attempt id' })
  @ApiResponse({
    status: 200,
    description: 'Attempt detail with steps and submission photos',
  })
  async detail(@Param('id') attemptId: string): Promise<AttemptDetailResponse> {
    return this.attemptsService.getDetail(attemptId);
  }

  @Post(':id/report')
  @ApiOperation({
    summary:
      'Report the correct error tag for an attempt (v8 C4 field feedback)',
  })
  @ApiParam({ name: 'id', description: 'Attempt id' })
  @ApiBody({ type: ReportAttemptErrorDto })
  @ApiResponse({ status: 201, description: 'Field-reported error recorded' })
  async report(
    @Param('id') attemptId: string,
    @Body() dto: ReportAttemptErrorDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReportAck> {
    return this.attemptsService.reportError(
      attemptId,
      dto,
      req.user?.prismaUserId ?? null,
    );
  }
}
