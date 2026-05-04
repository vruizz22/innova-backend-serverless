import { configure as serverlessExpress } from '@vendia/serverless-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { ValidationPipe } from '@nestjs/common';
import { Handler, Context, Callback } from 'aws-lambda';
import { AllExceptionsFilter } from '@shared/exceptions/http-exception.filter';
import { LoggingInterceptor } from '@shared/http/logging.interceptor';
import { ResponseInterceptor } from '@shared/http/response.interceptor';

let cachedServer: Handler | null = null;
let bootstrapError: Error | null = null;

async function bootstrap(): Promise<Handler> {
  const nestApp = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  nestApp.enableCors();
  nestApp.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  nestApp.useGlobalFilters(new AllExceptionsFilter());
  nestApp.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );
  await nestApp.init();

  const expressApp = nestApp.getHttpAdapter().getInstance() as Parameters<
    typeof serverlessExpress
  >[0]['app'];

  return serverlessExpress({ app: expressApp });
}

export const handler: Handler = async (
  event: unknown,
  context: Context,
  callback: Callback,
) => {
  // If bootstrap previously failed, return a structured 500 instead of crashing
  if (bootstrapError) {
    console.error(
      '[Lambda] Bootstrap previously failed:',
      bootstrapError.message,
    );
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statusCode: 500,
        message: 'Service initialization failed',
        error: bootstrapError.message,
      }),
    };
  }

  if (!cachedServer) {
    try {
      cachedServer = await bootstrap();
    } catch (err) {
      bootstrapError = err instanceof Error ? err : new Error(String(err));
      console.error('[Lambda] Bootstrap failed:', bootstrapError.message);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 500,
          message: 'Service initialization failed',
          error: bootstrapError.message,
        }),
      };
    }
  }

  return (await cachedServer(event, context, callback)) as unknown;
};
