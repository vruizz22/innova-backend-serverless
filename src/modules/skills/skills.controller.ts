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
  remove(@Param('id') id: string): void {
    this.skillsService.remove(id);
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
