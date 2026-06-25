import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ErrorStatus } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { ListErrorTagsDto } from '@modules/admin/dto/list-error-tags.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Columns surfaced to the admin catalog browser (+ the owning domain). */
const TAG_SELECT = {
  code: true,
  name: true,
  subdomainCode: true,
  source: true,
  status: true,
  severity: true,
  applicableGrades: true,
  diagnosticHint: true,
  domain: { select: { code: true, name: true } },
} satisfies Prisma.ErrorTagSelect;

type TagRow = Prisma.ErrorTagGetPayload<{ select: typeof TAG_SELECT }>;

/**
 * Live error-tag catalog for the admin surface. The catalog is the backend's
 * source of truth and grows continuously (LLM-generated + curated), so reads
 * are paginated (keyset) and never materialise the whole table.
 */
@Injectable()
export class AdminErrorTagsService {
  constructor(private readonly prisma: PrismaService) {}

  async listErrorTags(params: ListErrorTagsDto) {
    await this.prisma.ensureConnected();

    const where: Prisma.ErrorTagWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.source) where.source = params.source;
    if (params.domainCode) where.domain = { code: params.domainCode };
    const q = params.q?.trim();
    if (q) {
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const [rows, total, statusGroups, domains] = await Promise.all([
      this.prisma.errorTag.findMany({
        where,
        select: TAG_SELECT,
        orderBy: { code: 'asc' },
        take: take + 1, // one extra row → tells us whether a next page exists
        ...(params.cursor ? { cursor: { code: params.cursor }, skip: 1 } : {}),
      }),
      this.prisma.errorTag.count({ where }),
      this.prisma.errorTag.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.domain.findMany({
        select: {
          code: true,
          name: true,
          _count: { select: { errorTags: true } },
        },
        orderBy: { code: 'asc' },
      }),
    ]);

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const last = page.at(-1);
    const nextCursor = hasMore && last ? last.code : null;

    const statusCounts = { active: 0, draft: 0, deprecated: 0 };
    for (const group of statusGroups) {
      if (group.status === 'ACTIVE') statusCounts.active = group._count._all;
      else if (group.status === 'DRAFT') statusCounts.draft = group._count._all;
      else if (group.status === 'DEPRECATED') {
        statusCounts.deprecated = group._count._all;
      }
    }

    return {
      items: page.map((tag) => this.toView(tag)),
      nextCursor,
      total,
      statusCounts,
      domains: domains.map((d) => ({
        code: d.code,
        name: d.name,
        count: d._count.errorTags,
      })),
    };
  }

  async updateErrorTagStatus(code: string, status: ErrorStatus) {
    await this.prisma.ensureConnected();

    const existing = await this.prisma.errorTag.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!existing) throw new NotFoundException(`Error tag ${code} not found`);

    const updated = await this.prisma.errorTag.update({
      where: { code },
      data: { status },
      select: TAG_SELECT,
    });
    return this.toView(updated);
  }

  private toView(tag: TagRow) {
    return {
      code: tag.code,
      name: tag.name,
      domainCode: tag.domain?.code ?? null,
      domainName: tag.domain?.name ?? null,
      subdomainCode: tag.subdomainCode,
      source: tag.source,
      status: tag.status,
      severity: tag.severity,
      applicableGrades: tag.applicableGrades,
      diagnosticHint: tag.diagnosticHint,
    };
  }
}
