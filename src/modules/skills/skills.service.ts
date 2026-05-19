import { Injectable, NotFoundException } from '@nestjs/common';
import { Topic } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreateSkillDto } from '@modules/skills/dto/create-skill.dto';
import { UpdateSkillDto } from '@modules/skills/dto/update-skill.dto';

// v7: Skills are now Topics. This service wraps Topic CRUD for backward compatibility.
@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSkillDto): Promise<Topic> {
    await this.prisma.ensureConnected();
    // Requires a unit — for backward compat, get first available unit
    const unit = await this.prisma.unit.findFirst();
    if (!unit) {
      throw new NotFoundException(
        'No unit found — run seed first to create curriculum',
      );
    }
    return this.prisma.topic.create({
      data: {
        unitId: unit.id,
        code: dto.key,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async findAll(): Promise<Topic[]> {
    await this.prisma.ensureConnected();
    return this.prisma.topic.findMany({ orderBy: { unitId: 'asc' } });
  }

  async findOne(id: string): Promise<Topic | null> {
    await this.prisma.ensureConnected();
    return this.prisma.topic.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdateSkillDto): Promise<Topic | null> {
    await this.prisma.ensureConnected();
    const existing = await this.prisma.topic.findUnique({ where: { id } });
    if (!existing) return null;
    return this.prisma.topic.update({
      where: { id },
      data: {
        ...(dto.key !== undefined && { code: dto.key }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  async remove(id: string): Promise<boolean> {
    await this.prisma.ensureConnected();
    const existing = await this.prisma.topic.findUnique({ where: { id } });
    if (!existing) return false;
    await this.prisma.topic.delete({ where: { id } });
    return true;
  }

  async getPrerequisites(id: string): Promise<string[]> {
    await this.prisma.ensureConnected();
    const prereqs = await this.prisma.topicPrerequisite.findMany({
      where: { topicId: id },
      include: { prerequisite: { select: { id: true, code: true } } },
    });
    return prereqs.map((p) => p.prerequisite.code);
  }
}
