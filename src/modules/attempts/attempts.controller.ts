import { Body, Controller, Headers, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import { AttemptsService } from '@modules/attempts/attempts.service';

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
}
