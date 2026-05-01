import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
  findAll() {
    return this.itemsService.findAll();
  }

  @Get(':id/irt')
  @ApiOperation({ summary: 'Get read-only IRT parameters' })
  @ApiParam({ name: 'id' })
  getIrtParams(@Param('id') id: string) {
    return this.itemsService.getIrtParams(id);
  }
}
