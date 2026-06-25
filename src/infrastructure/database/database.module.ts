import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { z } from 'zod';
import { PrismaService } from '@infrastructure/database/prisma.service';

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  MONGODB_URI: z.string().url().startsWith('mongodb'),
  PORT: z.string().optional().default('3000'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().optional(),
  PUBLIC_APP_URL: z.string().url().optional(),
  PUBLIC_API_URL: z.string().url().optional(),
  PUBLIC_PRACTICE_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().optional(),
  SQS_ATTEMPT_STREAM_URL: z.string().url().optional(),
  SQS_LLM_CLASSIFY_URL: z.string().url().optional(),
  SQS_OCR_QUEUE_URL: z.string().url().optional(),
  SQS_ATTEMPT_REPROCESS_URL: z.string().url().optional(),
  // v9 — guides pipeline queues
  SQS_GUIDE_INGEST_URL: z.string().url().optional(),
  SQS_SOLUTION_GEN_URL: z.string().url().optional(),
  SQS_SUBMISSION_GRADE_URL: z.string().url().optional(),
  // v9 — guides pipeline storage
  S3_GUIDES_BUCKET: z.string().optional(),
  S3_SUBMISSIONS_BUCKET: z.string().optional(),
  GUIDES_PRESIGNED_PUT_TTL: z.coerce.number().int().positive().default(600),
  GUIDES_PRESIGNED_GET_TTL: z.coerce.number().int().positive().default(300),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  AWS_REGION: z.string().optional(),
  // AWS endpoint + creds: present in local .env (LocalStack), absent in prod
  // (task-role creds + real endpoint). MUST be declared or Zod strips them from
  // process.env and the S3/SQS clients fall back to real AWS (see s3.adapter.ts).
  AWS_ENDPOINT_URL: z.string().url().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SUBMISSIONS_PRESIGNED_GET_TTL: z.coerce
    .number()
    .int()
    .positive()
    .default(300),
  GEMINI_MODEL: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
});

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // `.passthrough()` so undeclared .env vars still reach process.env (the
      // S3/SQS adapters read process.env directly). Without it, Zod strips any
      // key not listed above and those clients silently fall back to real AWS.
      validate: (config) => envSchema.passthrough().parse(config),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
