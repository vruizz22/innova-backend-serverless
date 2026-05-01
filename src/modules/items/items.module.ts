import { Module } from '@nestjs/common';
import { ItemsController } from '@modules/items/items.controller';
import { ItemsService } from '@modules/items/items.service';

@Module({
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
