import { configure as serverlessExpress } from '@vendia/serverless-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { ValidationPipe } from '@nestjs/common';
import { Handler, Context, Callback } from 'aws-lambda';
import { AllExceptionsFilter } from '@shared/exceptions/http-exception.filter';
import { LoggingInterceptor } from '@shared/http/logging.interceptor';
import { ResponseInterceptor } from '@shared/http/response.interceptor';

let cachedServer: Handler;

export const handler: Handler = async (
  event: unknown,
  context: Context,
  callback: Callback,
) => {
  if (!cachedServer) {
    const nestApp = await NestFactory.create(AppModule);
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

    cachedServer = serverlessExpress({
      app: expressApp,
    });
  }
  return (await cachedServer(event, context, callback)) as unknown;
};
