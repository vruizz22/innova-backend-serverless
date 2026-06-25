import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { S3Adapter } from '@adapters/s3.adapter';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { GuideSubmissionsService } from '@modules/guide-submissions/guide-submissions.service';

const STUDENT = { id: 'student-1', userId: 'user-1' };
const PUBLISHED_GUIDE = {
  id: 'guide-1',
  courseId: 'course-1',
  status: 'PUBLISHED',
  title: 'Guide',
  dueAt: null,
  maxResubmissions: 1,
  showSolutionAfterGrade: true,
};

function buildPrisma() {
  const prisma = {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    student: { findFirst: jest.fn().mockResolvedValue(STUDENT) },
    enrollment: {
      findMany: jest.fn().mockResolvedValue([{ courseId: 'course-1' }]),
      findFirst: jest.fn().mockResolvedValue({ id: 'enr-1' }),
    },
    guide: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    guideQuestion: { findFirst: jest.fn(), findMany: jest.fn() },
    guideSolution: { findFirst: jest.fn().mockResolvedValue({ version: 3 }) },
    guideSubmission: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _max: { attemptNumber: 0 } }),
      create: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      update: jest.fn().mockResolvedValue({ id: 'sub-1' }),
    },
  };
  prisma.guide.findUnique = jest.fn().mockResolvedValue(PUBLISHED_GUIDE);
  return prisma;
}

type PrismaMock = ReturnType<typeof buildPrisma>;

const FAKE_IMAGE = Buffer.from('fake-image');

function makeOcrMock(exercises: object[] = []) {
  return {
    extract: jest.fn().mockResolvedValue({ exercises, confidence: 0.9 }),
  };
}

function makeService(prisma: PrismaMock, ocrExercises: object[] = []) {
  const s3 = {
    createPresignedPutUrl: jest.fn().mockResolvedValue('https://put-url'),
    createPresignedGetUrl: jest.fn().mockResolvedValue('https://get-url'),
    objectExists: jest.fn().mockResolvedValue(true),
    getObjectBytes: jest.fn().mockResolvedValue(FAKE_IMAGE),
  };
  const sqs = { publishStandard: jest.fn().mockResolvedValue(undefined) };
  const ocr = makeOcrMock(ocrExercises);
  const service = new GuideSubmissionsService(
    prisma as unknown as PrismaService,
    s3 as unknown as S3Adapter,
    sqs as unknown as SqsAdapter,
    ocr as unknown as import('@adapters/math-ocr/math-ocr.orchestrator').MathOCROrchestrator,
  );
  return { service, s3, sqs, ocr };
}

