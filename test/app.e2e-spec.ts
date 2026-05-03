import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '@/app.module';

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: () => {
    return (
      _request: unknown,
      _rawJwtToken: unknown,
      done: (error: unknown, secret?: string) => void,
    ) => {
      done(null, 'test-secret-key');
    };
  },
}));

jest.mock('mongoose', () => {
  const schemaMock = {
    index: jest.fn(),
  };

  return {
    connect: jest.fn().mockResolvedValue({}),
    Schema: jest.fn(() => schemaMock),
    model: jest.fn(() => ({
      insertMany: jest.fn(),
    })),
    connection: {
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(true),
      readyState: 1,
      models: {},
    },
  };
});

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('DatabaseConnection')
      .useValue({
        models: {},
        model: jest.fn().mockReturnValue({}),
        close: jest.fn().mockResolvedValue(true),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/ (GET)', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Innova Backend Serverless is running!');
  });
});
