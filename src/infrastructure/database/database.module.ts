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
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  AWS_REGION: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
});

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
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
