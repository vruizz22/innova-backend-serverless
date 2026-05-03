import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { z } from 'zod';
import { PrismaService } from '@infrastructure/database/prisma.service';

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  MONGODB_URI: z.string().url().startsWith('mongodb'),
  PORT: z.string().optional().default('3000'),
  PUBLIC_APP_URL: z.string().url(),
  PUBLIC_API_URL: z.string().url(),
  CORS_ORIGINS: z.string(),
  COGNITO_USER_POOL_ID: z.string(),
  COGNITO_CLIENT_ID: z.string(),
  COGNITO_REGION: z.string(),
  SQS_ATTEMPT_STREAM_URL: z.string().url().optional(),
  SQS_LLM_CLASSIFY_URL: z.string().url().optional(),
  SQS_OCR_QUEUE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string(),
  RESEND_FROM_EMAIL: z.string().email(),
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
