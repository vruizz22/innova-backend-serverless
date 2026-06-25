import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { Roles } from '@modules/auth/roles.decorator';
import { Role } from '@modules/auth/roles.enum';
import {
  AdminStatusService,
  type AdminStatusResponse,
  VALID_KILLSWITCH_KEYS,
} from '@modules/admin/admin-status.service';

class ToggleKillswitchDto {
  @IsBoolean()
  enabled!: boolean;
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/status')
export class AdminStatusController {
  constructor(private readonly service: AdminStatusService) {}

  @Get()
  @ApiOperation({
    summary:
      'Pipeline health: SQS queue depths, DB activity counts, cost (EMF A9.4), killswitches',
  })
  @ApiResponse({ status: 200, description: 'Admin status snapshot' })
  getStatus(): Promise<AdminStatusResponse> {
    return this.service.getStatus();
  }

  @Patch('killswitches/:key')
  @ApiOperation({
    summary:
      'Toggle a pipeline killswitch (graderEnabled | classifierEnabled | solutionGeneratorEnabled). ' +
      'enabled:true = worker runs; enabled:false = worker paused.',
  })
  @ApiParam({
    name: 'key',
    enum: VALID_KILLSWITCH_KEYS,
    description: 'Killswitch identifier',
  })
  @ApiBody({ type: ToggleKillswitchDto })
  @ApiResponse({ status: 200, description: 'Killswitch updated' })
  async toggleKillswitch(
    @Param('key') key: string,
    @Body() dto: ToggleKillswitchDto,
  ): Promise<{ key: string; enabled: boolean }> {
    if (!VALID_KILLSWITCH_KEYS.includes(key)) {
      throw new BadRequestException(
        `Unknown killswitch key "${key}". Valid: ${VALID_KILLSWITCH_KEYS.join(', ')}`,
      );
    }
    return this.service.toggleKillswitch(key, dto.enabled);
  }
}
