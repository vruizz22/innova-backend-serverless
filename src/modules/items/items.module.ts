import { Module } from '@nestjs/common';
import { ItemsController } from '@modules/items/items.controller';
import { ItemsService } from '@modules/items/items.service';
import { SqsAdapter } from '@adapters/sqs.adapter';

@Module({
  controllers: [ItemsController],
  providers: [ItemsService, SqsAdapter],
  exports: [ItemsService],
})
export class ItemsModule {}
