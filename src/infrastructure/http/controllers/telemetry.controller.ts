import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { TelemetryService } from '../../../application/telemetry/telemetry.service';
import { ParseRawTelemetryDto } from '../../../application/telemetry/dto/raw-telemetry.dto';

@ApiTags('Telemetry Ingestion pipeline')
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('/ingest')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Ingest raw telemetry from the minigame (NNA client).',
  })
  @ApiBody({ type: ParseRawTelemetryDto })
  @ApiResponse({
    status: 202,
    description: 'Batch enqueued for asynchronous SQS processing.',
  })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async ingestTelemetry(@Body() payload: ParseRawTelemetryDto) {
    await this.telemetryService.processSingleTelemetry(payload);
    return { status: 'Accepted', message: 'Telemetry successfully queued.' };
  }
}
