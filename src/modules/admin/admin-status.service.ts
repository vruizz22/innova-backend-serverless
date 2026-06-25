import { Injectable } from '@nestjs/common';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { SsmAdapter } from '@adapters/ssm.adapter';
import { PrismaService } from '@infrastructure/database/prisma.service';

export interface QueueStatus {
  depth: number;
  dlqDepth: number;
  processedLastHour: number;
}

export interface CostByModel {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AdminStatusResponse {
  queues: Record<string, QueueStatus>;
  pipeline: {
    attemptsLastHour: number;
    submissionsLastHour: number;
    classifiedLastHour: number;
    pendingGuides: number;
  };
  cost: {
    todayUsd: number;
    monthUsd: number;
    byModel: CostByModel[];
  };
  killswitches: Record<string, boolean>;
}

const QUEUE_DEFS = [
  { key: 'guide-ingest', envVar: 'SQS_GUIDE_INGEST_URL' },
  { key: 'attempt-reprocess', envVar: 'SQS_ATTEMPT_REPROCESS_URL' },
  { key: 'llm-classify', envVar: 'SQS_LLM_CLASSIFY_URL' },
  { key: 'hourly-alerts', envVar: 'SQS_HOURLY_ALERTS_URL' },
] as const;

// SSM parameter names must match innova-ai-engine/src/shared/settings.py
const SSM_GRADER_PAUSED = '/innova/guides/grading_paused';
const SSM_CLASSIFIER_PAUSED = '/innova/llm/paused';
const SSM_SOLUTION_PAUSED = '/innova/guides/solution_paused';

const KILLSWITCH_TO_SSM: Record<string, string> = {
  graderEnabled: SSM_GRADER_PAUSED,
  classifierEnabled: SSM_CLASSIFIER_PAUSED,
  solutionGeneratorEnabled: SSM_SOLUTION_PAUSED,
};

export const VALID_KILLSWITCH_KEYS = Object.keys(
  KILLSWITCH_TO_SSM,
) as ReadonlyArray<string>;

@Injectable()
export class AdminStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sqs: SqsAdapter,
    private readonly ssm: SsmAdapter,
  ) {}

  async getStatus(): Promise<AdminStatusResponse> {
    await this.prisma.ensureConnected();

    const now = new Date();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      queues,
      attemptsLastHour,
      submissionsLastHour,
      classifiedLastHour,
      pendingGuides,
      todayCostRows,
      monthCostRows,
      graderPaused,
      classifierPaused,
      solutionPaused,
    ] = await Promise.all([
      this.getQueueDepths(),
      this.prisma.attempt.count({ where: { createdAt: { gte: oneHourAgo } } }),
      this.prisma.guideSubmission.count({
        where: { createdAt: { gte: oneHourAgo } },
      }),
      this.prisma.attempt.count({
        where: { status: 'CLASSIFIED', classifiedAt: { gte: oneHourAgo } },
      }),
      this.prisma.guide.count({
        where: {
          status: { in: ['EXTRACTING', 'GENERATING_SOLUTIONS', 'REVIEW'] },
        },
      }),
      this.prisma.costEvent.groupBy({
        by: ['model'],
        where: { createdAt: { gte: todayStart } },
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
        _count: { id: true },
      }),
      this.prisma.costEvent.aggregate({
        where: { createdAt: { gte: monthStart } },
        _sum: { costUsd: true },
      }),
      this.ssm.isParamTrue(SSM_GRADER_PAUSED),
      this.ssm.isParamTrue(SSM_CLASSIFIER_PAUSED),
      this.ssm.isParamTrue(SSM_SOLUTION_PAUSED),
    ]);

    const byModel: CostByModel[] = todayCostRows.map((row) => ({
      model: row.model,
      calls: row._count.id,
      inputTokens: row._sum.inputTokens ?? 0,
      outputTokens: row._sum.outputTokens ?? 0,
      costUsd: row._sum.costUsd ?? 0,
    }));

    return {
      queues,
      pipeline: {
        attemptsLastHour,
        submissionsLastHour,
        classifiedLastHour,
        pendingGuides,
      },
      cost: {
        todayUsd: byModel.reduce((s, r) => s + r.costUsd, 0),
        monthUsd: monthCostRows._sum.costUsd ?? 0,
        byModel,
      },
      killswitches: {
        graderEnabled: !graderPaused,
        classifierEnabled: !classifierPaused,
        // hourly_alerts has no SSM killswitch in the ai-engine — always enabled
        hourlyAlertsEnabled: true,
        solutionGeneratorEnabled: !solutionPaused,
      },
    };
  }

  /**
   * Toggle a named killswitch via SSM. `enabled: true` means the worker runs
   * (SSM param = "false"); `enabled: false` pauses it (SSM param = "true").
   * Throws if `key` is not a recognised killswitch.
   */
  async toggleKillswitch(
    key: string,
    enabled: boolean,
  ): Promise<{ key: string; enabled: boolean }> {
    const paramName = KILLSWITCH_TO_SSM[key];
    if (!paramName) {
      const valid = Object.keys(KILLSWITCH_TO_SSM).join(', ');
      throw new Error(`Unknown killswitch key "${key}". Valid keys: ${valid}`);
    }
    // Param stores whether the worker is *paused* — invert of `enabled`
    await this.ssm.putParam(paramName, enabled ? 'false' : 'true');
    return { key, enabled };
  }

  private async getQueueDepths(): Promise<Record<string, QueueStatus>> {
    const entries = await Promise.all(
      QUEUE_DEFS.map(async ({ key, envVar }) => {
        const url = process.env[envVar] ?? '';
        const depth = await this.sqs.getQueueDepth(url);
        const status: QueueStatus = {
          depth,
          dlqDepth: 0,
          processedLastHour: 0,
        };
        return [key, status] as const;
      }),
    );
    return Object.fromEntries(entries);
  }
}
