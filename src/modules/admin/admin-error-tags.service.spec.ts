import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { AdminErrorTagsService } from '@modules/admin/admin-error-tags.service';

type FindManyArgs = { take: number; cursor?: { code: string }; where: unknown };

function tag(code: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    code,
    name: `Name ${code}`,
    subdomainCode: null,
    source: 'CURATED',
    status: 'ACTIVE',
    severity: 'MED',
    applicableGrades: [3, 4],
    diagnosticHint: null,
    domain: { code: 'ARITH', name: 'Aritmética con naturales' },
    ...over,
  };
}

function buildPrisma(rows: ReturnType<typeof tag>[]): {
  prisma: PrismaService;
  findMany: jest.Mock;
  update: jest.Mock;
  findUnique: jest.Mock;
} {
  const findMany = jest.fn((args: FindManyArgs) =>
    Promise.resolve(rows.slice(0, args.take)),
  );
  const update = jest.fn((args: { data: { status: string } }) =>
    Promise.resolve(tag('ARITH_SUB_01', { status: args.data.status })),
  );
  const findUnique = jest.fn().mockResolvedValue({ code: 'ARITH_SUB_01' });
  const prisma = {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    errorTag: {
      findMany,
      update,
      findUnique,
      count: jest.fn().mockResolvedValue(rows.length),
      groupBy: jest.fn().mockResolvedValue([
        { status: 'ACTIVE', _count: { _all: 5 } },
        { status: 'DRAFT', _count: { _all: 2 } },
        { status: 'DEPRECATED', _count: { _all: 1 } },
      ]),
    },
    domain: {
      findMany: jest.fn().mockResolvedValue([
        {
          code: 'ARITH',
          name: 'Aritmética con naturales',
          _count: { errorTags: 58 },
        },
      ]),
    },
  } as unknown as PrismaService;
  return { prisma, findMany, update, findUnique };
}

describe('AdminErrorTagsService', () => {
  it('maps rows to views with the owning domain and status facets', async () => {
    const { prisma } = buildPrisma([tag('ARITH_SUB_01'), tag('ARITH_SUB_02')]);
    const service = new AdminErrorTagsService(prisma);

    const result = await service.listErrorTags({ limit: 50 });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      code: 'ARITH_SUB_01',
      domainCode: 'ARITH',
      domainName: 'Aritmética con naturales',
      status: 'ACTIVE',
    });
    expect(result.statusCounts).toEqual({ active: 5, draft: 2, deprecated: 1 });
    expect(result.domains).toEqual([
      { code: 'ARITH', name: 'Aritmética con naturales', count: 58 },
    ]);
  });

  it('computes nextCursor only when an extra row is returned', async () => {
    // take=1 → service fetches take+1=2; the extra row signals a next page.
    const { prisma } = buildPrisma([tag('ARITH_SUB_01'), tag('ARITH_SUB_02')]);
    const service = new AdminErrorTagsService(prisma);

    const result = await service.listErrorTags({ limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe('ARITH_SUB_01');
  });

  it('builds a case-insensitive OR filter from q and a domain filter', async () => {
    const { prisma, findMany } = buildPrisma([tag('ARITH_SUB_01')]);
    const service = new AdminErrorTagsService(prisma);

    await service.listErrorTags({
      q: 'resta',
      domainCode: 'ARITH',
      status: 'DRAFT',
    });

    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toBe('DRAFT');
    expect(where.domain).toEqual({ code: 'ARITH' });
    expect(where.OR).toEqual([
      { code: { contains: 'resta', mode: 'insensitive' } },
      { name: { contains: 'resta', mode: 'insensitive' } },
      { description: { contains: 'resta', mode: 'insensitive' } },
    ]);
  });

  it('updateErrorTagStatus throws when the tag does not exist', async () => {
    const { prisma, findUnique } = buildPrisma([]);
    findUnique.mockResolvedValueOnce(null);
    const service = new AdminErrorTagsService(prisma);

    await expect(
      service.updateErrorTagStatus('NOPE', 'ACTIVE'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateErrorTagStatus persists the new status and returns the view', async () => {
    const { prisma, update } = buildPrisma([]);
    const service = new AdminErrorTagsService(prisma);

    const result = await service.updateErrorTagStatus(
      'ARITH_SUB_01',
      'DEPRECATED',
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: 'ARITH_SUB_01' },
        data: { status: 'DEPRECATED' },
      }),
    );
    expect(result.status).toBe('DEPRECATED');
  });
});
