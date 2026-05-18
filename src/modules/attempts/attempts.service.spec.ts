import { AttemptsService } from '@modules/attempts/attempts.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { MasteryService } from '@modules/mastery/mastery.service';
import { RuleEngineService } from '@modules/attempts/rule-engine/engine.service';
import { MathOCROrchestrator } from '@adapters/math-ocr/math-ocr.orchestrator';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import type { RuleClassificationResult } from '@modules/attempts/rule-engine/strategy.interface';

const BASE_DTO: CreateAttemptDto = {
  studentId: 'student-1',
  topicCode: 'T-SUB-BORROW',
  rawSteps: [{ expression: '53 - 26 = 27', isFinal: true }],
  expectedAnswer: 27,
  studentAnswer: 27,
  get skillKey() {
    return this.topicCode;
  },
};

function buildMockPrisma() {
  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    topic: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'topic-1', code: 'T-SUB-BORROW' }),
    },
    errorTag: {
      findUnique: jest.fn().mockResolvedValue({ id: 'tag-1', code: 'CORRECT' }),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'tag-2', code: 'BORROW_OMITTED_TENS' }),
    },
    attempt: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'attempt-uuid-1', isCorrect: true }),
    },
    attemptStep: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    exercise: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaService;
}

function buildMockRuleEngine(result: RuleClassificationResult) {
  return {
    classify: jest.fn().mockReturnValue(result),
  } as unknown as RuleEngineService;
}

function buildMockMastery() {
  return {
    applyAttempt: jest.fn().mockResolvedValue({
      studentId: 's1',
      topicCode: 'T-SUB-BORROW',
      pKnown: 0.7,
    }),
  } as unknown as MasteryService;
}

function buildMockSqs() {
  return {
    publishFifo: jest.fn().mockResolvedValue(undefined),
    publishStandard: jest.fn().mockResolvedValue(undefined),
  } as unknown as SqsAdapter;
}

function buildMockOcr() {
  return {
    extract: jest.fn().mockResolvedValue({
      rawSteps: [{ expression: '3+4', isFinal: true }],
      finalAnswer: '7',
      topicHint: 'T-ADD-CARRY',
      confidence: 0.91,
    }),
  } as unknown as MathOCROrchestrator;
}

describe('AttemptsService', () => {
  it('CORRECT — returns correct classification, calls mastery and fifo', async () => {
    const prisma = buildMockPrisma();
    const ruleEngine = buildMockRuleEngine({
      isCorrect: true,
      errorType: 'CORRECT',
      confidence: 1.0,
    });
    const mastery = buildMockMastery();
    const sqs = buildMockSqs();
    const service = new AttemptsService(
      prisma,
      ruleEngine,
      mastery,
      sqs,
      buildMockOcr(),
    );

    const result = await service.create(BASE_DTO, 'trace-1');

    expect(result.isCorrect).toBe(true);
    expect(result.errorTagCode).toBe('CORRECT');
    expect(result.classifierSource).toBe('RULE');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mastery.applyAttempt).toHaveBeenCalledWith(
      'student-1',
      'topic-1',
      true,
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sqs.publishFifo).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sqs.publishStandard).not.toHaveBeenCalled();
  });

  it('UNCLASSIFIED — routes to LLM queue, classifierSource=LLM', async () => {
    const prisma = buildMockPrisma();
    const ruleEngine = buildMockRuleEngine({
      isCorrect: false,
      errorType: 'UNCLASSIFIED',
      confidence: 0.0,
    });
    const mastery = buildMockMastery();
    const sqs = buildMockSqs();
    const service = new AttemptsService(
      prisma,
      ruleEngine,
      mastery,
      sqs,
      buildMockOcr(),
    );

    const dto = { ...BASE_DTO, studentAnswer: 99 };
    const result = await service.create(dto, 'trace-2');

    expect(result.classifierSource).toBe('LLM');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sqs.publishStandard).toHaveBeenCalled();
  });

  it('classified error — saves errorTag, classifierSource=RULE', async () => {
    const prisma = buildMockPrisma();
    const ruleEngine = buildMockRuleEngine({
      isCorrect: false,
      errorType: 'BORROW_OMITTED_TENS',
      confidence: 0.93,
    });
    const mastery = buildMockMastery();
    const sqs = buildMockSqs();
    const service = new AttemptsService(
      prisma,
      ruleEngine,
      mastery,
      sqs,
      buildMockOcr(),
    );

    const dto = { ...BASE_DTO, studentAnswer: 33 };
    const result = await service.create(dto, 'trace-3');

    expect(result.isCorrect).toBe(false);
    expect(result.errorTagCode).toBe('BORROW_OMITTED_TENS');
    expect(result.classifierSource).toBe('RULE');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sqs.publishStandard).not.toHaveBeenCalled();
  });

  it('extractOcr — delegates to ocrOrchestrator', async () => {
    const prisma = buildMockPrisma();
    const ruleEngine = buildMockRuleEngine({
      isCorrect: true,
      errorType: 'CORRECT',
      confidence: 1.0,
    });
    const service = new AttemptsService(
      prisma,
      ruleEngine,
      buildMockMastery(),
      buildMockSqs(),
      buildMockOcr(),
    );

    const result = await service.extractOcr(Buffer.from('test-image'));

    expect(result.topicHint).toBe('T-ADD-CARRY');
    expect(result.confidence).toBe(0.91);
    expect(result.rawSteps).toHaveLength(1);
  });
});
import { MathOCROrchestrator } from '@adapters/math-ocr/math-ocr.orchestrator';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import { ErrorType } from '@prisma/client';

