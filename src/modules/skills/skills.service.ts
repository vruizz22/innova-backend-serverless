import { Injectable } from '@nestjs/common';
import { Skill } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreateSkillDto } from '@modules/skills/dto/create-skill.dto';
import { UpdateSkillDto } from '@modules/skills/dto/update-skill.dto';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSkillDto): Promise<Skill> {
    await this.prisma.ensureConnected();
    return this.prisma.skill.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async findAll(): Promise<Skill[]> {
    await this.prisma.ensureConnected();
    return this.prisma.skill.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async findOne(id: string): Promise<Skill | null> {
    await this.prisma.ensureConnected();
    return this.prisma.skill.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdateSkillDto): Promise<Skill | null> {
    await this.prisma.ensureConnected();
    const existing = await this.prisma.skill.findUnique({ where: { id } });
    if (!existing) return null;
    return this.prisma.skill.update({
      where: { id },
      data: {
        ...(dto.key !== undefined && { key: dto.key }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  async remove(id: string): Promise<boolean> {
    await this.prisma.ensureConnected();
    const existing = await this.prisma.skill.findUnique({ where: { id } });
    if (!existing) return false;
    await this.prisma.skill.delete({ where: { id } });
    return true;
  }

  getPrerequisites(_id: string): string[] {
    return [];
  }
}
