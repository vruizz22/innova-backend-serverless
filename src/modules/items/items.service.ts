import { BadRequestException, Injectable } from '@nestjs/common';
import { Item } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreateItemDto } from '@modules/items/dto/create-item.dto';

const itemContentSchema = z.object({
  prompt: z.string().min(1),
});

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

  async findAll(): Promise<Item[]> {
    await this.prisma.ensureConnected();
    return this.prisma.item.findMany({ orderBy: { createdAt: 'asc' } });
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
