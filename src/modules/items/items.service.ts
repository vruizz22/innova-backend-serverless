import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Item, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreateItemDto } from '@modules/items/dto/create-item.dto';

const itemContentSchema = z.object({
  prompt: z.string().min(1),
});

type ItemWithSkill = Prisma.ItemGetPayload<{
  include: { skill: { select: { key: true; name: true } } };
}>;

export interface ItemView {
  id: string;
  skillId: string;
  skillKey: string;
  skillLabel: string;
  content: {
    prompt: string;
    problem: string;
    expectedAnswer: number | null;
  };
  difficulty: 'easy' | 'medium' | 'hard';
  irtA: number;
  irtB: number;
  createdAt: Date;
  updatedAt: Date;
}

function readContent(item: ItemWithSkill): ItemView['content'] {
  const content = item.content as Record<string, unknown>;
  const prompt = typeof content['prompt'] === 'string' ? content['prompt'] : '';
  const expectedAnswer =
    typeof content['expectedAnswer'] === 'number'
      ? content['expectedAnswer']
      : null;

  return {
    prompt,
    problem: prompt,
    expectedAnswer,
  };
}

function difficultyFromIrt(irtB: number): ItemView['difficulty'] {
  if (irtB <= -0.4) return 'easy';
  if (irtB >= 0.7) return 'hard';
  return 'medium';
}

function toItemView(item: ItemWithSkill): ItemView {
  return {
    id: item.id,
    skillId: item.skillId,
    skillKey: item.skill.key,
    skillLabel: item.skill.name,
    content: readContent(item),
    difficulty: difficultyFromIrt(item.irtB),
    irtA: item.irtA,
    irtB: item.irtB,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateItemDto): Promise<Item> {
    const parsed = itemContentSchema.safeParse(dto.content);
    if (!parsed.success) {
      throw new BadRequestException('Invalid item content schema');
    }
    await this.prisma.ensureConnected();
    return this.prisma.item.create({
      data: {
        skillId: dto.skillId,
        content: parsed.data,
        irtA: dto.irtA,
        irtB: dto.irtB,
      },
    });
  }

  async findAll(skillKey?: string, limit = 32): Promise<ItemView[]> {
    await this.prisma.ensureConnected();
    const items = await this.prisma.item.findMany({
      where: skillKey ? { skill: { key: skillKey } } : undefined,
      include: { skill: { select: { key: true, name: true } } },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return items.map(toItemView);
  }

  async findOne(id: string): Promise<ItemView> {
    await this.prisma.ensureConnected();
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: { skill: { select: { key: true, name: true } } },
    });
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    return toItemView(item);
  }

  async getIrtParams(
    id: string,
  ): Promise<{ irtA: number; irtB: number } | null> {
    await this.prisma.ensureConnected();
    const item = await this.prisma.item.findUnique({
      where: { id },
      select: { irtA: true, irtB: true },
    });
    if (!item) return null;
    return { irtA: item.irtA, irtB: item.irtB };
  }
}
