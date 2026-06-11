import { Module } from '@nestjs/common';
import { GuidesController } from '@modules/guides/guides.controller';
import { GuidesService } from '@modules/guides/guides.service';
import { S3Adapter } from '@adapters/s3.adapter';
import { SqsAdapter } from '@adapters/sqs.adapter';

@Module({
  controllers: [GuidesController],
  providers: [GuidesService, S3Adapter, SqsAdapter],
  exports: [GuidesService],
})
export class GuidesModule {}
