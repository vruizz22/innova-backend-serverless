import { Test, TestingModule } from '@nestjs/testing';
import { AttemptsController } from '@modules/attempts/attempts.controller';
import { AttemptsService } from '@modules/attempts/attempts.service';

const mockAttemptResponse = {
  attemptId: 'attempt-001',
  isCorrect: false,
  errorTagCode: 'BORROW_OMITTED_TENS',
  classifierSource: 'RULE' as const,
  confidence: 0.93,
};

const mockOcrResult = {
  rawSteps: [{ expression: '53 - 26 = 33', isFinal: true }],
  finalAnswer: '33',
  topicHint: 'subtraction_borrow',
  confidence: 0.92,
};

const mockAttemptsService = {
  create: jest.fn().mockResolvedValue(mockAttemptResponse),
  extractOcr: jest.fn().mockResolvedValue(mockOcrResult),
};

describe('AttemptsController', () => {
  let controller: AttemptsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttemptsController],
      providers: [{ provide: AttemptsService, useValue: mockAttemptsService }],
    }).compile();

    controller = module.get<AttemptsController>(AttemptsController);
    jest.clearAllMocks();
  });

  it('create delegates to AttemptsService and passes traceId', async () => {
    const dto = {
      studentId: 'student-001',
      topicCode: 'T-SUB-BORROW',
      rawSteps: [],
      expectedAnswer: 27,
      studentAnswer: 33,
    };
    const result = await controller.create(
      dto as Parameters<typeof controller.create>[0],
      'custom-trace-id',
    );
    expect(mockAttemptsService.create).toHaveBeenCalledWith(
      dto,
      'custom-trace-id',
    );
    expect(result).toEqual(mockAttemptResponse);
  });

  it('create generates traceId when header absent', async () => {
    const dto = {
      studentId: 'student-001',
      topicCode: 'T-SUB-BORROW',
      rawSteps: [],
      expectedAnswer: 27,
      studentAnswer: 33,
    };
    await controller.create(
      dto as Parameters<typeof controller.create>[0],
      undefined,
    );
    const [, calledTraceId] = mockAttemptsService.create.mock.calls[0] as [
      unknown,
      string,
    ];
    expect(typeof calledTraceId).toBe('string');
    expect(calledTraceId.length).toBeGreaterThan(0);
  });

  it('ocrExtract delegates to AttemptsService', async () => {
    const file = { buffer: Buffer.from('image-data') };
    const result = await controller.ocrExtract(file);
    expect(mockAttemptsService.extractOcr).toHaveBeenCalledWith(file.buffer);
    expect(result).toEqual(mockOcrResult);
  });
});
