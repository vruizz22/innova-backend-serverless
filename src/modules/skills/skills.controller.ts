import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateSkillDto } from '@modules/skills/dto/create-skill.dto';
import { UpdateSkillDto } from '@modules/skills/dto/update-skill.dto';
import { SkillsService } from '@modules/skills/skills.service';

@ApiTags('skills')
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a skill' })
  @ApiBody({ type: CreateSkillDto })
  @ApiResponse({ status: 201, description: 'Skill created' })
  create(@Body() dto: CreateSkillDto) {
    return this.skillsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List skills' })
  @ApiResponse({ status: 200, description: 'Skills list' })
  findAll() {
    return this.skillsService.findAll();
  }

  // Declared before `:id` so the literal route is not captured by the param route.
  @Get('taxonomy')
  @ApiOperation({ summary: 'Math error taxonomy (domains + subdomains)' })
  @ApiResponse({ status: 200, description: 'Taxonomy tree' })
  getTaxonomy() {
    return this.skillsService.getTaxonomy();
  }

  // Declared before `:id` for the same reason as `taxonomy`.
  @Get('error-tags')
  @ApiOperation({
    summary: 'Search the ACTIVE error catalog (teacher manual override)',
  })
  @ApiResponse({ status: 200, description: 'Matching ACTIVE error tags' })
  searchErrorTags(
    @Query('q') q?: string,
    @Query('domainCode') domainCode?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number(limit) : undefined;
    return this.skillsService.searchErrorTags({
      ...(q ? { q } : {}),
      ...(domainCode ? { domainCode } : {}),
      ...(parsed !== undefined && Number.isFinite(parsed)
        ? { limit: parsed }
        : {}),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one skill' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string) {
    return this.skillsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a skill' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() dto: UpdateSkillDto) {
    return this.skillsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a skill' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string): Promise<boolean> {
    return this.skillsService.remove(id);
  }

  @Get(':id/prerequisites')
  @ApiOperation({ summary: 'Traverse prerequisites' })
  @ApiParam({ name: 'id' })
  prerequisites(@Param('id') id: string) {
    return {
      skillId: id,
      prerequisites: this.skillsService.getPrerequisites(id),
    };
  }
}
