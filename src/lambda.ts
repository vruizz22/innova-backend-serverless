import { configure as serverlessExpress } from '@vendia/serverless-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { Handler, Context, Callback } from 'aws-lambda';

let cachedServer: Handler;

export const handler: Handler = async (
  event: unknown,
  context: Context,
  callback: Callback,
) => {
  if (!cachedServer) {
    const nestApp = await NestFactory.create(AppModule);
    nestApp.enableCors();
    await nestApp.init();

    const expressApp = nestApp.getHttpAdapter().getInstance() as Parameters<
      typeof serverlessExpress
    >[0]['app'];

    cachedServer = serverlessExpress({
      app: expressApp,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const result = await cachedServer(event as any, context, callback);
  return result as unknown;
  // eslint-disable-next-line prettier/prettier
};;
