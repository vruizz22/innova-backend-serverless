import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PracticeService } from '@modules/practice/practice.service';

@ApiTags('practice')
@Controller('practice')
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Post('assign')
  @ApiOperation({ summary: 'Create adaptive assignment' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        studentId: { type: 'string' },
        itemIds: { type: 'array', items: { type: 'string' } },
        dueAt: { type: 'string' },
      },
      required: ['studentId', 'itemIds'],
    },
  })
  assign(
    @Body() body: { studentId: string; itemIds: string[]; dueAt?: string },
  ) {
    return this.practiceService.createAssignment(
      body.studentId,
      body.itemIds,
      body.dueAt,
    );
  }
}