const ATTEMPT_ID = 'attempt-uuid-1';

function buildMockPrisma(
  extraAttemptData: Record<string, unknown> = {},
): PrismaService {
  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    attempt: {
      create: jest.fn().mockResolvedValue({
        id: ATTEMPT_ID,
        studentId: 'student-1',
        itemId: null,
        isCorrect: true,
        errorType: null,
        classifierSource: 'RULE_ENGINE',
        confidence: 1.0,
        rawSteps: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...extraAttemptData,
      }),
    },
    item: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaService;
}

function buildMockRuleEngine(result: {
  isCorrect: boolean;
  errorType: string;
  confidence: number;
}): RuleEngineService {
  return {
    classify: jest.fn().mockReturnValue(result),
  } as unknown as RuleEngineService;
}

function buildMockMastery(): MasteryService {
  return {
    applyAttempt: jest.fn().mockResolvedValue({
      studentId: 'student-1',
      skillKey: 'subtraction_borrow',
      pKnown: 0.7,
    }),
  } as unknown as MasteryService;
}

function buildMockSqs(): SqsAdapter {
  return {
    publishFifo: jest.fn().mockResolvedValue(undefined),
    publishStandard: jest.fn().mockResolvedValue(undefined),
  } as unknown as SqsAdapter;
}

function buildMockOcr(): MathOCROrchestrator {
  return {
    extract: jest.fn().mockResolvedValue({
      extractedText: '53 - 26 = 27',
      confidence: 0.95,
      rawSteps: [{ expression: '53 - 26 = 27', isFinal: true }],
      topicHint: 'subtraction_borrow',
      finalAnswer: '27',
    }),
  } as unknown as MathOCROrchestrator;
}

const makeDto = (overrides: Partial<CreateAttemptDto> = {}): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    skillKey: 'subtraction_borrow',
    expectedAnswer: 27,
    studentAnswer: 27,
    rawSteps: [],
    minuend: 53,
    subtrahend: 26,
    ...overrides,
  }) as CreateAttemptDto;

