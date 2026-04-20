import { Context, Handler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import serverlessExpress from '@vendia/serverless-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

let cachedServer: Handler;

async function bootstrap() {
  if (!cachedServer) {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    // Observability (Pino)
    app.useLogger(app.get(Logger));

    // Global Pipes
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    // CORS for frontend
    app.enableCors({
      origin: ['http://localhost:3000', 'https://innovamvp.tech'],
      credentials: true,
    });

    // Swagger
    const config = new DocumentBuilder()
      .setTitle('Innova Backend API')
      .setDescription(
        'Serverless core backend for FSLSM processing & Telemetry ingestion',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    await app.init();

    const expressApp = app.getHttpAdapter().getInstance();
    cachedServer = serverlessExpress({ app: expressApp });
  }

  return cachedServer;
}

export const handler = async (event: any, context: Context, callback: any) => {
  const server = await bootstrap();
  return server(event, context, callback);
};
