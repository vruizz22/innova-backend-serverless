import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CreateItemDto } from '@modules/items/dto/create-item.dto';

const itemContentSchema = z.object({
  prompt: z.string().min(1),
});

export interface ItemView {
  id: string;
  skillId: string;
  content: z.infer<typeof itemContentSchema>;
  irtA: number;
  irtB: number;
}

@Injectable()
export class ItemsService {
  private readonly items = new Map<string, ItemView>();

  create(dto: CreateItemDto): ItemView {
    const parsed = itemContentSchema.safeParse(dto.content);
    if (!parsed.success) {
      throw new BadRequestException('Invalid item content schema');
    }

    const created: ItemView = {
      id: randomUUID(),
      skillId: dto.skillId,
      content: parsed.data,
      irtA: dto.irtA,
      irtB: dto.irtB,
    };
    this.items.set(created.id, created);
    return created;
  }

  findAll(): ItemView[] {
    return [...this.items.values()];
  }

  getIrtParams(id: string): { irtA: number; irtB: number } | null {
    const item = this.items.get(id);
    if (!item) {
      return null;
    }
    return { irtA: item.irtA, irtB: item.irtB };
  }
}
