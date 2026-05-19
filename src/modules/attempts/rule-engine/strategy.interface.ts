import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

export interface RuleClassificationResult {
  isCorrect: boolean;
  errorType:
    | 'CORRECT'
    | 'BORROW_OMITTED_TENS'
    | 'BORROW_OMITTED_HUNDREDS'
    | 'BORROW_FROM_ZERO_INCORRECT'
    | 'BORROW_FROM_ZERO_ERROR'
    | 'STOP_BORROW_PROPAGATION'
    | 'PARTIAL_BORROW_ERROR'
    | 'SUBTRAHEND_MINUEND_SWAPPED'
    | 'DIGIT_TRANSPOSITION'
    | 'COLUMN_MISALIGNMENT'
    | 'PLACE_VALUE_ERROR'
    | 'ARITHMETIC_FACT_ERROR'
    | 'BASIC_FACT_ERROR'
    | 'CARRY_OMITTED'
    | 'CARRY_ADDED_TO_WRONG_COLUMN'
    | 'SUM_NUMERATORS_AND_DENOMINATORS'
    | 'IMPROPER_FRACTION_NOT_REDUCED'
    | 'INVERTED_FRACTION'
    | 'WHOLE_NUMBER_LOST'
    | 'UNCLASSIFIED';
  confidence: number;
  evidence?: string[];
}

export interface RuleEngineStrategy {
  supports(topicCode: string): boolean;
  classify(payload: CreateAttemptDto): RuleClassificationResult;
}
