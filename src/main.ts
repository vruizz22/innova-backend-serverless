import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from '@shared/exceptions/http-exception.filter';
import { LoggingInterceptor } from '@shared/http/logging.interceptor';
import { ResponseInterceptor } from '@shared/http/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const publicAppUrl = process.env.PUBLIC_APP_URL;
  const publicApiUrl = process.env.PUBLIC_API_URL;

  if (corsOrigins.length === 0 && publicAppUrl) {
    corsOrigins.push(publicAppUrl);
  }

  // Pino Logger
  app.useLogger(app.get(Logger));

  // Global Config (FaztWeb Directive Setup)
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );

  // Swagger Setup
  const documentBuilder = new DocumentBuilder()
    .setTitle('Innova Serverless Core API')
    .setDescription('EdTech Platform Backend')
    .setVersion('1.0')
    .addBearerAuth();

  if (publicApiUrl) {
    documentBuilder.addServer(publicApiUrl);
  }

  const document = SwaggerModule.createDocument(app, documentBuilder.build());
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
