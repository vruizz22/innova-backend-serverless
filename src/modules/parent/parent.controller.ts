import { Controller, Get, Param, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ParentService } from '@modules/parent/parent.service';
import { Roles } from '@modules/auth/roles.decorator';
import { Role } from '@modules/auth/roles.enum';
import type { SupabaseUser } from '@modules/auth/supabase-jwt.strategy';

type AuthRequest = { user: SupabaseUser };

@ApiTags('parent')
@ApiBearerAuth()
@Roles(Role.PARENT)
@Controller('parent')
export class ParentController {
  constructor(private readonly service: ParentService) {}

  @Get('children')
  @ApiOperation({ summary: "The parent's confirmed children (C12)" })
  listChildren(@Request() req: AuthRequest) {
    return this.service.listChildren(req.user.prismaUserId);
  }

  @Get('children/:studentId')
  @ApiOperation({
    summary: 'Child summary: mastery bands + recent guides + soft alerts (C12, COPPA-safe)',
  })
  @ApiParam({ name: 'studentId' })
  childSummary(@Request() req: AuthRequest, @Param('studentId') studentId: string) {
    return this.service.getChildSummary(req.user.prismaUserId, studentId);
  }
}
