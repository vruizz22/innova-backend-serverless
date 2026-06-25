import { AttemptStepDto } from '@modules/attempts/dto/create-attempt.dto';

/** One exercise detected on a worksheet photo — a page may hold several. */
export interface OcrExercise {
  /** The problem statement only, e.g. "-8 + 5 - (-3)" (no student work). */
  problem: string;
  /** The student's worked steps in order (last line is the final answer). */
  rawSteps: AttemptStepDto[];
  finalAnswer: string;
  topicHint: string | null;
  confidence: number;
}

export interface MathOCRResult {
  /** Overall confidence across the page — the orchestrator picks the provider by this. */
  confidence: number;
  exercises: OcrExercise[];
}

export interface MathOCRPort {
  extract(imageBytes: Buffer): Promise<MathOCRResult>;
}
