import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

export interface RuleClassificationResult {
  isCorrect: boolean;
  errorType:
    | 'CORRECT'
    | 'BORROW_OMITTED'
    | 'BORROW_OMITTED_TENS'
    | 'BORROW_OMITTED_HUNDREDS'
    | 'BORROW_FROM_ZERO_ERROR'
    | 'PARTIAL_BORROW_ERROR'
    | 'SIGN_ERROR'
    | 'SUBTRAHEND_MINUEND_SWAPPED'
    | 'PLACE_VALUE_ERROR'
    | 'BASIC_FACT_ERROR'
    | 'DIGIT_TRANSPOSITION'
    | 'UNCLASSIFIED';
  confidence: number;
  evidence?: string[];
}

export interface RuleEngineStrategy {
  supports(skillKey: string): boolean;
  classify(payload: CreateAttemptDto): RuleClassificationResult;
}
