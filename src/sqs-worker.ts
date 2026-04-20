import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TelemetryWorker } from './application/telemetry/telemetry.worker';
import { SQSEvent, Context } from 'aws-lambda';

let appContext;

export const handler = async (event: SQSEvent, context: Context) => {
  if (!appContext) {
    appContext = await NestFactory.createApplicationContext(AppModule);
  }
  const worker = appContext.get(TelemetryWorker);
  return worker.processSQSBatch(event);
};
