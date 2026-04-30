import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AlertsService } from '@modules/alerts/alerts.service';

@ApiTags('alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'List active alerts by classroom' })
  @ApiQuery({ name: 'classroomId' })
  list(@Query('classroomId') classroomId: string) {
    return this.alertsService.findByClassroom(classroomId);
  }

  @Post()
  @ApiOperation({ summary: 'Create alert' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        classroomId: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  create(@Body() body: { classroomId: string; message: string }) {
    return this.alertsService.create(body.classroomId, body.message);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolve alert' })
  @ApiParam({ name: 'id' })
  resolve(@Param('id') id: string) {
    return this.alertsService.resolve(id);
  }
}
