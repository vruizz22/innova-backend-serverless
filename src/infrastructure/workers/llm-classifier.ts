import { SQSEvent } from 'aws-lambda';

export const handler = (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    void record.body;
  }

  return Promise.resolve();
};
