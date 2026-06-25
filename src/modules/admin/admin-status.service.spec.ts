import { PrismaService } from '@infrastructure/database/prisma.service';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { SsmAdapter } from '@adapters/ssm.adapter';
import { AdminStatusService } from '@modules/admin/admin-status.service';

function buildDeps(
  overrides: Partial<{
    guideCount: number;
    graderPaused: boolean;
    classifierPaused: boolean;
    solutionPaused: boolean;
    costRows: Array<{
      model: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }>;
  }> = {},
) {
  const prisma = {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    attempt: { count: jest.fn().mockResolvedValue(5) },
    guideSubmission: { count: jest.fn().mockResolvedValue(3) },
    guide: { count: jest.fn().mockResolvedValue(overrides.guideCount ?? 2) },
    costEvent: {
      groupBy: jest.fn().mockResolvedValue(
        (overrides.costRows ?? []).map((r) => ({
          model: r.model,
          _count: { id: r.calls },
          _sum: {
            costUsd: r.costUsd,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
          },
        })),
      ),
      aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: null } }),
    },
  } as unknown as PrismaService;

  const sqs = {
    getQueueDepth: jest.fn().mockResolvedValue(0),
  } as unknown as SqsAdapter;

  const ssm = {
    isParamTrue: jest.fn().mockImplementation((param: string) => {
      if (param.includes('grading'))
        return Promise.resolve(overrides.graderPaused ?? false);
      if (param.includes('llm'))
        return Promise.resolve(overrides.classifierPaused ?? false);
      if (param.includes('solution'))
        return Promise.resolve(overrides.solutionPaused ?? false);
      return Promise.resolve(false);
    }),
  } as unknown as SsmAdapter;

  const service = new AdminStatusService(prisma, sqs, ssm);
  return { service, prisma, sqs, ssm };
}

describe('AdminStatusService', () => {
  it('returns zero-cost snapshot with all killswitches enabled when SSM returns false', async () => {
    const { service } = buildDeps();
    const result = await service.getStatus();

    expect(result.cost.todayUsd).toBe(0);
    expect(result.cost.byModel).toHaveLength(0);
    expect(result.killswitches.graderEnabled).toBe(true);
    expect(result.killswitches.classifierEnabled).toBe(true);
    expect(result.killswitches.hourlyAlertsEnabled).toBe(true);
    expect(result.killswitches.solutionGeneratorEnabled).toBe(true);
  });

  it('reflects paused killswitches when SSM params are true', async () => {
    const { service } = buildDeps({
      graderPaused: true,
      classifierPaused: true,
    });
    const result = await service.getStatus();

    expect(result.killswitches.graderEnabled).toBe(false);
    expect(result.killswitches.classifierEnabled).toBe(false);
    expect(result.killswitches.solutionGeneratorEnabled).toBe(true);
    expect(result.killswitches.hourlyAlertsEnabled).toBe(true);
  });

  it('aggregates cost rows into todayUsd and byModel', async () => {
    const { service } = buildDeps({
      costRows: [
        {
          model: 'claude-haiku-4-5',
          calls: 10,
          inputTokens: 5000,
          outputTokens: 2000,
          costUsd: 0.015,
        },
        {
          model: 'claude-sonnet-4-6',
          calls: 3,
          inputTokens: 1000,
          outputTokens: 800,
          costUsd: 0.015,
        },
      ],
    });
    const result = await service.getStatus();

    expect(result.cost.byModel).toHaveLength(2);
    expect(result.cost.todayUsd).toBeCloseTo(0.03);
    const haiku = result.cost.byModel.find(
      (r) => r.model === 'claude-haiku-4-5',
    );
    expect(haiku?.calls).toBe(10);
    expect(haiku?.inputTokens).toBe(5000);
  });

  it('includes pipeline counts from DB', async () => {
    const { service } = buildDeps({ guideCount: 4 });
    const result = await service.getStatus();

    expect(result.pipeline.attemptsLastHour).toBe(5);
    expect(result.pipeline.submissionsLastHour).toBe(3);
    expect(result.pipeline.pendingGuides).toBe(4);
  });

  it('includes all 4 queue keys even when URLs are not set', async () => {
    const { service } = buildDeps();
    const result = await service.getStatus();

    expect(Object.keys(result.queues)).toEqual(
      expect.arrayContaining([
        'guide-ingest',
        'attempt-reprocess',
        'llm-classify',
        'hourly-alerts',
      ]),
    );
  });

  it('sets queue depth to -1 when SQS call fails', async () => {
    const { service, sqs } = buildDeps();
    (sqs.getQueueDepth as jest.Mock).mockResolvedValue(-1);
    const result = await service.getStatus();

    for (const q of Object.values(result.queues)) {
      expect(q.depth).toBe(-1);
    }
  });

  it('returns depth from SQS adapter when available', async () => {
    const { service, sqs } = buildDeps();
    (sqs.getQueueDepth as jest.Mock).mockResolvedValue(7);
    const result = await service.getStatus();

    for (const q of Object.values(result.queues)) {
      expect(q.depth).toBe(7);
    }
  });
});

describe('AdminStatusService — toggleKillswitch', () => {
  function buildToggleDeps() {
    const prisma = {
      ensureConnected: jest.fn().mockResolvedValue(undefined),
      attempt: { count: jest.fn().mockResolvedValue(0) },
      guideSubmission: { count: jest.fn().mockResolvedValue(0) },
      guide: { count: jest.fn().mockResolvedValue(0) },
      costEvent: {
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: null } }),
      },
    } as unknown as PrismaService;

    const sqs = {
      getQueueDepth: jest.fn().mockResolvedValue(0),
    } as unknown as SqsAdapter;

    const ssm = {
      isParamTrue: jest.fn().mockResolvedValue(false),
      putParam: jest.fn().mockResolvedValue(undefined),
    } as unknown as SsmAdapter;

    return { service: new AdminStatusService(prisma, sqs, ssm), ssm };
  }

  it('writes "false" to SSM param when enabled=true (grader)', async () => {
    const { service, ssm } = buildToggleDeps();
    const result = await service.toggleKillswitch('graderEnabled', true);
    expect(ssm.putParam as jest.Mock).toHaveBeenCalledWith(
      '/innova/guides/grading_paused',
      'false',
    );
    expect(result).toEqual({ key: 'graderEnabled', enabled: true });
  });

  it('writes "true" to SSM param when enabled=false (pause classifier)', async () => {
    const { service, ssm } = buildToggleDeps();
    await service.toggleKillswitch('classifierEnabled', false);
    expect(ssm.putParam as jest.Mock).toHaveBeenCalledWith(
      '/innova/llm/paused',
      'true',
    );
  });

  it('writes "false" to SSM param when enabling solution generator', async () => {
    const { service, ssm } = buildToggleDeps();
    await service.toggleKillswitch('solutionGeneratorEnabled', true);
    expect(ssm.putParam as jest.Mock).toHaveBeenCalledWith(
      '/innova/guides/solution_paused',
      'false',
    );
  });

  it('throws on unknown killswitch key', async () => {
    const { service } = buildToggleDeps();
    await expect(service.toggleKillswitch('unknownKey', true)).rejects.toThrow(
      /Unknown killswitch key/,
    );
  });

  it('returns the key and enabled value on success', async () => {
    const { service } = buildToggleDeps();
    const result = await service.toggleKillswitch('classifierEnabled', false);
    expect(result.key).toBe('classifierEnabled');
    expect(result.enabled).toBe(false);
  });
});
