import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateSkillDto } from '@modules/skills/dto/create-skill.dto';
import { UpdateSkillDto } from '@modules/skills/dto/update-skill.dto';

export interface SkillView {
  id: string;
  key: string;
  name: string;
  description?: string;
}

@Injectable()
export class SkillsService {
  private readonly skills = new Map<string, SkillView>();

  create(dto: CreateSkillDto): SkillView {
    const id = randomUUID();
    const created: SkillView = {
      id,
      key: dto.key,
      name: dto.name,
      description: dto.description,
    };
    this.skills.set(id, created);
    return created;
  }

  findAll(): SkillView[] {
    return [...this.skills.values()];
  }

  findOne(id: string): SkillView | null {
    return this.skills.get(id) ?? null;
  }

  update(id: string, dto: UpdateSkillDto): SkillView | null {
    const existing = this.skills.get(id);
    if (!existing) {
      return null;
    }
    const updated: SkillView = {
      ...existing,
      ...dto,
    };
    this.skills.set(id, updated);
    return updated;
  }

  remove(id: string): boolean {
    return this.skills.delete(id);
  }

  getPrerequisites(skillId: string): string[] {
    if (!this.skills.has(skillId)) {
      return [];
    }
    return [];
  }
}
