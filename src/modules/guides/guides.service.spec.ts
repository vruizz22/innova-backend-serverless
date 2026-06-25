import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { S3Adapter } from '@adapters/s3.adapter';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { GuidesService } from '@modules/guides/guides.service';
import { InvalidGuideTransitionError } from '@modules/guides/guide-state-machine';

const TEACHER = { id: 'teacher-1', userId: 'user-1' };

type PrismaMock = ReturnType<typeof buildPrisma>;

function buildPrisma() {
  const prisma = {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    teacher: { findFirst: jest.fn().mockResolvedValue(TEACHER) },
    courseTeacher: {
      findFirst: jest.fn().mockResolvedValue({ id: 'ct-1' }),
      findMany: jest.fn().mockResolvedValue([{ courseId: 'course-1' }]),
    },
    course: { findUnique: jest.fn().mockResolvedValue({ gradeLevel: 4 }) },
    guide: {
      create: jest.fn().mockResolvedValue({ id: 'guide-1' }),
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'guide-1', courseId: 'course-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'guide-1' }),
      count: jest.fn().mockResolvedValue(0),
    },
    guideQuestion: {
      findFirst: jest.fn().mockResolvedValue({ id: 'q1' }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'q1' }),
    },
    guideSolution: {
      findFirst: jest.fn().mockResolvedValue({ version: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'sol-1', version: 2 }),
    },
    guideSubmission: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'sub-1' }),
    },
    topic: { findUnique: jest.fn() },
    errorTag: { findUnique: jest.fn() },
    student: { findMany: jest.fn().mockResolvedValue([]) },
    assignment: { create: jest.fn().mockResolvedValue({ id: 'assign-1' }) },
    exercise: { create: jest.fn().mockResolvedValue({ id: 'ex-1' }) },
    assignmentExercise: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
  return prisma;
}

function makeService(prisma: PrismaMock) {
  const s3 = {
    createPresignedPutUrl: jest.fn().mockResolvedValue('https://put-url'),
    createPresignedGetUrl: jest.fn().mockResolvedValue('https://get-url'),
    objectExists: jest.fn().mockResolvedValue(true),
  };
  const sqs = { publishStandard: jest.fn().mockResolvedValue(undefined) };
  const service = new GuidesService(
    prisma as unknown as PrismaService,
    s3 as unknown as S3Adapter,
    sqs as unknown as SqsAdapter,
  );
  return { service, s3, sqs };
}

const VALID_SOLUTION = {
  final_answer: '42',
  points: 1,
  steps: [{ idx: 0, latex: 'x = 42', checkpoint: true }],
};

/** Typed accessors for the first call args of a jest mock (avoid `any` access). */
function callData(fn: jest.Mock): Record<string, unknown> {
  const calls = fn.mock.calls as Array<[{ data: Record<string, unknown> }]>;
  return calls[0][0].data;
}
function callWhere(fn: jest.Mock): Record<string, unknown> {
  const calls = fn.mock.calls as Array<[{ where: Record<string, unknown> }]>;
  return calls[0][0].where;
}

