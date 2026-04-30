interface S3EventRecord {
  s3: {
    bucket: { name: string };
    object: { key: string };
  };
}

interface S3Event {
  Records: S3EventRecord[];
}

export const handler = (event: S3Event): Promise<void> => {
  for (const record of event.Records) {
    void record.s3.bucket.name;
    void record.s3.object.key;
  }

  return Promise.resolve();
};
