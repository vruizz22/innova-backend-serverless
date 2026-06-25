import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ProcessScanPageDto {
  @ApiProperty({ description: 'S3 key returned by GET .../scan-page-url' })
  @IsString()
  @IsNotEmpty()
  photoKey!: string;
}

export interface ScanPageUploadUrlResponse {
  photoKey: string;
  presignedUrl: string;
}

export interface ScanPageSubmissionResult {
  questionId: string;
  sequence: number;
  submissionId: string | null;
  skipped: boolean;
  reason?: string;
}

export interface ProcessScanPageResponse {
  photoKey: string;
  matched: number;
  submissions: ScanPageSubmissionResult[];
}
