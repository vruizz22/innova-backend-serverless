import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Topic } from '@prisma/client';
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

  /**
   * The math error taxonomy (domains + their subdomains) — the classification
   * catalog the guide wizard offers, always populated (unlike curriculum topics).
   */
  async getTaxonomy() {
    await this.prisma.ensureConnected();
    return this.prisma.domain.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        subdomains: {
          orderBy: { code: 'asc' },
          select: { id: true, code: true, name: true },
        },
      },
    });
  }

  /**
   * Search the live ACTIVE error catalog for the teacher's manual override
   * (guide results matrix). Unlike the bundled front-end seed, this reads the
   * backend source of truth (2.6k+ tags), so the typeahead surfaces every error
   * the classifier can assign — just like the topic taxonomy is served live.
   */
  async searchErrorTags(params: {
    q?: string;
    domainCode?: string;
    limit?: number;
  }): Promise<
    Array<{
      code: string;
      name: string;
      subdomainCode: string | null;
      domainCode: string | null;
    }>
  > {
    await this.prisma.ensureConnected();

    const where: Prisma.ErrorTagWhereInput = { status: 'ACTIVE' };
    if (params.domainCode) where.domain = { code: params.domainCode };
    const q = params.q?.trim();
    if (q) {
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const rows = await this.prisma.errorTag.findMany({
      where,
      select: {
        code: true,
        name: true,
        subdomainCode: true,
        domain: { select: { code: true } },
      },
      orderBy: { code: 'asc' },
      take,
    });

    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      subdomainCode: r.subdomainCode,
      domainCode: r.domain?.code ?? null,
    }));
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
