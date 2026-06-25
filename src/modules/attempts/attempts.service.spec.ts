import { AttemptsService } from '@modules/attempts/attempts.service';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { S3Adapter } from '@adapters/s3.adapter';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { MasteryService } from '@modules/mastery/mastery.service';
import { RuleEngineService } from '@modules/attempts/rule-engine/engine.service';
import { MathOCROrchestrator } from '@adapters/math-ocr/math-ocr.orchestrator';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import { SolveAdhocDto } from '@modules/attempts/dto/solve-adhoc.dto';
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

function buildMockS3() {
  return {
    createPresignedGetUrl: jest
      .fn()
      .mockResolvedValue('https://s3.example.com/presigned'),
  } as unknown as S3Adapter;
}

function buildMockOcr() {
  return {
    extract: jest.fn().mockResolvedValue({
      confidence: 0.91,
      exercises: [
        {
          problem: '3+4',
          rawSteps: [{ expression: '3+4', isFinal: true }],
          finalAnswer: '7',
          topicHint: 'T-ADD-CARRY',
          confidence: 0.91,
        },
      ],
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
      buildMockS3(),
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
      buildMockS3(),
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
      buildMockS3(),
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
      buildMockS3(),
    );

    const result = await service.extractOcr(Buffer.from('test-image'));

    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0].topicHint).toBe('T-ADD-CARRY');
    expect(result.exercises[0].confidence).toBe(0.91);
    expect(result.exercises[0].rawSteps).toHaveLength(1);
  });

  describe('getStatus', () => {
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
        buildMockS3(),
      );
    }

    it('returns the live classification with the resolved error tag', async () => {
      const prisma = buildMockPrisma();
      (prisma.attempt.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'attempt-uuid-1',
        status: 'CLASSIFIED',
        isCorrect: false,
        classifierSource: 'LLM',
        confidence: 0.88,
        errorTag: { code: 'BORROW_OMITTED_TENS', name: 'Omitió el préstamo' },
      });

      const result = await buildService(prisma).getStatus('attempt-uuid-1');

      expect(result).toEqual({
        attemptId: 'attempt-uuid-1',
        status: 'CLASSIFIED',
        isCorrect: false,
        errorTagCode: 'BORROW_OMITTED_TENS',
        errorTagName: 'Omitió el préstamo',
        classifierSource: 'LLM',
        confidence: 0.88,
      });
    });

    it('returns nulls while still PENDING (no error tag yet)', async () => {
      const prisma = buildMockPrisma();
      (prisma.attempt.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'attempt-uuid-1',
        status: 'PENDING',
        isCorrect: false,
        classifierSource: 'LLM',
        confidence: null,
        errorTag: null,
      });

      const result = await buildService(prisma).getStatus('attempt-uuid-1');

      expect(result.status).toBe('PENDING');
      expect(result.errorTagCode).toBeNull();
      expect(result.errorTagName).toBeNull();
      expect(result.confidence).toBeNull();
    });

    it('throws when the attempt does not exist', async () => {
      const prisma = buildMockPrisma();
      (prisma.attempt.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(buildService(prisma).getStatus('missing')).rejects.toThrow(
        'Attempt missing not found',
      );
    });
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
        buildMockS3(),
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

  describe('getDetail', () => {
    const ATTEMPT_FULL = {
      id: 'att-detail-1',
      status: 'CLASSIFIED',
      isCorrect: false,
      classifierSource: 'LLM',
      confidence: 0.91,
      errorTag: { code: 'BORROW_OMIT', name: 'Omitió préstamo' },
      steps: [
        { stepIndex: 0, contentLatex: '5-3=2', isCorrect: true },
        { stepIndex: 1, contentLatex: '10-7=2', isCorrect: false },
      ],
      guideSubmission: null,
    };

    function buildDetailService(prisma: PrismaService, s3 = buildMockS3()) {
      return new AttemptsService(
        prisma,
        buildMockRuleEngine({
          isCorrect: false,
          errorType: 'BORROW_OMIT',
          confidence: 0.91,
        }),
        buildMockMastery(),
        buildMockSqs(),
        buildMockOcr(),
        s3,
      );
    }

    it('returns steps and null submission when no guideSubmission linked', async () => {
      const prisma = buildMockPrisma();
      (prisma.attempt.findUnique as jest.Mock).mockResolvedValueOnce(
        ATTEMPT_FULL,
      );

      const result = await buildDetailService(prisma).getDetail('att-detail-1');

      expect(result.attemptId).toBe('att-detail-1');
      expect(result.status).toBe('CLASSIFIED');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0]?.contentLatex).toBe('5-3=2');
      expect(result.submission).toBeNull();
    });

    it('returns presigned photo URLs when guideSubmission is linked', async () => {
      process.env['S3_SUBMISSIONS_BUCKET'] = 'test-bucket';
      const prisma = buildMockPrisma();
      const s3 = buildMockS3();
      (prisma.attempt.findUnique as jest.Mock).mockResolvedValueOnce({
        ...ATTEMPT_FULL,
        guideSubmission: {
          photoKeys: ['key1.jpg', 'key2.jpg'],
          transcriptionLatex: '5-3=2',
          transcriptionJson: null,
          transcriptionConfidence: 0.95,
        },
      });

      const result = await buildDetailService(prisma, s3).getDetail(
        'att-detail-1',
      );

      expect(result.submission).not.toBeNull();
      expect(result.submission?.photoUrls).toHaveLength(2);
      expect(s3.createPresignedGetUrl).toHaveBeenCalledTimes(2);
      delete process.env['S3_SUBMISSIONS_BUCKET'];
    });

    it('throws NotFoundException when attempt does not exist', async () => {
      const prisma = buildMockPrisma();
      (prisma.attempt.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        buildDetailService(prisma).getDetail('missing'),
      ).rejects.toThrow('Attempt missing not found');
    });

    it('includes errorTag code and name in response', async () => {
      const prisma = buildMockPrisma();
      (prisma.attempt.findUnique as jest.Mock).mockResolvedValueOnce(
        ATTEMPT_FULL,
      );

      const result = await buildDetailService(prisma).getDetail('att-detail-1');

      expect(result.errorTagCode).toBe('BORROW_OMIT');
      expect(result.errorTagName).toBe('Omitió préstamo');
    });

    it('returns null photoUrls (empty array) when S3_SUBMISSIONS_BUCKET not set', async () => {
      delete process.env['S3_SUBMISSIONS_BUCKET'];
      const prisma = buildMockPrisma();
      (prisma.attempt.findUnique as jest.Mock).mockResolvedValueOnce({
        ...ATTEMPT_FULL,
        guideSubmission: {
          photoKeys: ['key.jpg'],
          transcriptionLatex: null,
          transcriptionJson: null,
          transcriptionConfidence: null,
        },
      });

      const result = await buildDetailService(prisma).getDetail('att-detail-1');

      expect(result.submission?.photoUrls).toHaveLength(0);
    });
  });

  describe('solveAdhoc (A10)', () => {
    const ADHOC_DTO: SolveAdhocDto = {
      studentId: 'stu-1',
      problemLatex: '2x + 3 = 7',
      studentSteps: ['2x = 4'],
      studentFinalAnswer: 'x = 3',
      courseId: 'course-1',
      gradeLevel: 7,
    };

    function buildService(prisma: PrismaService, sqs = buildMockSqs()) {
      return new AttemptsService(
        prisma,
        buildMockRuleEngine({
          isCorrect: false,
          errorType: 'UNCLASSIFIED',
          confidence: 0,
        }),
        buildMockMastery(),
        sqs,
        buildMockOcr(),
        buildMockS3(),
      );
    }

    it('creates a PENDING attempt with inputMode SCAN_ADHOC', async () => {
      const prisma = buildMockPrisma();
      (prisma.attempt.create as jest.Mock).mockResolvedValueOnce({
        id: 'adhoc-att-1',
      });

      const result = await buildService(prisma).solveAdhoc(
        ADHOC_DTO,
        'trace-adhoc',
      );

      expect(result.attemptId).toBe('adhoc-att-1');
      expect(prisma.attempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 'stu-1',
            inputMode: 'SCAN_ADHOC',
            status: 'PENDING',
            classifierSource: 'LLM',
          }),
        }),
      );
    });

    it('publishes to SQS_ADHOC_SOLVE_URL with the correct payload', async () => {
      process.env['SQS_ADHOC_SOLVE_URL'] = 'https://sqs.example.com/adhoc';
      const prisma = buildMockPrisma();
      (prisma.attempt.create as jest.Mock).mockResolvedValueOnce({
        id: 'adhoc-att-2',
      });
      const sqs = buildMockSqs();

      await buildService(prisma, sqs).solveAdhoc(ADHOC_DTO, 'trace-adhoc-2');

      expect(sqs.publishStandard).toHaveBeenCalledWith(
        expect.objectContaining({
          queueUrl: 'https://sqs.example.com/adhoc',
          messageBody: expect.objectContaining({
            attempt_id: 'adhoc-att-2',
            problem_latex: '2x + 3 = 7',
            student_final_answer: 'x = 3',
            student_id: 'stu-1',
            grade_level: 7,
          }),
        }),
      );
      delete process.env['SQS_ADHOC_SOLVE_URL'];
    });

    it('defaults grade_level to 7 when not provided', async () => {
      const prisma = buildMockPrisma();
      (prisma.attempt.create as jest.Mock).mockResolvedValueOnce({
        id: 'adhoc-att-3',
      });
      const sqs = buildMockSqs();
      const dto: SolveAdhocDto = { ...ADHOC_DTO, gradeLevel: undefined };

      await buildService(prisma, sqs).solveAdhoc(dto, 'trace-3');

      expect(sqs.publishStandard).toHaveBeenCalledWith(
        expect.objectContaining({
          messageBody: expect.objectContaining({ grade_level: 7 }),
        }),
      );
    });

    it('does not call rule engine or mastery for ad-hoc attempts', async () => {
      const prisma = buildMockPrisma();
      (prisma.attempt.create as jest.Mock).mockResolvedValueOnce({
        id: 'adhoc-att-4',
      });
      const mastery = buildMockMastery();
      const sqs = buildMockSqs();
      const service = new AttemptsService(
        prisma,
        buildMockRuleEngine({
          isCorrect: false,
          errorType: 'UNCLASSIFIED',
          confidence: 0,
        }),
        mastery,
        sqs,
        buildMockOcr(),
        buildMockS3(),
      );

      await service.solveAdhoc(ADHOC_DTO, 'trace-4');

      expect(mastery.applyAttempt).not.toHaveBeenCalled();
    });
  });
});
