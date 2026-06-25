import { Module } from '@nestjs/common';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { SsmAdapter } from '@adapters/ssm.adapter';
import { AdminErrorTagsController } from '@modules/admin/admin-error-tags.controller';
import { AdminErrorTagsService } from '@modules/admin/admin-error-tags.service';
import { AdminStatusController } from '@modules/admin/admin-status.controller';
import { AdminStatusService } from '@modules/admin/admin-status.service';

@Module({
  controllers: [AdminErrorTagsController, AdminStatusController],
  providers: [
    AdminErrorTagsService,
    AdminStatusService,
    SqsAdapter,
    SsmAdapter,
  ],
})
export class AdminModule {}