describe('GuidesService', () => {
  const ORIGINAL_ENV = process.env;

  beforeAll(() => {
    process.env = {
      ...ORIGINAL_ENV,
      S3_GUIDES_BUCKET: 'guides-bucket',
      S3_SUBMISSIONS_BUCKET: 'subs-bucket',
      SQS_GUIDE_INGEST_URL: 'http://sqs/ingest',
      SQS_SOLUTION_GEN_URL: 'http://sqs/solgen',
      GUIDES_PRESIGNED_PUT_TTL: '600',
      SUBMISSIONS_PRESIGNED_GET_TTL: '300',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // ---------------------------------------------------------------- create
  describe('create', () => {
    it('creates a guide and returns a presigned PUT url', async () => {
      const prisma = buildPrisma();
      const { service, s3 } = makeService(prisma);

      const result = await service.create('user-1', {
        courseId: 'course-1',
        title: 'Fracciones',
      });

      expect(prisma.guide.create).toHaveBeenCalled();
      expect(s3.createPresignedPutUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: 'guides-bucket',
          contentType: 'application/pdf',
        }),
      );
      expect(result.guideId).toBe('guide-1');
      expect(result.presignedPutUrl).toBe('https://put-url');
      expect(result.sourcePdfKey).toMatch(/^guides\/uploads\/.*\.pdf$/);
    });

    it('throws Forbidden when the teacher does not teach the course', async () => {
      const prisma = buildPrisma();
      prisma.courseTeacher.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(
        service.create('user-1', { courseId: 'course-x', title: 'T' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound when the user has no teacher profile', async () => {
      const prisma = buildPrisma();
      prisma.teacher.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(
        service.create('user-1', { courseId: 'course-1', title: 'T' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------- ingest
  describe('ingest', () => {
    it('transitions UPLOADED → EXTRACTING and enqueues ingest', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue({
        id: 'guide-1',
        courseId: 'course-1',
        status: 'UPLOADED',
        sourcePdfKey: 'guides/uploads/a.pdf',
        traceId: 'trace-1',
      });
      const { service, sqs } = makeService(prisma);

      const result = await service.ingest('user-1', 'guide-1');

      expect(result).toEqual({ status: 'EXTRACTING' });
      expect(prisma.guide.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'EXTRACTING', failureReason: null },
        }),
      );
      expect(sqs.publishStandard).toHaveBeenCalledWith(
        expect.objectContaining({ queueUrl: 'http://sqs/ingest' }),
      );
    });

    it('is idempotent — no-op while already EXTRACTING', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue({
        id: 'guide-1',
        courseId: 'course-1',
        status: 'EXTRACTING',
        sourcePdfKey: 'k',
        traceId: 't',
      });
      const { service, sqs } = makeService(prisma);

      const result = await service.ingest('user-1', 'guide-1');

      expect(result).toEqual({ status: 'EXTRACTING' });
      expect(prisma.guide.update).not.toHaveBeenCalled();
      expect(sqs.publishStandard).not.toHaveBeenCalled();
    });

    it('rejects ingest from a non-ingestable status', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue({
        id: 'guide-1',
        courseId: 'course-1',
        status: 'REVIEW',
        sourcePdfKey: 'k',
        traceId: 't',
      });
      const { service } = makeService(prisma);

      await expect(service.ingest('user-1', 'guide-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFound when the guide does not exist', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(service.ingest('user-1', 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws Forbidden when the teacher does not own the guide course', async () => {
      const prisma = buildPrisma();
      prisma.courseTeacher.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(service.ingest('user-1', 'guide-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // ---------------------------------------------------------------- list
  describe('list', () => {
    it('returns paginated guides scoped to the teacher courses', async () => {
      const prisma = buildPrisma();
      prisma.guide.findMany.mockResolvedValue([{ id: 'guide-1' }]);
      prisma.guide.count.mockResolvedValue(1);
      const { service } = makeService(prisma);

      const result = await service.list('user-1', {});

      expect(result).toEqual({
        items: [{ id: 'guide-1' }],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('clamps page/pageSize and applies a status filter', async () => {
      const prisma = buildPrisma();
      const { service } = makeService(prisma);

      const result = await service.list('user-1', {
        status: 'PUBLISHED',
        page: 0,
        pageSize: 999,
      });

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(100);
      const where = callWhere(prisma.guide.findMany);
      expect(where.status).toBe('PUBLISHED');
    });

    it('throws Forbidden when filtering by a non-owned course', async () => {
      const prisma = buildPrisma();
      const { service } = makeService(prisma);

      await expect(
        service.list('user-1', { courseId: 'course-x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ---------------------------------------------------------------- getDetail
  describe('getDetail', () => {
    it('loads the guide with questions and current solutions', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique
        .mockResolvedValueOnce({ id: 'guide-1', courseId: 'course-1' }) // loadOwnedGuide
        .mockResolvedValueOnce({ id: 'guide-1', questions: [] }); // detail
      const { service } = makeService(prisma);

      const result = await service.getDetail('user-1', 'guide-1');

      expect(result).toEqual({ id: 'guide-1', questions: [] });
    });
  });

  // ---------------------------------------------------------------- updateGuide
  describe('updateGuide', () => {
    it('updates only the provided fields', async () => {
      const prisma = buildPrisma();
      const { service } = makeService(prisma);

      await service.updateGuide('user-1', 'guide-1', {
        title: 'New',
        dueAt: '2030-01-01T00:00:00.000Z',
        maxResubmissions: 2,
        showSolutionAfterGrade: true,
      });

      const data = callData(prisma.guide.update);
      expect(data.title).toBe('New');
      expect(data.dueAt).toBeInstanceOf(Date);
      expect(data.maxResubmissions).toBe(2);
      expect(data.showSolutionAfterGrade).toBe(true);
    });
  });

  // ---------------------------------------------------------------- updateQuestion
  describe('updateQuestion', () => {
    it('throws NotFound when the question is not in the guide', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(
        service.updateQuestion('user-1', 'guide-1', 'qX', { label: 'a' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propagates domain/subdomain when a topic is confirmed', async () => {
      const prisma = buildPrisma();
      prisma.topic.findUnique.mockResolvedValue({
        id: 'topic-1',
        domainId: 'dom-1',
        subdomainId: 'sub-1',
      });
      const { service } = makeService(prisma);

      await service.updateQuestion('user-1', 'guide-1', 'q1', {
        topicId: 'topic-1',
        status: 'APPROVED',
      });

      const data = callData(prisma.guideQuestion.update);
      expect(data.topicSource).toBe('TEACHER');
      expect(data.topicConfidence).toBe(1.0);
      expect(data.domainId).toBe('dom-1');
    });

    it('throws NotFound when the confirmed topic does not exist', async () => {
      const prisma = buildPrisma();
      prisma.topic.findUnique.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(
        service.updateQuestion('user-1', 'guide-1', 'q1', { topicId: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------- updateSolution
  describe('updateSolution', () => {
    it('creates a new TEACHER_EDITED version and demotes the previous', async () => {
      const prisma = buildPrisma();
      const { service } = makeService(prisma);

      await service.updateSolution('user-1', 'guide-1', 'q1', {
        stepsJson: VALID_SOLUTION,
        finalAnswer: '42',
      });

      expect(prisma.guideSolution.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isCurrent: false },
        }),
      );
      const created = callData(prisma.guideSolution.create);
      expect(created.version).toBe(2);
      expect(created.source).toBe('TEACHER_EDITED');
      expect(created.isCurrent).toBe(true);
    });

    it('rejects an invalid canonical solution', async () => {
      const prisma = buildPrisma();
      const { service } = makeService(prisma);

      await expect(
        service.updateSolution('user-1', 'guide-1', 'q1', {
          stepsJson: { bogus: true },
          finalAnswer: '42',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a solution without a checkpoint', async () => {
      const prisma = buildPrisma();
      const { service } = makeService(prisma);

      await expect(
        service.updateSolution('user-1', 'guide-1', 'q1', {
          stepsJson: {
            final_answer: '42',
            points: 1,
            steps: [{ idx: 0, latex: 'x', checkpoint: false }],
          },
          finalAnswer: '42',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound when the question is missing', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(
        service.updateSolution('user-1', 'guide-1', 'qX', {
          stepsJson: VALID_SOLUTION,
          finalAnswer: '42',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------- regenerateSolution
  describe('regenerateSolution', () => {
    it('enqueues a solution-generation message', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue({
        id: 'guide-1',
        courseId: 'course-1',
        traceId: 'trace-1',
      });
      const { service, sqs } = makeService(prisma);

      const result = await service.regenerateSolution(
        'user-1',
        'guide-1',
        'q1',
      );

      expect(result).toEqual({ enqueued: true });
      expect(sqs.publishStandard).toHaveBeenCalledWith(
        expect.objectContaining({ queueUrl: 'http://sqs/solgen' }),
      );
    });

    it('throws NotFound when the question is missing', async () => {
      const prisma = buildPrisma();
      prisma.guideQuestion.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(
        service.regenerateSolution('user-1', 'guide-1', 'qX'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------- publish
  describe('publish', () => {
    function reviewGuide(over: Record<string, unknown> = {}) {
      return {
        id: 'guide-1',
        courseId: 'course-1',
        status: 'REVIEW',
        title: 'Guide',
        dueAt: null,
        course: {
          enrollments: [{ studentId: 'stu-1' }, { studentId: 'stu-2' }],
        },
        questions: [
          {
            id: 'q1',
            status: 'APPROVED',
            topicId: 'topic-1',
            statementLatex: 'x',
            figureKeys: [],
            solutions: [{ finalAnswer: '42' }],
          },
          {
            id: 'q2',
            status: 'APPROVED',
            topicId: null,
            statementLatex: 'y',
            figureKeys: [],
            solutions: [],
          },
          { id: 'q3', status: 'EXCLUDED', topicId: null },
        ],
        ...over,
      };
    }

    it('materializes exercises + assignment and flips to PUBLISHED', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue(reviewGuide());
      prisma.guide.update.mockResolvedValue({
        id: 'guide-1',
        status: 'PUBLISHED',
      });
      const { service } = makeService(prisma);

      const result = await service.publish('user-1', 'guide-1');

      expect(prisma.assignment.create).toHaveBeenCalled();
      expect(prisma.exercise.create).toHaveBeenCalledTimes(1); // q1 only (q2 has no topic)
      expect(result).toMatchObject({
        assignmentId: 'assign-1',
        materializedExercises: 1,
        approvedWithoutTopic: 1,
        studentsAssigned: 2,
      });
    });

    it('rejects publishing when questions are still pending', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue(
        reviewGuide({
          questions: [{ id: 'q1', status: 'PENDING', topicId: null }],
        }),
      );
      const { service } = makeService(prisma);

      await expect(service.publish('user-1', 'guide-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects publishing with zero approved questions', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue(
        reviewGuide({
          questions: [{ id: 'q3', status: 'EXCLUDED', topicId: null }],
        }),
      );
      const { service } = makeService(prisma);

      await expect(service.publish('user-1', 'guide-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an invalid status transition', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue(
        reviewGuide({ status: 'UPLOADED' }),
      );
      const { service } = makeService(prisma);

      await expect(service.publish('user-1', 'guide-1')).rejects.toBeInstanceOf(
        InvalidGuideTransitionError,
      );
    });

    it('throws NotFound when the guide is missing on re-read', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique
        .mockResolvedValueOnce({ id: 'guide-1', courseId: 'course-1' }) // loadOwnedGuide
        .mockResolvedValueOnce(null); // publish re-read
      const { service } = makeService(prisma);

      await expect(service.publish('user-1', 'guide-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------- archive
  describe('archive', () => {
    it('archives a guide in a valid state', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue({
        id: 'guide-1',
        courseId: 'course-1',
        status: 'PUBLISHED',
      });
      prisma.guide.update.mockResolvedValue({
        id: 'guide-1',
        status: 'ARCHIVED',
      });
      const { service } = makeService(prisma);

      const result = await service.archive('user-1', 'guide-1');
      expect(result).toMatchObject({ status: 'ARCHIVED' });
    });

    it('rejects archiving from a terminal state', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue({
        id: 'guide-1',
        courseId: 'course-1',
        status: 'ARCHIVED',
      });
      const { service } = makeService(prisma);

      await expect(service.archive('user-1', 'guide-1')).rejects.toBeInstanceOf(
        InvalidGuideTransitionError,
      );
    });
  });

  // ---------------------------------------------------------------- getResultsMatrix
  describe('getResultsMatrix', () => {
    it('keeps the latest attempt per cell and ranks common errors', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue({
        id: 'guide-1',
        courseId: 'course-1',
        dueAt: new Date('2020-01-01T00:00:00.000Z'),
      });
      prisma.student.findMany.mockResolvedValue([
        { id: 'stu-1', displayName: 'Ana' },
      ]);
      prisma.guideQuestion.findMany.mockResolvedValue([
        { id: 'q1', sequence: 0, label: '1', points: 1 },
      ]);
      prisma.guideSubmission.findMany.mockResolvedValue([
        {
          id: 'sub-2',
          guideQuestionId: 'q1',
          studentId: 'stu-1',
          status: 'GRADED',
          score: 0,
          isCorrect: false,
          attemptNumber: 2,
          createdAt: new Date('2020-01-02T00:00:00.000Z'),
          overrideErrorTagId: null,
          overrideErrorTag: null,
          attempt: { errorTag: { code: 'E1', name: 'Error uno' } },
        },
        {
          id: 'sub-1',
          guideQuestionId: 'q1',
          studentId: 'stu-1',
          status: 'GRADED',
          score: 1,
          isCorrect: true,
          attemptNumber: 1,
          createdAt: new Date('2019-12-31T00:00:00.000Z'),
          overrideErrorTagId: null,
          overrideErrorTag: null,
          attempt: null,
        },
      ]);
      const { service } = makeService(prisma);

      const result = await service.getResultsMatrix('user-1', 'guide-1');

      expect(result.cells).toHaveLength(1); // only the latest attempt (sub-2)
      expect(result.cells[0]).toMatchObject({
        submissionId: 'sub-2',
        errorTagCode: 'E1',
        isLate: true,
      });
      expect(result.commonErrors[0].tags).toEqual([
        { code: 'E1', name: 'Error uno', count: 1 },
      ]);
    });

    it('prefers the teacher override tag over the attempt tag', async () => {
      const prisma = buildPrisma();
      prisma.guide.findUnique.mockResolvedValue({
        id: 'guide-1',
        courseId: 'course-1',
        dueAt: null,
      });
      prisma.student.findMany.mockResolvedValue([
        { id: 'stu-1', displayName: 'Ana' },
      ]);
      prisma.guideQuestion.findMany.mockResolvedValue([
        { id: 'q1', sequence: 0, label: '1', points: 1 },
      ]);
      prisma.guideSubmission.findMany.mockResolvedValue([
        {
          id: 'sub-2',
          guideQuestionId: 'q1',
          studentId: 'stu-1',
          status: 'GRADED',
          score: 0,
          isCorrect: false,
          attemptNumber: 1,
          createdAt: new Date('2020-01-02T00:00:00.000Z'),
          overrideErrorTagId: 'tag-override',
          overrideErrorTag: { code: 'OVERRIDE', name: 'Mano' },
          attempt: { errorTag: { code: 'E1', name: 'Auto' } },
        },
      ]);
      const { service } = makeService(prisma);

      const result = await service.getResultsMatrix('user-1', 'guide-1');

      expect(result.cells[0]).toMatchObject({
        errorTagCode: 'OVERRIDE',
        isOverridden: true,
        isLate: false,
      });
    });
  });

  // ---------------------------------------------------------- overrideSubmissionErrorTag
  describe('overrideSubmissionErrorTag', () => {
    it('throws NotFound when the submission is not in the guide', async () => {
      const prisma = buildPrisma();
      prisma.guideSubmission.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(
        service.overrideSubmissionErrorTag('user-1', 'guide-1', 'subX', 'E1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets an override when a valid error tag code is given', async () => {
      const prisma = buildPrisma();
      prisma.guideSubmission.findFirst.mockResolvedValue({ id: 'sub-1' });
      prisma.errorTag.findUnique.mockResolvedValue({ id: 'tag-1' });
      prisma.guideSubmission.update.mockResolvedValue({
        id: 'sub-1',
        overrideErrorTagId: 'tag-1',
        overrideErrorTag: { code: 'E1', name: 'Error uno' },
      });
      const { service } = makeService(prisma);

      const result = await service.overrideSubmissionErrorTag(
        'user-1',
        'guide-1',
        'sub-1',
        'E1',
      );

      expect(result).toMatchObject({
        errorTagCode: 'E1',
        isOverridden: true,
      });
    });

    it('clears the override when the code is null', async () => {
      const prisma = buildPrisma();
      prisma.guideSubmission.findFirst.mockResolvedValue({ id: 'sub-1' });
      prisma.guideSubmission.update.mockResolvedValue({
        id: 'sub-1',
        overrideErrorTagId: null,
        overrideErrorTag: null,
      });
      const { service } = makeService(prisma);

      const result = await service.overrideSubmissionErrorTag(
        'user-1',
        'guide-1',
        'sub-1',
        null,
      );

      expect(prisma.errorTag.findUnique).not.toHaveBeenCalled();
      expect(result.isOverridden).toBe(false);
    });

    it('throws NotFound when the error tag code is unknown', async () => {
      const prisma = buildPrisma();
      prisma.guideSubmission.findFirst.mockResolvedValue({ id: 'sub-1' });
      prisma.errorTag.findUnique.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(
        service.overrideSubmissionErrorTag(
          'user-1',
          'guide-1',
          'sub-1',
          'NOPE',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------- getSubmissionDetail
  describe('getSubmissionDetail', () => {
    it('returns presigned photo urls and the effective error tag', async () => {
      const prisma = buildPrisma();
      prisma.guideSubmission.findFirst.mockResolvedValue({
        id: 'sub-1',
        photoKeys: ['k1', 'k2'],
        status: 'GRADED',
        score: 0,
        isCorrect: false,
        attemptNumber: 1,
        transcriptionLatex: 'x',
        transcriptionConfidence: 0.9,
        alignmentJson: {},
        failureReason: null,
        overrideErrorTagId: null,
        overrideErrorTag: null,
        attempt: { errorTag: { code: 'E1', name: 'Error uno' } },
        question: { sequence: 0, label: '1', statementLatex: 's' },
      });
      const { service, s3 } = makeService(prisma);

      const result = await service.getSubmissionDetail(
        'user-1',
        'guide-1',
        'sub-1',
      );

      expect(s3.createPresignedGetUrl).toHaveBeenCalledTimes(2);
      expect(result.photoUrls).toEqual(['https://get-url', 'https://get-url']);
      expect(result.errorTagCode).toBe('E1');
    });

    it('throws NotFound when the submission is missing', async () => {
      const prisma = buildPrisma();
      prisma.guideSubmission.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);

      await expect(
        service.getSubmissionDetail('user-1', 'guide-1', 'subX'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
