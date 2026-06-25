import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@modules/auth/roles.decorator';
import { Role } from '@modules/auth/roles.enum';
import { AdminErrorTagsService } from '@modules/admin/admin-error-tags.service';
import { ListErrorTagsDto } from '@modules/admin/dto/list-error-tags.dto';
import { UpdateErrorTagStatusDto } from '@modules/admin/dto/update-error-tag-status.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/error-tags')
export class AdminErrorTagsController {
  constructor(private readonly service: AdminErrorTagsService) {}

  @Get()
  @ApiOperation({
    summary: 'Browse the live error-tag catalog (keyset paginated, ADMIN)',
  })
  list(@Query() query: ListErrorTagsDto) {
    return this.service.listErrorTags(query);
  }

  @Patch(':code/status')
  @ApiOperation({
    summary: 'Promote (ACTIVE) / deprecate an error tag (ADMIN)',
  })
  @ApiParam({ name: 'code' })
  updateStatus(
    @Param('code') code: string,
    @Body() dto: UpdateErrorTagStatusDto,
  ) {
    return this.service.updateErrorTagStatus(code, dto.status);
  }
}
