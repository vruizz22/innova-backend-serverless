import {
  Body,
  Controller,
  Headers,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import {
  AttemptsService,
  OcrExtractResult,
} from '@modules/attempts/attempts.service';

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
}
