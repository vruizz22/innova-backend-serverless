import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { S3Adapter } from '@adapters/s3.adapter';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { SubmissionGradeMessage } from '@shared/sqs/guide-messages';
import { CreateSubmissionDto } from '@modules/guide-submissions/dto/create-submission.dto';

export interface CreateSubmissionResult {
  submissionId: string;
  presignedPutUrls: string[];
  attemptNumber: number;
}

@Injectable()
export class GuideSubmissionsService {
  private readonly logger = new Logger(GuideSubmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Adapter,
    private readonly sqs: SqsAdapter,
  ) {}

  /** PUBLISHED guides of the student's active courses + per-guide progress. */
  async listGuides(studentUserId: string) {
    await this.prisma.ensureConnected();
    const student = await this.resolveStudent(studentUserId);

    const courseIds = (
      await this.prisma.enrollment.findMany({
        where: { studentId: student.id, status: 'ACTIVE' },
        select: { courseId: true },
      })
    ).map((e) => e.courseId);

    const guides = await this.prisma.guide.findMany({
      where: { courseId: { in: courseIds }, status: 'PUBLISHED' },
      orderBy: [{ dueAt: 'asc' }, { publishedAt: 'desc' }],
      include: {
        questions: { where: { status: 'APPROVED' }, select: { id: true } },
        submissions: {
          where: { studentId: student.id, status: 'GRADED' },
          select: { guideQuestionId: true },
        },
      },
    });

    return guides.map((g) => {
      const gradedQuestionIds = new Set(
        g.submissions.map((s) => s.guideQuestionId),
      );
      return {
        id: g.id,
        title: g.title,
        description: g.description,
        dueAt: g.dueAt,
        totalQuestions: g.questions.length,
        gradedQuestions: gradedQuestionIds.size,
      };
    });
  }

  /** Quiz view — questions WITHOUT the solution, plus my submission states. */
  async getQuiz(studentUserId: string, guideId: string) {
    await this.prisma.ensureConnected();
    const student = await this.resolveStudent(studentUserId);
    const guide = await this.loadPublishedGuideForStudent(student.id, guideId);

    const questions = await this.prisma.guideQuestion.findMany({
      where: { guideId, status: 'APPROVED' },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        sequence: true,
        label: true,
        statementLatex: true,
        statementJson: true,
        figureKeys: true,
        points: true,
      },
    });

    const mySubmissions = await this.prisma.guideSubmission.findMany({
      where: { guideId, studentId: student.id },
      orderBy: { attemptNumber: 'desc' },
      select: {
        id: true,
        guideQuestionId: true,
        attemptNumber: true,
        status: true,
        score: true,
        isCorrect: true,
        gradedAt: true,
      },
    });

    const byQuestion = new Map<string, (typeof mySubmissions)[number][]>();
    for (const s of mySubmissions) {
      const list = byQuestion.get(s.guideQuestionId) ?? [];
      list.push(s);
      byQuestion.set(s.guideQuestionId, list);
    }

