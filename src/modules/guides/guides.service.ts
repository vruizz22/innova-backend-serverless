import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { S3Adapter } from '@adapters/s3.adapter';
import { SqsAdapter } from '@adapters/sqs.adapter';
import {
  GuideIngestMessage,
  SolutionGenMessage,
} from '@shared/sqs/guide-messages';
import {
  assertTransition,
  canonicalSolutionSchema,
  hasCheckpoint,
  INGESTABLE_STATUSES,
  type GuideStatusValue,
} from '@modules/guides/guide-state-machine';
import { CreateGuideDto } from '@modules/guides/dto/create-guide.dto';
import { UpdateGuideDto } from '@modules/guides/dto/update-guide.dto';
import { UpdateGuideQuestionDto } from '@modules/guides/dto/update-guide-question.dto';
import { UpdateGuideSolutionDto } from '@modules/guides/dto/update-guide-solution.dto';

export interface CreateGuideResult {
  guideId: string;
  presignedPutUrl: string;
  sourcePdfKey: string;
}

interface ListGuidesParams {
  courseId?: string;
  status?: GuideStatusValue;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class GuidesService {
  private readonly logger = new Logger(GuidesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Adapter,
    private readonly sqs: SqsAdapter,
  ) {}

  // -------------------------------------------------------------------
  // Create + ingest
  // -------------------------------------------------------------------

  async create(
    teacherUserId: string,
    dto: CreateGuideDto,
  ): Promise<CreateGuideResult> {
    await this.prisma.ensureConnected();
    const teacher = await this.resolveTeacher(teacherUserId);

    // Ownership: the teacher must lead/assist the target course.
    const link = await this.prisma.courseTeacher.findFirst({
      where: { teacherId: teacher.id, courseId: dto.courseId },
    });
    if (!link) {
      throw new ForbiddenException('You do not teach this course');
    }

    const sourcePdfKey = `guides/uploads/${randomUUID()}.pdf`;
    const guide = await this.prisma.guide.create({
      data: {
        courseId: dto.courseId,
        createdByTeacherId: teacher.id,
        title: dto.title,
        description: dto.description ?? null,
        status: 'UPLOADED',
        sourcePdfKey,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      },
    });

    const presignedPutUrl = await this.s3.createPresignedPutUrl({
      bucket: this.guidesBucket(),
      key: sourcePdfKey,
      ttlSeconds: this.putTtl(),
      contentType: 'application/pdf',
    });

    return { guideId: guide.id, presignedPutUrl, sourcePdfKey };
  }

  /** Kicks off (or retries) extraction. Idempotent against in-flight states. */
  async ingest(
    teacherUserId: string,
    guideId: string,
  ): Promise<{ status: GuideStatusValue }> {
    await this.prisma.ensureConnected();
    const { guide } = await this.loadOwnedGuide(teacherUserId, guideId);
    const course = await this.prisma.course.findUnique({
      where: { id: guide.courseId },
      select: { gradeLevel: true },
    });
    const status = guide.status as GuideStatusValue;

    // Already extracting/generating → no-op (idempotent re-trigger).
    if (status === 'EXTRACTING' || status === 'GENERATING_SOLUTIONS') {
      return { status };
    }
    if (!INGESTABLE_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Guide in status ${status} cannot be ingested`,
      );
    }
    assertTransition(status, 'EXTRACTING');

    await this.prisma.guide.update({
      where: { id: guide.id },
      data: { status: 'EXTRACTING', failureReason: null },
    });

    const message: GuideIngestMessage = {
      guide_id: guide.id,
      source_pdf_key: guide.sourcePdfKey,
      course_grade_level: course?.gradeLevel ?? 0,
      trace_id: guide.traceId,
    };
    await this.sqs.publishStandard({
      queueUrl: process.env['SQS_GUIDE_INGEST_URL'] ?? '',
      messageBody: message,
    });

    return { status: 'EXTRACTING' };
  }

  // -------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------

  async list(teacherUserId: string, params: ListGuidesParams) {
    await this.prisma.ensureConnected();
    const teacher = await this.resolveTeacher(teacherUserId);

    const courseIds = (
      await this.prisma.courseTeacher.findMany({
        where: { teacherId: teacher.id },
        select: { courseId: true },
      })
    ).map((c) => c.courseId);

    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);

    const where: Prisma.GuideWhereInput = {
      courseId: params.courseId ? params.courseId : { in: courseIds },
      ...(params.status ? { status: params.status } : {}),
      archivedAt: null,
    };
    // Guard: a courseId filter must still belong to the teacher.
    if (params.courseId && !courseIds.includes(params.courseId)) {
      throw new ForbiddenException('You do not teach this course');
    }

    const [items, total] = await Promise.all([
      this.prisma.guide.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { questions: true, submissions: true } } },
      }),
      this.prisma.guide.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /** Full wizard view: questions + their current solution. */
  async getDetail(teacherUserId: string, guideId: string) {
    await this.prisma.ensureConnected();
    await this.loadOwnedGuide(teacherUserId, guideId);

    const guide = await this.prisma.guide.findUnique({
      where: { id: guideId },
      include: {
        questions: {
          orderBy: { sequence: 'asc' },
          include: {
            topic: { select: { id: true, code: true, name: true } },
            solutions: { where: { isCurrent: true }, take: 1 },
          },
        },
      },
    });
    if (!guide) return null;

    // The taxonomy classification (domain/subdomain) lives as scalar FKs on
    // GuideQuestion with no Prisma relation, so resolve the names in one batched
    // lookup and attach them — this is what the wizard shows as the question topic.
    const domainIds = [
      ...new Set(
        guide.questions
          .map((q) => q.domainId)
          .filter((x): x is string => x !== null),
      ),
    ];
    const subdomainIds = [
      ...new Set(
        guide.questions
          .map((q) => q.subdomainId)
          .filter((x): x is string => x !== null),
      ),
    ];
    const [domains, subdomains] = await Promise.all([
      domainIds.length
        ? this.prisma.domain.findMany({
            where: { id: { in: domainIds } },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve([]),
      subdomainIds.length
        ? this.prisma.subdomain.findMany({
            where: { id: { in: subdomainIds } },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const domainById = new Map(domains.map((d) => [d.id, d]));
    const subById = new Map(subdomains.map((s) => [s.id, s]));

    return {
      ...guide,
      questions: guide.questions.map((q) => ({
        ...q,
        domain: q.domainId ? (domainById.get(q.domainId) ?? null) : null,
        subdomain: q.subdomainId ? (subById.get(q.subdomainId) ?? null) : null,
      })),
    };
  }

  // -------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------

  async updateGuide(
    teacherUserId: string,
    guideId: string,
    dto: UpdateGuideDto,
  ) {
    await this.prisma.ensureConnected();
    await this.loadOwnedGuide(teacherUserId, guideId);

    return this.prisma.guide.update({
      where: { id: guideId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.dueAt !== undefined ? { dueAt: new Date(dto.dueAt) } : {}),
        ...(dto.maxResubmissions !== undefined
          ? { maxResubmissions: dto.maxResubmissions }
          : {}),
        ...(dto.showSolutionAfterGrade !== undefined
          ? { showSolutionAfterGrade: dto.showSolutionAfterGrade }
          : {}),
      },
    });
  }

  async updateQuestion(
    teacherUserId: string,
    guideId: string,
    questionId: string,
    dto: UpdateGuideQuestionDto,
  ) {
    await this.prisma.ensureConnected();
    await this.loadOwnedGuide(teacherUserId, guideId);
    const question = await this.prisma.guideQuestion.findFirst({
      where: { id: questionId, guideId },
    });
    if (!question) throw new NotFoundException('Question not found in guide');

    // The teacher confirms the classification by subdomain (primary, v9.1) or by a
    // curriculum topic (legacy). Either flags the source as TEACHER and propagates the
    // owning domain so the error analysis stays anchored to the taxonomy.
    let topicLink: Prisma.GuideQuestionUpdateInput = {};
    if (dto.subdomainId !== undefined) {
      const subdomain = await this.prisma.subdomain.findUnique({
        where: { id: dto.subdomainId },
        select: { id: true, domainId: true },
      });
      if (!subdomain) throw new NotFoundException('Subdomain not found');
      topicLink = {
        subdomainId: subdomain.id,
        domainId: subdomain.domainId,
        topicSource: 'TEACHER',
        topicConfidence: 1.0,
      };
    } else if (dto.topicId !== undefined) {
      const topic = await this.prisma.topic.findUnique({
        where: { id: dto.topicId },
        select: { id: true, domainId: true, subdomainId: true },
      });
      if (!topic) throw new NotFoundException('Topic not found');
      topicLink = {
        topic: { connect: { id: topic.id } },
        domainId: topic.domainId,
        subdomainId: topic.subdomainId,
        topicSource: 'TEACHER',
        topicConfidence: 1.0,
      };
    }

    return this.prisma.guideQuestion.update({
      where: { id: questionId },
      data: {
        ...(dto.statementLatex !== undefined
          ? { statementLatex: dto.statementLatex }
          : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.points !== undefined ? { points: dto.points } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...topicLink,
      },
    });
  }

  /** Creates a new TEACHER_EDITED solution version, demoting the previous one. */
  async updateSolution(
    teacherUserId: string,
    guideId: string,
    questionId: string,
    dto: UpdateGuideSolutionDto,
  ) {
    await this.prisma.ensureConnected();
    const { teacher } = await this.loadOwnedGuide(teacherUserId, guideId);

    const question = await this.prisma.guideQuestion.findFirst({
      where: { id: questionId, guideId },
    });
    if (!question) throw new NotFoundException('Question not found in guide');

    const parsed = canonicalSolutionSchema.safeParse(dto.stepsJson);
    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid canonical solution: ${parsed.error.message}`,
      );
    }
    if (!hasCheckpoint(parsed.data)) {
      throw new BadRequestException(
        'Solution must contain at least one checkpoint step',
      );
    }

    const latest = await this.prisma.guideSolution.findFirst({
      where: { guideQuestionId: questionId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      await tx.guideSolution.updateMany({
        where: { guideQuestionId: questionId, isCurrent: true },
        data: { isCurrent: false },
      });
      return tx.guideSolution.create({
        data: {
          guideQuestionId: questionId,
          version: nextVersion,
          isCurrent: true,
          source: 'TEACHER_EDITED',
          finalAnswer: dto.finalAnswer,
          stepsJson: parsed.data as unknown as Prisma.InputJsonValue,
          solutionLatex: dto.solutionLatex ?? null,
          expectedErrorTags: dto.expectedErrorTags ?? [],
          createdByTeacherId: teacher.id,
        },
      });
    });
  }

  /** Re-enqueues solution generation for a single question (guide stays REVIEW). */
  async regenerateSolution(
    teacherUserId: string,
    guideId: string,
    questionId: string,
  ): Promise<{ enqueued: boolean }> {
    await this.prisma.ensureConnected();
    const { guide } = await this.loadOwnedGuide(teacherUserId, guideId);
    const question = await this.prisma.guideQuestion.findFirst({
      where: { id: questionId, guideId },
      select: { id: true },
    });
    if (!question) throw new NotFoundException('Question not found in guide');

    const message: SolutionGenMessage = {
      guide_id: guide.id,
      guide_question_id: questionId,
      trace_id: guide.traceId,
    };
    await this.sqs.publishStandard({
      queueUrl: process.env['SQS_SOLUTION_GEN_URL'] ?? '',
      messageBody: message,
    });
    return { enqueued: true };
  }

  // -------------------------------------------------------------------
  // Publish (ADR-116): materialize Exercises + Assignment(kind=GUIDE)
  // -------------------------------------------------------------------

  async publish(teacherUserId: string, guideId: string) {
    await this.prisma.ensureConnected();
    const { teacher } = await this.loadOwnedGuide(teacherUserId, guideId);

    const guide = await this.prisma.guide.findUnique({
      where: { id: guideId },
      include: {
        course: { include: { enrollments: { where: { status: 'ACTIVE' } } } },
        questions: {
          orderBy: { sequence: 'asc' },
          include: { solutions: { where: { isCurrent: true }, take: 1 } },
        },
      },
    });
    if (!guide) throw new NotFoundException('Guide not found');

    assertTransition(guide.status as GuideStatusValue, 'PUBLISHED');

    const unresolved = guide.questions.filter(
      (q) => q.status !== 'APPROVED' && q.status !== 'EXCLUDED',
    );
    if (unresolved.length > 0) {
      throw new BadRequestException(
        `All questions must be APPROVED or EXCLUDED before publishing (${unresolved.length} pending)`,
      );
    }
    const approved = guide.questions.filter((q) => q.status === 'APPROVED');
    if (approved.length === 0) {
      throw new BadRequestException(
        'A guide needs at least one APPROVED question to publish',
      );
    }

    const studentIds = guide.course.enrollments.map((e) => e.studentId);

    return this.prisma.$transaction(async (tx) => {
      // 1) Assignment(kind=GUIDE) + targets per enrolled student.
      const assignment = await tx.assignment.create({
        data: {
          courseId: guide.courseId,
          createdByTeacherId: teacher.id,
          title: guide.title,
          reason: 'TEACHER_MANUAL',
          kind: 'GUIDE',
          dueAt: guide.dueAt,
          targets: {
            create: studentIds.map((studentId) => ({
              studentId,
              status: 'PENDING',
            })),
          },
        },
      });

      // 2) Materialize an Exercise per APPROVED question WITH a confirmed topic
      //    (ADR-122 §5.6: questions without topic are still gradable but do not
      //    feed BKT, and have no Exercise since Exercise.topicId is required).
      let sequence = 0;
      let materialized = 0;
      let withoutTopic = 0;
      for (const question of approved) {
        if (!question.topicId) {
          withoutTopic += 1;
          continue;
        }
        const solution = question.solutions[0];
        const exercise = await tx.exercise.create({
          data: {
            topicId: question.topicId,
            source: 'GUIDE_EXTRACTED',
            createdByTeacherId: teacher.id,
            content: {
              statement_latex: question.statementLatex,
              figures: question.figureKeys,
              final_answer: solution?.finalAnswer ?? null,
            } as Prisma.InputJsonValue,
            irtA: 1.0,
            irtB: 0.0,
            status: 'ACTIVE',
          },
        });
        await tx.guideQuestion.update({
          where: { id: question.id },
          data: { exerciseId: exercise.id },
        });
        await tx.assignmentExercise.create({
          data: {
            assignmentId: assignment.id,
            exerciseId: exercise.id,
            sequence: sequence++,
          },
        });
        materialized += 1;
      }

      // 3) Flip the guide to PUBLISHED.
      const published = await tx.guide.update({
        where: { id: guide.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          assignmentId: assignment.id,
        },
      });

      this.logger.log(
        `Published guide ${guide.id}: ${materialized} exercises, ` +
          `${withoutTopic} approved without topic, ${studentIds.length} students assigned`,
      );

      return {
        guide: published,
        assignmentId: assignment.id,
        materializedExercises: materialized,
        approvedWithoutTopic: withoutTopic,
        studentsAssigned: studentIds.length,
      };
    });
  }

  async archive(teacherUserId: string, guideId: string) {
    await this.prisma.ensureConnected();
    const { guide } = await this.loadOwnedGuide(teacherUserId, guideId);
    assertTransition(guide.status as GuideStatusValue, 'ARCHIVED');

    return this.prisma.guide.update({
      where: { id: guide.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------
  // Results (C11 — teacher Student × Question matrix)
  // -------------------------------------------------------------------

  /**
   * Aggregates, for a published guide, the latest submission per
   * (student, question) into a matrix the teacher dashboard renders.
   * Read-only; the effective error tag prefers the teacher override.
   */
  async getResultsMatrix(teacherUserId: string, guideId: string) {
    await this.prisma.ensureConnected();
    const { guide } = await this.loadOwnedGuide(teacherUserId, guideId);
    const dueAt = guide.dueAt ?? null;

    const [students, questions, submissions] = await Promise.all([
      this.prisma.student.findMany({
        where: {
          enrollments: { some: { courseId: guide.courseId, status: 'ACTIVE' } },
        },
        select: { id: true, displayName: true },
        orderBy: { displayName: 'asc' },
      }),
      this.prisma.guideQuestion.findMany({
        where: { guideId, status: 'APPROVED' },
        orderBy: { sequence: 'asc' },
        select: { id: true, sequence: true, label: true, points: true },
      }),
      this.prisma.guideSubmission.findMany({
        where: { guideId },
        orderBy: { attemptNumber: 'desc' },
        include: {
          attempt: {
            include: { errorTag: { select: { code: true, name: true } } },
          },
          overrideErrorTag: { select: { code: true, name: true } },
        },
      }),
    ]);

    // Keep only the latest attempt per (question, student).
    const latest = new Map<string, (typeof submissions)[number]>();
    for (const s of submissions) {
      const key = `${s.guideQuestionId}:${s.studentId}`;
      if (!latest.has(key)) latest.set(key, s); // first seen = highest attemptNumber
    }

    const cells = [...latest.values()].map((s) => {
      const code =
        s.overrideErrorTag?.code ?? s.attempt?.errorTag?.code ?? null;
      const name =
        s.overrideErrorTag?.name ?? s.attempt?.errorTag?.name ?? null;
      const isLate = dueAt !== null && s.createdAt > dueAt;
      return {
        submissionId: s.id,
        questionId: s.guideQuestionId,
        studentId: s.studentId,
        status: s.status,
        score: s.score,
        isCorrect: s.isCorrect,
        attemptNumber: s.attemptNumber,
        errorTagCode: code,
        errorTagName: name,
        isOverridden: s.overrideErrorTagId !== null,
        isLate,
      };
    });

    // Top error tags per question (effective tag, only incorrect cells).
    const perQuestion = new Map<
      string,
      Map<string, { name: string | null; count: number }>
    >();
    for (const c of cells) {
      if (c.isCorrect === true || c.errorTagCode === null) continue;
      const byTag =
        perQuestion.get(c.questionId) ??
        new Map<string, { name: string | null; count: number }>();
      const entry = byTag.get(c.errorTagCode) ?? {
        name: c.errorTagName,
        count: 0,
      };
      entry.count += 1;
      byTag.set(c.errorTagCode, entry);
      perQuestion.set(c.questionId, byTag);
    }
    const commonErrors = questions.map((q) => {
      const byTag = perQuestion.get(q.id);
      const tags = byTag
        ? [...byTag.entries()]
            .map(([code, v]) => ({ code, name: v.name, count: v.count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
        : [];
      return { questionId: q.id, tags };
    });

    return {
      guideId,
      dueAt: dueAt ? dueAt.toISOString() : null,
      students,
      questions,
      cells,
      commonErrors,
    };
  }

  /**
   * Persists a teacher's manual error-tag override on one submission
   * (DoD C11: an ILLEGIBLE entry can be re-tagged by hand). The override
   * is stored on the submission so it survives even without an Attempt.
   */
  async overrideSubmissionErrorTag(
    teacherUserId: string,
    guideId: string,
    submissionId: string,
    errorTagCode: string | null,
  ) {
    await this.prisma.ensureConnected();
    const { teacher } = await this.loadOwnedGuide(teacherUserId, guideId);

    const submission = await this.prisma.guideSubmission.findFirst({
      where: { id: submissionId, guideId },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    let errorTagId: string | null = null;
    if (errorTagCode !== null) {
      const tag = await this.prisma.errorTag.findUnique({
        where: { code: errorTagCode },
        select: { id: true },
      });
      if (!tag)
        throw new NotFoundException(`Error tag ${errorTagCode} not found`);
      errorTagId = tag.id;
    }

    const updated = await this.prisma.guideSubmission.update({
      where: { id: submissionId },
      data: {
        overrideErrorTagId: errorTagId,
        overrideById: errorTagId !== null ? teacher.id : null,
        overrideAt: errorTagId !== null ? new Date() : null,
      },
      include: { overrideErrorTag: { select: { code: true, name: true } } },
    });

    return {
      submissionId: updated.id,
      errorTagCode: updated.overrideErrorTag?.code ?? null,
      errorTagName: updated.overrideErrorTag?.name ?? null,
      isOverridden: updated.overrideErrorTagId !== null,
    };
  }

  /**
   * Cell drawer detail (C11): the student's photos (presigned GET), the
   * transcription + alignment against the pauta, and the effective tag.
   */
  async getSubmissionDetail(
    teacherUserId: string,
    guideId: string,
    submissionId: string,
  ) {
    await this.prisma.ensureConnected();
    await this.loadOwnedGuide(teacherUserId, guideId);

    const submission = await this.prisma.guideSubmission.findFirst({
      where: { id: submissionId, guideId },
      include: {
        attempt: {
          include: { errorTag: { select: { code: true, name: true } } },
        },
        overrideErrorTag: { select: { code: true, name: true } },
        question: {
          select: { sequence: true, label: true, statementLatex: true },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const bucket = this.submissionsBucket();
    const ttl = Number(process.env['SUBMISSIONS_PRESIGNED_GET_TTL'] ?? 300);
    const photoUrls = await Promise.all(
      submission.photoKeys.map((key) =>
        this.s3.createPresignedGetUrl({ bucket, key, ttlSeconds: ttl }),
      ),
    );

    return {
      submissionId: submission.id,
      questionSequence: submission.question.sequence,
      questionLabel: submission.question.label,
      statementLatex: submission.question.statementLatex,
      status: submission.status,
      score: submission.score,
      isCorrect: submission.isCorrect,
      attemptNumber: submission.attemptNumber,
      transcriptionLatex: submission.transcriptionLatex,
      transcriptionConfidence: submission.transcriptionConfidence,
      alignmentJson: submission.alignmentJson,
      failureReason: submission.failureReason,
      photoUrls,
      errorTagCode:
        submission.overrideErrorTag?.code ??
        submission.attempt?.errorTag?.code ??
        null,
      errorTagName:
        submission.overrideErrorTag?.name ??
        submission.attempt?.errorTag?.name ??
        null,
      isOverridden: submission.overrideErrorTagId !== null,
    };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private submissionsBucket(): string {
    const bucket = process.env['S3_SUBMISSIONS_BUCKET'];
    if (!bucket)
      throw new BadRequestException('S3_SUBMISSIONS_BUCKET not configured');
    return bucket;
  }

  private async resolveTeacher(userId: string) {
    const teacher = await this.prisma.teacher.findFirst({ where: { userId } });
    if (!teacher) {
      throw new NotFoundException('Teacher profile not found for current user');
    }
    return teacher;
  }

  /**
   * Loads a guide and asserts the current teacher leads/assists its course.
   * Ownership is via CourseTeacher (a guide belongs to a course, plan §S12.2).
   * Callers that need relations re-query with their own `include`.
   */
  private async loadOwnedGuide(teacherUserId: string, guideId: string) {
    const teacher = await this.resolveTeacher(teacherUserId);
    const guide = await this.prisma.guide.findUnique({
      where: { id: guideId },
    });
    if (!guide) throw new NotFoundException('Guide not found');

    const link = await this.prisma.courseTeacher.findFirst({
      where: { teacherId: teacher.id, courseId: guide.courseId },
    });
    if (!link) {
      throw new ForbiddenException('You do not teach this guide course');
    }
    return { guide, teacher };
  }

  async getSourceUrl(
    teacherUserId: string,
    guideId: string,
  ): Promise<{ url: string }> {
    await this.prisma.ensureConnected();
    const { guide } = await this.loadOwnedGuide(teacherUserId, guideId);
    const bucket = this.guidesBucket();
    const ttl = Number(process.env['GUIDES_PRESIGNED_GET_TTL'] ?? 300);
    const url = await this.s3.createPresignedGetUrl({
      bucket,
      key: guide.sourcePdfKey,
      ttlSeconds: ttl,
    });
    return { url };
  }

  private guidesBucket(): string {
    const bucket = process.env['S3_GUIDES_BUCKET'];
    if (!bucket)
      throw new BadRequestException('S3_GUIDES_BUCKET not configured');
    return bucket;
  }

  private putTtl(): number {
    return Number(process.env['GUIDES_PRESIGNED_PUT_TTL'] ?? 600);
  }
}
