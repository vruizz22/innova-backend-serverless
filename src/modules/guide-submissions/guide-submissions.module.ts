import { Module } from '@nestjs/common';
import { GuideSubmissionsController } from '@modules/guide-submissions/guide-submissions.controller';
import { GuideSubmissionsService } from '@modules/guide-submissions/guide-submissions.service';
import { S3Adapter } from '@adapters/s3.adapter';
import { SqsAdapter } from '@adapters/sqs.adapter';

@Module({
  controllers: [GuideSubmissionsController],
  providers: [GuideSubmissionsService, S3Adapter, SqsAdapter],
  exports: [GuideSubmissionsService],
})
export class GuideSubmissionsModule {}
