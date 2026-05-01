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

  // Pino Logger
  app.useLogger(app.get(Logger));

  // Global Config (FaztWeb Directive Setup)
  app.enableCors({
    origin: ['http://localhost:3000', 'https://superprofes.app'],
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
  const config = new DocumentBuilder()
    .setTitle('Innova Serverless Core API')
    .setDescription('EdTech Platform Backend')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
