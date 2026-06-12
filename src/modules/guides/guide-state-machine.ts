import { z } from 'zod';

/**
 * Guide lifecycle state machine (ADR-119).
 *
 *   UPLOADED → EXTRACTING → GENERATING_SOLUTIONS → REVIEW → PUBLISHED → ARCHIVED
 *                  │                  │
 *                  ▼                  ▼
 *          EXTRACTION_FAILED   GENERATION_FAILED   (both retryable)
 *
 * Hard rule: nothing is visible to students before PUBLISHED.
 *
 * These are string literals (not the Prisma enum) so the module stays
 * unit-testable without a generated Prisma client.
 */
export const GUIDE_STATUSES = [
  'UPLOADED',
  'EXTRACTING',
  'EXTRACTION_FAILED',
  'GENERATING_SOLUTIONS',
  'GENERATION_FAILED',
  'REVIEW',
  'PUBLISHED',
  'ARCHIVED',
] as const;

export type GuideStatusValue = (typeof GUIDE_STATUSES)[number];

const TRANSITIONS: Record<GuideStatusValue, readonly GuideStatusValue[]> = {
  UPLOADED: ['EXTRACTING', 'ARCHIVED'],
  EXTRACTING: ['GENERATING_SOLUTIONS', 'EXTRACTION_FAILED', 'ARCHIVED'],
  EXTRACTION_FAILED: ['EXTRACTING', 'ARCHIVED'],
  GENERATING_SOLUTIONS: ['REVIEW', 'GENERATION_FAILED', 'ARCHIVED'],
  GENERATION_FAILED: ['EXTRACTING', 'GENERATING_SOLUTIONS', 'ARCHIVED'],
  REVIEW: ['PUBLISHED', 'GENERATING_SOLUTIONS', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

/** Statuses from which `POST /guides/:id/ingest` may (re)start extraction. */
export const INGESTABLE_STATUSES: readonly GuideStatusValue[] = [
  'UPLOADED',
  'EXTRACTION_FAILED',
  'GENERATION_FAILED',
];

export function canTransition(
  from: GuideStatusValue,
  to: GuideStatusValue,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(
  from: GuideStatusValue,
  to: GuideStatusValue,
): void {
  if (!canTransition(from, to)) {
    throw new InvalidGuideTransitionError(from, to);
  }
}

export class InvalidGuideTransitionError extends Error {
  constructor(
    readonly from: GuideStatusValue,
    readonly to: GuideStatusValue,
  ) {
    super(`Invalid guide transition ${from} → ${to}`);
    this.name = 'InvalidGuideTransitionError';
  }
}

// ---------------------------------------------------------------------
// Canonical solution schema (ADR-118) — validates GuideSolution.stepsJson
// ---------------------------------------------------------------------

const solutionStepSchema = z.object({
  idx: z.number().int().nonnegative(),
  latex: z.string().min(1),
  explanation_es: z.string().optional(),
  rule: z.string().optional(),
  checkpoint: z.boolean(),
  expected_error_tags: z.array(z.string()).optional(),
});

const altPathSchema = z.object({
  label: z.string().min(1),
  steps: z.array(solutionStepSchema).min(1),
});

export const canonicalSolutionSchema = z.object({
  final_answer: z.string().min(1),
  points: z.number().nonnegative(),
  steps: z.array(solutionStepSchema).min(1),
  alt_paths: z.array(altPathSchema).optional(),
});

export type CanonicalSolution = z.infer<typeof canonicalSolutionSchema>;

/**
 * A solution is publishable only when at least one alignable checkpoint exists
 * in the main path or an alt_path — alignment is against checkpoints, never a
 * strict step-by-step match.
 */
export function hasCheckpoint(solution: CanonicalSolution): boolean {
  if (solution.steps.some((s) => s.checkpoint)) return true;
  return (solution.alt_paths ?? []).some((p) =>
    p.steps.some((s) => s.checkpoint),
  );
}
