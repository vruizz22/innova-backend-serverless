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
      findUnique: jest.fn().mockResolvedValue({ id: 'attempt-uuid-1' }),
    },
    attemptStep: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    attemptErrorReport: {
      create: jest.fn().mockResolvedValue({ id: 'report-1' }),
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
    expect(mastery.applyAttempt).toHaveBeenCalledWith(
      'student-1',
      'topic-1',
      true,
    );
    expect(sqs.publishFifo).toHaveBeenCalled();
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

    const dto = { ...BASE_DTO, studentAnswer: 99 } as CreateAttemptDto;
    const result = await service.create(dto, 'trace-2');

    expect(result.classifierSource).toBe('LLM');
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

    const dto = { ...BASE_DTO, studentAnswer: 33 } as CreateAttemptDto;
    const result = await service.create(dto, 'trace-3');

    expect(result.isCorrect).toBe(false);
    expect(result.errorTagCode).toBe('BORROW_OMITTED_TENS');
    expect(result.classifierSource).toBe('RULE');
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

  describe('reportError (v8 C4)', () => {
    function buildService(prisma: PrismaService): AttemptsService {
      return new AttemptsService(
        prisma,
        buildMockRuleEngine({
          isCorrect: true,
          errorType: 'CORRECT',
          confidence: 1,
        }),
        buildMockMastery(),
        buildMockSqs(),
        buildMockOcr(),
      );
    }

    it('records a field-reported error and returns an ack', async () => {
      const prisma = buildMockPrisma();
      const service = buildService(prisma);

      const ack = await service.reportError(
        'attempt-uuid-1',
        { errorTagCode: 'BORROW_OMITTED_TENS', comment: 'era otro error' },
        'user-1',
      );

      expect(ack).toEqual({ attemptId: 'attempt-uuid-1', reported: true });
      expect(prisma.attemptErrorReport.create).toHaveBeenCalledWith({
        data: {
          attemptId: 'attempt-uuid-1',
          errorTagId: 'tag-1',
          reportedById: 'user-1',
          comment: 'era otro error',
          source: 'FIELD_REPORTED',
        },
      });
    });

    it('throws when the attempt does not exist', async () => {
      const prisma = buildMockPrisma();
      (prisma.attempt.findUnique as jest.Mock).mockResolvedValueOnce(null);
      const service = buildService(prisma);

      await expect(
        service.reportError('missing', { errorTagCode: 'X' }, null),
      ).rejects.toThrow('Attempt missing not found');
    });

    it('throws when the error tag code is unknown', async () => {
      const prisma = buildMockPrisma();
      (prisma.errorTag.findUnique as jest.Mock).mockResolvedValueOnce(null);
      const service = buildService(prisma);

      await expect(
        service.reportError('attempt-uuid-1', { errorTagCode: 'NOPE' }, null),
      ).rejects.toThrow('Error tag NOPE not found');
    });
  });
});