    return {
      guide: {
        id: guide.id,
        title: guide.title,
        dueAt: guide.dueAt,
        maxResubmissions: guide.maxResubmissions,
      },
      questions: questions.map((q) => ({
        ...q,
        submissions: byQuestion.get(q.id) ?? [],
      })),
    };
  }

  /** Creates a submission shell + presigned PUTs for the photos. */
  async createSubmission(
    studentUserId: string,
    guideId: string,
    questionId: string,
    dto: CreateSubmissionDto,
  ): Promise<CreateSubmissionResult> {
    await this.prisma.ensureConnected();
    const student = await this.resolveStudent(studentUserId);
    const guide = await this.loadPublishedGuideForStudent(student.id, guideId);

    const question = await this.prisma.guideQuestion.findFirst({
      where: { id: questionId, guideId, status: 'APPROVED' },
      select: { id: true },
    });
    if (!question) {
      throw new NotFoundException(
        'Question not found or not part of this guide',
      );
    }

    // Enforce re-submission cap (1 original + maxResubmissions retries).
    const existingCount = await this.prisma.guideSubmission.count({
      where: { guideQuestionId: questionId, studentId: student.id },
    });
    if (existingCount > guide.maxResubmissions) {
      throw new BadRequestException(
        `Re-submission limit reached (${guide.maxResubmissions})`,
      );
    }
    const attemptNumber = existingCount + 1;

    const submissionId = randomUUID();
    const photoKeys = Array.from(
      { length: dto.photoCount },
      () => `submissions/${submissionId}/${randomUUID()}.jpg`,
    );

    await this.prisma.guideSubmission.create({
      data: {
        id: submissionId,
        guideId,
        guideQuestionId: questionId,
        studentId: student.id,
        attemptNumber,
        status: 'UPLOADED',
        photoKeys,
      },
    });

    const bucket = this.submissionsBucket();
    const ttl = Number(process.env['GUIDES_PRESIGNED_PUT_TTL'] ?? 600);
    const presignedPutUrls = await Promise.all(
      photoKeys.map((key) =>
        this.s3.createPresignedPutUrl({
          bucket,
          key,
          ttlSeconds: ttl,
          contentType: 'image/jpeg',
        }),
      ),
    );

    return { submissionId, presignedPutUrls, attemptNumber };
  }

  /** Validates photos landed in S3 and enqueues grading. */
  async complete(
    studentUserId: string,
    submissionId: string,
  ): Promise<{ status: string }> {
    await this.prisma.ensureConnected();
    const student = await this.resolveStudent(studentUserId);

    const submission = await this.prisma.guideSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission || submission.studentId !== student.id) {
      throw new NotFoundException('Submission not found');
    }
    if (submission.status !== 'UPLOADED') {
      throw new BadRequestException(
        `Submission already ${submission.status} — cannot complete again`,
      );
    }

    const bucket = this.submissionsBucket();
    const checks = await Promise.all(
      submission.photoKeys.map((key) => this.s3.objectExists(bucket, key)),
    );
    if (checks.some((present) => !present)) {
      throw new BadRequestException(
        'Not all photos were uploaded — finish the uploads before completing',
      );
    }

    // Resolve the pauta version in force at grading time (reproducibility).
    const solution = await this.prisma.guideSolution.findFirst({
      where: { guideQuestionId: submission.guideQuestionId, isCurrent: true },
      select: { version: true },
    });

    await this.prisma.guideSubmission.update({
      where: { id: submissionId },
      data: { solutionVersion: solution?.version ?? null },
    });

    const message: SubmissionGradeMessage = {
      guide_submission_id: submission.id,
      guide_question_id: submission.guideQuestionId,
      solution_version: solution?.version ?? 0,
      photo_keys: submission.photoKeys,
      trace_id: submission.traceId,
    };
    await this.sqs.publishStandard({
      queueUrl: process.env['SQS_SUBMISSION_GRADE_URL'] ?? '',
      messageBody: message,
    });

    this.logger.log(`Submission ${submissionId} queued for grading`);
    return { status: 'UPLOADED' };
  }

  /** Polling endpoint — status + result if graded. */
  async getStatus(studentUserId: string, submissionId: string) {
    await this.prisma.ensureConnected();
    const student = await this.resolveStudent(studentUserId);

    const submission = await this.prisma.guideSubmission.findUnique({
      where: { id: submissionId },
      include: {
        attempt: { include: { errorTag: true } },
        guide: { select: { showSolutionAfterGrade: true } },
      },
    });
    if (!submission || submission.studentId !== student.id) {
      throw new NotFoundException('Submission not found');
    }

    return {
      id: submission.id,
      status: submission.status,
      score: submission.score,
      isCorrect: submission.isCorrect,
      errorTagCode: submission.attempt?.errorTag?.code ?? null,
      errorTagName: submission.attempt?.errorTag?.name ?? null,
      diagnosticHint: submission.attempt?.errorTag?.diagnosticHint ?? null,
      gradedAt: submission.gradedAt,
    };
  }

  /** Per-question results for the student (self only). */
  async getResults(studentUserId: string, guideId: string) {
    await this.prisma.ensureConnected();
    const student = await this.resolveStudent(studentUserId);
    const guide = await this.loadPublishedGuideForStudent(student.id, guideId);

    const questions = await this.prisma.guideQuestion.findMany({
      where: { guideId, status: 'APPROVED' },
      orderBy: { sequence: 'asc' },
      include: {
        submissions: {
          where: { studentId: student.id },
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          include: { attempt: { include: { errorTag: true } } },
        },
        // Always fetched; exposure is gated below by showSolutionAfterGrade + graded.
        solutions: { where: { isCurrent: true }, take: 1 },
      },
    });

    return {
      guideId,
      showSolution: guide.showSolutionAfterGrade,
      questions: questions.map((q) => {
        const latest = q.submissions[0];
        const graded = latest?.status === 'GRADED';
        return {
          questionId: q.id,
          sequence: q.sequence,
          label: q.label,
          points: q.points,
          status: latest?.status ?? 'NOT_SUBMITTED',
          score: latest?.score ?? null,
          isCorrect: latest?.isCorrect ?? null,
          errorTagCode: latest?.attempt?.errorTag?.code ?? null,
          // `|| null`: ErrorTag.name has a "" Prisma default, so a freshly
          // imported tag degrades to the FE humanizer instead of rendering "".
          errorTagName: latest?.attempt?.errorTag?.name || null,
          // Solution only after grading and only if the teacher opted in.
          solution:
            guide.showSolutionAfterGrade && graded
              ? (q.solutions[0] ?? null)
              : null,
        };
      }),
    };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private async resolveStudent(userId: string) {
    const student = await this.prisma.student.findFirst({ where: { userId } });
    if (!student) {
      throw new NotFoundException('Student profile not found for current user');
    }
    return student;
  }

  /** Asserts the guide is PUBLISHED and the student is actively enrolled. */
  private async loadPublishedGuideForStudent(
    studentId: string,
    guideId: string,
  ) {
    const guide = await this.prisma.guide.findUnique({
      where: { id: guideId },
    });
    if (!guide || guide.status !== 'PUBLISHED') {
      throw new NotFoundException('Guide not found');
    }
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, courseId: guide.courseId, status: 'ACTIVE' },
    });
    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this guide course');
    }
    return guide;
  }

  private submissionsBucket(): string {
    const bucket = process.env['S3_SUBMISSIONS_BUCKET'];
    if (!bucket) {
      throw new BadRequestException('S3_SUBMISSIONS_BUCKET not configured');
    }
    return bucket;
  }
}
