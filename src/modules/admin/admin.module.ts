import { Module } from '@nestjs/common';
import { AdminErrorTagsController } from '@modules/admin/admin-error-tags.controller';
import { AdminErrorTagsService } from '@modules/admin/admin-error-tags.service';

@Module({
  controllers: [AdminErrorTagsController],
  providers: [AdminErrorTagsService],
})
export class AdminModule {}
