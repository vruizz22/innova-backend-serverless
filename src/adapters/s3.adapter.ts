import { Injectable, Logger } from '@nestjs/common';
import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Thin wrapper over the S3 SDK for the v9 guides pipeline (ADR-123).
 *
 * The backend never streams object bytes: it issues short-lived presigned URLs
 * (PUT for uploads, GET for figures/PDFs) and validates uploads via HeadObject.
 * EXIF-stripping of student photos happens client-side before the presigned PUT.
 */
@Injectable()
export class S3Adapter {
  private readonly logger = new Logger(S3Adapter.name);
  private readonly client = new S3Client({
    region: process.env['AWS_REGION'] ?? 'us-east-1',
  });

  /** Presigned PUT URL for direct browser/app upload. */
  async createPresignedPutUrl(params: {
    bucket: string;
    key: string;
    ttlSeconds: number;
    contentType?: string;
  }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      ...(params.contentType ? { ContentType: params.contentType } : {}),
    });
    return getSignedUrl(this.client, command, {
      expiresIn: params.ttlSeconds,
    });
  }

  /** Presigned GET URL for reading a private object (figure crop, PDF). */
  async createPresignedGetUrl(params: {
    bucket: string;
    key: string;
    ttlSeconds: number;
  }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: params.ttlSeconds,
    });
  }

  /** Verifies an upload actually landed in S3 before transitioning state. */
  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return true;
    } catch (error) {
      this.logger.debug(
        `HeadObject miss for ${bucket}/${key}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return false;
    }
  }
}
