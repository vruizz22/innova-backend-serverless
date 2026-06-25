import { Injectable, Logger } from '@nestjs/common';
import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';

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
  // AWS_ENDPOINT_URL is set ONLY in local dev (LocalStack). When present, point
  // the client at it with path-style addressing so presigned URLs resolve to
  // `http://localhost:4566/<bucket>/<key>` (the browser can PUT there) instead
  // of virtual-host `<bucket>.s3.amazonaws.com`. In prod the var is unset → the
  // SDK uses the real AWS endpoint + the task-role credentials.
  private readonly client = new S3Client({
    region: process.env['AWS_REGION'] ?? 'us-east-1',
    // AWS SDK v3 (>= 3.729) embeds a CRC32 checksum in the SIGNED query string at
    // presign time. The presigner has no body, so it signs the checksum of an
    // EMPTY payload (`AAAAAA==`). The browser then PUTs the real file, the bytes
    // no longer match the signed checksum, and S3/LocalStack reject it with 400.
    // `WHEN_REQUIRED` only adds a checksum when the operation mandates one
    // (PutObject does not), so it drops out of presigned URLs. Safe in prod too.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(process.env['AWS_ENDPOINT_URL']
      ? {
          endpoint: process.env['AWS_ENDPOINT_URL'],
          forcePathStyle: true,
          credentials: {
            accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? 'test',
            secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? 'test',
          },
        }
      : {}),
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

  /** Downloads an S3 object as a Buffer (used by scan-page OCR flow). */
  async getObjectBytes(bucket: string, key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const stream = response.Body;
    if (!(stream instanceof Readable)) {
      throw new Error(`S3 GetObject body is not a readable stream for ${key}`);
    }
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
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