describe('GuideSubmissionsService', () => {
  const ORIGINAL_ENV = process.env;

  beforeAll(() => {
    process.env = {
      ...ORIGINAL_ENV,
      S3_SUBMISSIONS_BUCKET: 'subs-bucket',
      SQS_SUBMISSION_GRADE_URL: 'http://sqs/grade',
      GUIDES_PRESIGNED_PUT_TTL: '600',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // ---------------------------------------------------------------- listGuides
  describe('listGuides', () => {
    it('returns published guides with per-guide progress', async () => {
      const prisma = buildPrisma();
      prisma.guide.findMany.mockResolvedValue([
        {
          id: 'guide-1',
          title: 'G',
          description: 'd',
          dueAt: null,
          questions: [{ id: 'q1' }, { id: 'q2' }],
          submissions: [{ guideQuestionId: 'q1' }, { guideQuestionId: 'q1' }],
        },
      ]);
      const { service } = makeService(prisma);

      const result = await service.listGuides('user-1');

      expect(result).toEqual([
        {
          id: 'guide-1',
          title: 'G',
          description: 'd',
          dueAt: null,
          totalQuestions: 2,
          gradedQuestions: 1, // de-duped by Set
        },
      ]);
    });

    it('throws NotFound when there is no student profile', async () => {
      const prisma = buildPrisma();
      prisma.student.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(service.listGuides('user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------- getQuiz
  describe('getQuiz', () => {
    it('returns questions without solutions plus my submissions grouped', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findMany.mockResolvedValue([
        { id: 'q1', sequence: 0, label: '1', statementLatex: 's', points: 1 },
      ]);
      prisma.guideSubmission.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          guideQuestionId: 'q1',
          attemptNumber: 1,
          status: 'GRADED',
        },
      ]);
      const { service } = makeService(prisma);

      const result = await service.getQuiz('user-1', 'guide-1');

      expect(result.guide.id).toBe('guide-1');
      expect(result.questions[0].submissions).toHaveLength(1);
    });

    it('throws NotFound when the guide is not PUBLISHED', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue({
        ...PUBLISHED_GUIDE,
        status: 'REVIEW',
      });
      const { service } = makeService(prisma);

      await expect(service.getQuiz('user-1', 'guide-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws Forbidden when the student is not enrolled', async () => {
      const prisma = buildPrisma();
      prisma.enrollment.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(service.getQuiz('user-1', 'guide-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // ---------------------------------------------------------------- createSubmission
  describe('createSubmission', () => {
    it('creates a submission shell and presigned PUT urls', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findFirst.mockResolvedValue({ id: 'q1' });
      prisma.guideSubmission.count.mockResolvedValue(0);
      const { service, s3 } = makeService(prisma);

      const result = await service.createSubmission('user-1', 'guide-1', 'q1', {
        photoCount: 2,
      });

      expect(s3.createPresignedPutUrl).toHaveBeenCalledTimes(2);
      expect(result.attemptNumber).toBe(1);
      expect(result.presignedPutUrls).toHaveLength(2);
    });

    it('throws NotFound when the question is not part of the guide', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(
        service.createSubmission('user-1', 'guide-1', 'qX', { photoCount: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('enforces the re-submission cap', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findFirst.mockResolvedValue({ id: 'q1' });
      // maxResubmissions=1 → 1 original + 1 retry = 2 allowed; existing > max → reject
      prisma.guideSubmission.count.mockResolvedValue(2);
      const { service } = makeService(prisma);

      await expect(
        service.createSubmission('user-1', 'guide-1', 'q1', { photoCount: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ---------------------------------------------------------------- complete
  describe('complete', () => {
    it('verifies photos, stores the pauta version and enqueues grading', async () => {
      const prisma = buildPrisma();
      prisma.guideSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        studentId: 'student-1',
        status: 'UPLOADED',
        guideQuestionId: 'q1',
        photoKeys: ['k1'],
        traceId: 't',
      });
      const { service, sqs } = makeService(prisma);

      const result = await service.complete('user-1', 'sub-1');

      expect(result).toEqual({ status: 'UPLOADED' });
      expect(prisma.guideSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { solutionVersion: 3 } }),
      );
      expect(sqs.publishStandard).toHaveBeenCalledWith(
        expect.objectContaining({ queueUrl: 'http://sqs/grade' }),
      );
    });

    it('throws NotFound when the submission belongs to another student', async () => {
      const prisma = buildPrisma();
      prisma.guideSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        studentId: 'other',
        status: 'UPLOADED',
        photoKeys: [],
      });
      const { service } = makeService(prisma);

      await expect(service.complete('user-1', 'sub-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects completing a submission not in UPLOADED state', async () => {
      const prisma = buildPrisma();
      prisma.guideSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        studentId: 'student-1',
        status: 'GRADED',
        photoKeys: [],
      });
      const { service } = makeService(prisma);

      await expect(service.complete('user-1', 'sub-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects when not all photos are present in S3', async () => {
      const prisma = buildPrisma();
      prisma.guideSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        studentId: 'student-1',
        status: 'UPLOADED',
        guideQuestionId: 'q1',
        photoKeys: ['k1', 'k2'],
        traceId: 't',
      });
      const { service, s3 } = makeService(prisma);
      s3.objectExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await expect(service.complete('user-1', 'sub-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  // ---------------------------------------------------------------- getStatus
  describe('getStatus', () => {
    it('returns the submission status with the resolved error tag', async () => {
      const prisma = buildPrisma();
      prisma.guideSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        studentId: 'student-1',
        status: 'GRADED',
        score: 0,
        isCorrect: false,
        gradedAt: new Date('2020-01-01T00:00:00.000Z'),
        attempt: {
          errorTag: { code: 'E1', name: 'Error uno', diagnosticHint: 'hint' },
        },
        guide: { showSolutionAfterGrade: true },
      });
      const { service } = makeService(prisma);

      const result = await service.getStatus('user-1', 'sub-1');

      expect(result).toMatchObject({
        status: 'GRADED',
        errorTagCode: 'E1',
        diagnosticHint: 'hint',
      });
    });

    it('throws NotFound for a missing submission', async () => {
      const prisma = buildPrisma();
      prisma.guideSubmission.findUnique.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(service.getStatus('user-1', 'subX')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------- getResults
  describe('getResults', () => {
    it('exposes the solution only after grading when the teacher opted in', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue({
        ...PUBLISHED_GUIDE,
        showSolutionAfterGrade: true,
      });
      prisma.guideQuestion.findMany.mockResolvedValue([
        {
          id: 'q1',
          sequence: 0,
          label: '1',
          points: 1,
          submissions: [
            {
              status: 'GRADED',
              score: 1,
              isCorrect: true,
              attempt: { errorTag: { code: null, name: '' } },
            },
          ],
          solutions: [{ id: 'sol-1', finalAnswer: '42' }],
        },
        {
          id: 'q2',
          sequence: 1,
          label: '2',
          points: 1,
          submissions: [],
          solutions: [{ id: 'sol-2' }],
        },
      ]);
      const { service } = makeService(prisma);

      const result = await service.getResults('user-1', 'guide-1');

      expect(result.questions[0].solution).toMatchObject({ id: 'sol-1' });
      // q2 has no submission → not graded → solution hidden, status NOT_SUBMITTED
      expect(result.questions[1].solution).toBeNull();
      expect(result.questions[1].status).toBe('NOT_SUBMITTED');
    });

    it('hides the solution when the teacher disabled it', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue({
        ...PUBLISHED_GUIDE,
        showSolutionAfterGrade: false,
      });
      prisma.guideQuestion.findMany.mockResolvedValue([
        {
          id: 'q1',
          sequence: 0,
          label: '1',
          points: 1,
          submissions: [{ status: 'GRADED', score: 1, isCorrect: true }],
          solutions: [{ id: 'sol-1' }],
        },
      ]);
      const { service } = makeService(prisma);

      const result = await service.getResults('user-1', 'guide-1');
      expect(result.questions[0].solution).toBeNull();
    });
  });

  // --------------------------------------------------------- getScanPageUploadUrl
  describe('getScanPageUploadUrl', () => {
    it('returns a photoKey and presignedUrl for an enrolled student', async () => {
      const prisma = buildPrisma();
      const { service, s3 } = makeService(prisma);

      const result = await service.getScanPageUploadUrl('user-1', 'guide-1');

      expect(result.photoKey).toMatch(/^guide-scans\/guide-1\//);
      expect(result.photoKey).toMatch(/\.jpg$/);
      expect(result.presignedUrl).toBe('https://put-url');
      expect(s3.createPresignedPutUrl).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'image/jpeg', ttlSeconds: 600 }),
      );
    });

    it('throws NotFound when student is not enrolled', async () => {
      const prisma = buildPrisma();
      prisma.enrollment.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(
        service.getScanPageUploadUrl('user-1', 'guide-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ----------------------------------------------------------- processScanPage
  describe('processScanPage', () => {
    const TWO_EXERCISES = [
      {
        problem: 'ex-1',
        rawSteps: [],
        finalAnswer: '1',
        topicHint: null,
        confidence: 0.9,
      },
      {
        problem: 'ex-2',
        rawSteps: [],
        finalAnswer: '2',
        topicHint: null,
        confidence: 0.8,
      },
    ];
    const THREE_QUESTIONS = [
      { id: 'q1', sequence: 1 },
      { id: 'q2', sequence: 2 },
      { id: 'q3', sequence: 3 },
    ];

    it('creates one submission per detected exercise (positional alignment)', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findMany.mockResolvedValue(THREE_QUESTIONS);
      const { service, sqs } = makeService(prisma, TWO_EXERCISES);

      const result = await service.processScanPage(
        'user-1',
        'guide-1',
        'guide-scans/x.jpg',
      );

      // 2 exercises → 2 matched, q3 untouched
      expect(result.matched).toBe(2);
      expect(result.submissions).toHaveLength(2);
      expect(result.submissions[0]).toMatchObject({
        questionId: 'q1',
        sequence: 1,
        skipped: false,
      });
      expect(result.submissions[1]).toMatchObject({
        questionId: 'q2',
        sequence: 2,
        skipped: false,
      });
      expect(sqs.publishStandard).toHaveBeenCalledTimes(2);
    });

    it('returns matched=0 and empty submissions when OCR detects no exercises', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findMany.mockResolvedValue(THREE_QUESTIONS);
      const { service, sqs } = makeService(prisma, []); // 0 exercises

      const result = await service.processScanPage(
        'user-1',
        'guide-1',
        'guide-scans/x.jpg',
      );

      expect(result.matched).toBe(0);
      expect(result.submissions).toHaveLength(0);
      expect(sqs.publishStandard).not.toHaveBeenCalled();
    });

    it('skips questions where the resubmission limit is reached', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findMany.mockResolvedValue([
        { id: 'q1', sequence: 1 },
      ]);
      // existingCount > maxResubmissions (1)
      prisma.guideSubmission.count.mockResolvedValue(2);
      const { service, sqs } = makeService(prisma, TWO_EXERCISES);

      const result = await service.processScanPage(
        'user-1',
        'guide-1',
        'guide-scans/x.jpg',
      );

      expect(result.matched).toBe(0);
      expect(result.submissions[0]).toMatchObject({
        skipped: true,
        reason: 'limit_reached',
      });
      expect(sqs.publishStandard).not.toHaveBeenCalled();
    });

    it('throws BadRequest when the photo is not in S3', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findMany.mockResolvedValue(THREE_QUESTIONS);
      const { service, s3 } = makeService(prisma, TWO_EXERCISES);
      s3.objectExists.mockResolvedValue(false);

      await expect(
        service.processScanPage('user-1', 'guide-1', 'missing.jpg'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound when the guide has no approved questions', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findMany.mockResolvedValue([]);
      const { service } = makeService(prisma, TWO_EXERCISES);

      await expect(
        service.processScanPage('user-1', 'guide-1', 'guide-scans/x.jpg'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('enqueues each submission to SQS_SUBMISSION_GRADE_URL', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findMany.mockResolvedValue([
        { id: 'q1', sequence: 1 },
      ]);
      const { service, sqs } = makeService(prisma, [TWO_EXERCISES[0]]);

      await service.processScanPage('user-1', 'guide-1', 'guide-scans/x.jpg');

      expect(sqs.publishStandard).toHaveBeenCalledWith(
        expect.objectContaining({ queueUrl: 'http://sqs/grade' }),
      );
      const body = sqs.publishStandard.mock.calls[0][0].messageBody as {
        guide_question_id: string;
      };
      expect(body.guide_question_id).toBe('q1');
    });
  });
});
