import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MasteryService } from '@modules/mastery/mastery.service';

@ApiTags('mastery')
@Controller('mastery')
export class MasteryController {
  constructor(private readonly masteryService: MasteryService) {}

  @Get(':studentId')
  @ApiOperation({ summary: 'Get per-skill mastery for one student' })
  @ApiParam({ name: 'studentId' })
  @ApiResponse({ status: 200, description: 'Mastery payload' })
  async getByStudent(@Param('studentId') studentId: string) {
    return this.masteryService.getStudentMastery(studentId);
  }
}
