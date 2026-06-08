import { type CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

// errorType will be typed as ErrorTagCode (from error-tags.generated.ts) once codegen runs.
// Until then, it's a string constrained to valid v8 naming convention codes.
export interface RuleClassificationResult {
  isCorrect: boolean;
  errorType: string;
  confidence: number;
  evidence?: string[];
}

export interface RuleEngineStrategy {
  readonly subdomainCode: string;
  classify(payload: CreateAttemptDto): RuleClassificationResult;
}
