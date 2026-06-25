import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Exercise } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { CreateItemDto } from '@modules/items/dto/create-item.dto';
import type { ExerciseGenerateMessage } from '@shared/sqs/guide-messages';

const exerciseContentSchema = z.object({
  prompt: z.string().min(1),
  expectedAnswer: z.number().optional(),
});

export interface ItemView {
  id: string;
  topicId: string;
  topicCode: string;
  topicName: string;
  content: {
    prompt: string;
    problem: string;
    expectedAnswer: number | null;
    correct_answer_latex: string | null;
  };
  difficulty: 'easy' | 'medium' | 'hard';
  irtA: number;
  irtB: number;
  source: string;
  createdAt: Date;
}

export interface GenerateItemsResult {
  generated: number;
  message: string;
}

function difficultyFromIrt(irtB: number): ItemView['difficulty'] {
  if (irtB <= -0.4) return 'easy';
  if (irtB >= 0.7) return 'hard';
  return 'medium';
}

type ExerciseWithTopic = Exercise & {
  topic: { code: string; name: string };
};

function toItemView(ex: ExerciseWithTopic): ItemView {
  const content = ex.content as Record<string, unknown>;
  const rawPrompt =
    typeof content['prompt'] === 'string' ? content['prompt'] : '';
  const prompt =
    rawPrompt ||
    (typeof content['statement_latex'] === 'string'
      ? content['statement_latex']
      : '');
  const expectedAnswer =
    typeof content['expectedAnswer'] === 'number'
      ? content['expectedAnswer']
      : null;
  const correct_answer_latex =
    typeof content['correct_answer_latex'] === 'string'
      ? content['correct_answer_latex']
      : typeof content['final_answer'] === 'string'
        ? content['final_answer']
        : null;

  return {
    id: ex.id,
    topicId: ex.topicId,
    topicCode: ex.topic.code,
    topicName: ex.topic.name,
    content: { prompt, problem: prompt, expectedAnswer, correct_answer_latex },
    difficulty: difficultyFromIrt(ex.irtB),
    irtA: ex.irtA,
    irtB: ex.irtB,
    source: ex.source,
    createdAt: ex.createdAt,
  };
}

const EXERCISE_GENERATE_QUEUE_URL =
  process.env['EXERCISE_GENERATE_QUEUE_URL'] ?? '';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sqs: SqsAdapter,
  ) {}

  async create(dto: CreateItemDto): Promise<Exercise> {
    const parsed = exerciseContentSchema.safeParse(dto.content);
    if (!parsed.success) {
      throw new BadRequestException('Invalid item content schema');
    }
    await this.prisma.ensureConnected();

    // Resolve topicId from skillId (backward compat) or direct topicId
    const topic = await this.prisma.topic.findFirst({
      where: { id: dto.skillId },
    });
    if (!topic) {
      throw new NotFoundException(`Topic ${dto.skillId} not found`);
    }

    return this.prisma.exercise.create({
      data: {
        topicId: topic.id,
        source: 'TEACHER_AUTHORED',
        content: parsed.data,
        irtA: dto.irtA,
        irtB: dto.irtB,
        status: 'ACTIVE',
      },
    });
  }

  async findAll(topicCode?: string, limit = 32): Promise<ItemView[]> {
    await this.prisma.ensureConnected();
    const exercises = await this.prisma.exercise.findMany({
      where: topicCode
        ? { topic: { code: topicCode }, status: 'ACTIVE' }
        : { status: 'ACTIVE' },
      include: { topic: { select: { code: true, name: true } } },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return exercises.map(toItemView);
  }

  async findOne(id: string): Promise<ItemView> {
    await this.prisma.ensureConnected();
    const exercise = await this.prisma.exercise.findUnique({
      where: { id },
      include: { topic: { select: { code: true, name: true } } },
    });
    if (!exercise) {
      throw new NotFoundException('Exercise not found');
    }
    return toItemView(exercise);
  }

  async getIrtParams(
    id: string,
  ): Promise<{ irtA: number; irtB: number } | null> {
    await this.prisma.ensureConnected();
    const exercise = await this.prisma.exercise.findUnique({
      where: { id },
      select: { irtA: true, irtB: true },
    });
    if (!exercise) return null;
    return { irtA: exercise.irtA, irtB: exercise.irtB };
  }

  async generateItems(input: {
    subdomainCode: string;
    gradeLevel: number;
    targetErrorCodes: string[];
    count: number;
  }): Promise<GenerateItemsResult> {
    const msg: ExerciseGenerateMessage = {
      subdomain_code: input.subdomainCode,
      grade_level: input.gradeLevel,
      target_error_codes: input.targetErrorCodes,
      count: input.count,
      trace_id: randomUUID(),
    };
    await this.sqs.publishStandard({
      queueUrl: EXERCISE_GENERATE_QUEUE_URL,
      messageBody: msg,
    });
    return {
      generated: 0,
      message: `Generación de ${input.count} ejercicio(s) encolada. Aparecerán en el banco en unos minutos.`,
    };
  }
}
