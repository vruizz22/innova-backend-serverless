import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateItemDto } from '@modules/items/dto/create-item.dto';
import { ItemsService } from '@modules/items/items.service';

@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an item' })
  @ApiBody({ type: CreateItemDto })
  @ApiResponse({ status: 201, description: 'Item created' })
  create(@Body() dto: CreateItemDto) {
    return this.itemsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List item bank' })
  findAll(
    @Query('skillKey') skillKey?: string,
    @Query('topic') topic?: string,
    @Query('limit') limit?: string,
  ) {
    return this.itemsService.findAll(
      skillKey ?? topic,
      limit ? Number(limit) : 32,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one item' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string) {
    return this.itemsService.findOne(id);
  }

  @Get(':id/irt')
  @ApiOperation({ summary: 'Get read-only IRT parameters' })
  @ApiParam({ name: 'id' })
  getIrtParams(@Param('id') id: string) {
    return this.itemsService.getIrtParams(id);
  }
}