describe('AttemptsService', () => {
  let service: AttemptsService;
  let mockRuleEngine: RuleEngineService;
  let mockMastery: MasteryService;
  let mockSqs: SqsAdapter;
  let mockPrisma: PrismaService;

  describe('CORRECT attempts', () => {
    beforeEach(() => {
      mockRuleEngine = buildMockRuleEngine({
        isCorrect: true,
        errorType: 'CORRECT',
        confidence: 1.0,
      });
      mockMastery = buildMockMastery();
      mockSqs = buildMockSqs();
      mockPrisma = buildMockPrisma();
      service = new AttemptsService(
        mockPrisma,
        mockRuleEngine,
        mockMastery,
        mockSqs,
        buildMockOcr(),
      );
    });

    it('returns CORRECT with isCorrect=true', async () => {
      const result = await service.create(makeDto(), 'trace-1');
      expect(result.isCorrect).toBe(true);
      expect(result.errorType).toBe('CORRECT');
      expect(result.attemptId).toBe(ATTEMPT_ID);
    });

    it('calls MasteryService.applyAttempt on correct answer', async () => {
      await service.create(makeDto(), 'trace-1');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockMastery.applyAttempt).toHaveBeenCalledWith(
        'student-1',
        'subtraction_borrow',
        true,
      );
    });

    it('publishes to SQS FIFO on every attempt', async () => {
      await service.create(makeDto(), 'trace-1');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockSqs.publishFifo).toHaveBeenCalled();
    });

    it('does NOT publish to LLM SQS queue on CORRECT', async () => {
      await service.create(makeDto(), 'trace-1');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockSqs.publishStandard).not.toHaveBeenCalled();
    });
  });

  describe('UNCLASSIFIED attempts', () => {
    beforeEach(() => {
      mockRuleEngine = buildMockRuleEngine({
        isCorrect: false,
        errorType: 'UNCLASSIFIED',
        confidence: 0.0,
      });
      mockMastery = buildMockMastery();
      mockSqs = buildMockSqs();
      mockPrisma = buildMockPrisma({
        isCorrect: false,
        errorType: ErrorType.UNCLASSIFIED,
        classifierSource: 'LLM',
      });
      service = new AttemptsService(
        mockPrisma,
        mockRuleEngine,
        mockMastery,
        mockSqs,
        buildMockOcr(),
      );
    });

    it('publishes to LLM SQS queue when UNCLASSIFIED', async () => {
      await service.create(makeDto({ studentAnswer: 99 }), 'trace-2');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockSqs.publishStandard).toHaveBeenCalled();
    });

    it('classifierSource is LLM for UNCLASSIFIED', async () => {
      const result = await service.create(
        makeDto({ studentAnswer: 99 }),
        'trace-2',
      );
      expect(result.classifierSource).toBe('LLM');
    });
  });

  describe('classified errors (non-UNCLASSIFIED)', () => {
    beforeEach(() => {
      mockRuleEngine = buildMockRuleEngine({
        isCorrect: false,
        errorType: 'BORROW_OMITTED_TENS',
        confidence: 0.93,
      });
      mockMastery = buildMockMastery();
      mockSqs = buildMockSqs();
      mockPrisma = buildMockPrisma({ isCorrect: false });
      service = new AttemptsService(
        mockPrisma,
        mockRuleEngine,
        mockMastery,
        mockSqs,
        buildMockOcr(),
      );
    });

    it('classifierSource is RULE_ENGINE for classified errors', async () => {
      const result = await service.create(
        makeDto({ studentAnswer: 33 }),
        'trace-3',
      );
      expect(result.classifierSource).toBe('RULE_ENGINE');
    });

    it('does NOT route to LLM queue for classified errors', async () => {
      await service.create(makeDto({ studentAnswer: 33 }), 'trace-3');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockSqs.publishStandard).not.toHaveBeenCalled();
    });
  });

  describe('extractOcr', () => {
    beforeEach(() => {
      service = new AttemptsService(
        buildMockPrisma(),
        buildMockRuleEngine({
          isCorrect: true,
          errorType: 'CORRECT',
          confidence: 1.0,
        }),
        buildMockMastery(),
        buildMockSqs(),
        buildMockOcr(),
      );
    });

    it('returns OCR extraction result', async () => {
      const result = await service.extractOcr(Buffer.from('fake-image'));
      expect(result.confidence).toBe(0.95);
      expect(result.finalAnswer).toBe('27');
      expect(result.topicHint).toBe('subtraction_borrow');
      expect(Array.isArray(result.rawSteps)).toBe(true);
    });
  });
});
