/**
 * Typed SQS message contracts for the v9 guides pipeline.
 *
 * Source of truth: `.github/instructions/06c-guide-pipeline.md` §6c.4 and
 * `docs/PLAN_v9_ADDENDUM.md` §S11.3. No PII in bodies — only UUIDs, never
 * student names/emails (CLAUDE.md §7).
 */

/** backend → ai-engine: `guide-ingest-queue`. */
export interface GuideIngestMessage {
  guide_id: string;
  source_pdf_key: string;
  course_grade_level: number;
  trace_id: string;
}

/**
 * ai-engine → ai-engine (or backend for single-question regeneration):
 * `solution-generation-queue`. `guide_question_id: null` = whole guide.
 */
export interface SolutionGenMessage {
  guide_id: string;
  guide_question_id: string | null;
  trace_id: string;
}

/** backend → ai-engine: `submission-grade-queue`. */
export interface SubmissionGradeMessage {
  guide_submission_id: string;
  guide_question_id: string;
  solution_version: number;
  photo_keys: string[];
  trace_id: string;
}

/**
 * ai-engine → backend: extended `attempt-reprocess-queue` contract.
 * Retro-compatible: legacy OCR-loop messages carry `attempt_id` and omit the
 * `guide_*` / `alignment_summary` fields. When `guide_submission_id` is present
 * the worker creates a new Attempt(inputMode='PHOTO_GUIDE') instead of updating
 * an existing one (ADR-120/121).
 */
export interface AttemptReprocessMessage {
  attempt_id: string | null;
  latex_steps: string[];
  provider: string;
  confidence: number;
  trace_id: string;
  guide_submission_id?: string;
  guide_question_id?: string;
  alignment_summary?: {
    path: string;
    first_error_checkpoint: number | null;
    score_0_1: number;
  };
}
