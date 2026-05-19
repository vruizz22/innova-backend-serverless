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
  @ApiOperation({ summary: 'List active alerts by course' })
  @ApiQuery({ name: 'courseId', required: false })
  @ApiQuery({ name: 'classroomId', required: false })
  list(
    @Query('courseId') courseId?: string,
    @Query('classroomId') classroomId?: string,
  ) {
    return this.alertsService.findByCourse(courseId ?? classroomId ?? '');
  }

  @Post()
  @ApiOperation({ summary: 'Create alert' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['courseId', 'teacherId', 'alertType'],
      properties: {
        courseId: { type: 'string' },
        teacherId: { type: 'string' },
        alertType: { type: 'string' },
        topicId: { type: 'string' },
        studentId: { type: 'string' },
        severity: { type: 'string', enum: ['LOW', 'MED', 'HIGH'] },
        payload: { type: 'object' },
      },
    },
  })
  create(
    @Body()
    body: {
      courseId: string;
      teacherId: string;
      alertType: string;
      topicId?: string;
      studentId?: string;
      severity?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    return this.alertsService.create(body);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolve alert' })
  @ApiParam({ name: 'id' })
  resolve(@Param('id') id: string) {
    return this.alertsService.resolve(id);
  }
}
