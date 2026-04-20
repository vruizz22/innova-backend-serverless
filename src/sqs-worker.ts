import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { TelemetryWorker } from '@/application/telemetry/telemetry.worker';
import { SQSEvent } from 'aws-lambda';
import { INestApplicationContext } from '@nestjs/common';

let appContext: INestApplicationContext;

export const handler = async (event: SQSEvent): Promise<void> => {
  if (!appContext) {
    appContext = await NestFactory.createApplicationContext(AppModule);
  }
  const worker = appContext.get(TelemetryWorker);
  return worker.processSQSBatch(event);
};
