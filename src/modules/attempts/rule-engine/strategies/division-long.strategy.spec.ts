import { DivisionLongStrategy } from './division-long.strategy';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

const makeDto = (
  overrides: Partial<Record<string, unknown>>,
): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    topicCode: 'T-DIV',
    expectedAnswer: 21,
    studentAnswer: 21,
    rawSteps: [],
    minuend: 84,
    subtrahend: 4,
    ...overrides,
  }) as unknown as CreateAttemptDto;

describe('DivisionLongStrategy', () => {
  let strategy: DivisionLongStrategy;

  beforeEach(() => {
    strategy = new DivisionLongStrategy();
  });

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('ARITH_DIV');
  });

  it('CORRECT — student answer matches expected', () => {
    const result = strategy.classify(
      makeDto({ studentAnswer: 21, expectedAnswer: 21 }),
    );
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBe('CORRECT');
  });

  it('DIVISOR_DIVIDEND_SWAPPED — 84÷4 answered as 0 (4÷84)', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 21, studentAnswer: 0 }),
    );
    expect(result.errorType).toBe('ARITH_DIV_DIVISOR_DIVIDEND_SWAPPED_G4');
  });

  it('QUOTIENT_ZERO_SKIPPED — 420÷4 expected 105 answered 15', () => {
    const result = strategy.classify(
      makeDto({
        minuend: 420,
        subtrahend: 4,
        expectedAnswer: 105,
        studentAnswer: 15,
      }),
    );
    expect(result.errorType).toBe('ARITH_DIV_QUOTIENT_ZERO_SKIPPED_G5');
  });

  it('PARTIAL_QUOTIENT_TOO_LARGE — overestimated by one', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 21, studentAnswer: 22 }),
    );
    expect(result.errorType).toBe('ARITH_DIV_PARTIAL_QUOTIENT_TOO_LARGE_G5');
  });

  it('REMAINDER_GE_DIVISOR — underestimated by one', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 21, studentAnswer: 20 }),
    );
    expect(result.errorType).toBe('ARITH_DIV_REMAINDER_GE_DIVISOR_G4');
  });

  it('DIGIT_TRANSPOSITION — 84÷4 expected 21 answered 12', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 21, studentAnswer: 12 }),
    );
    expect(result.errorType).toBe('ARITH_TRANSV_DIGIT_TRANSPOSITION');
  });

  it('PLACE_VALUE_ERROR — answer shifted by factor of 10', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 21, studentAnswer: 210 }),
    );
    expect(result.errorType).toBe('ARITH_TRANSV_PLACE_VALUE_ERROR');
  });

  it('parses operands from the step expression (Chilean : operator)', () => {
    const result = strategy.classify(
      makeDto({
        minuend: undefined,
        subtrahend: undefined,
        rawSteps: [{ expression: '96 : 8 = 11', isFinal: true }],
        expectedAnswer: 12,
        studentAnswer: 11,
      }),
    );
    expect(result.errorType).toBe('ARITH_DIV_REMAINDER_GE_DIVISOR_G4');
  });

  it('UNCLASSIFIED — no rule matches', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 21, studentAnswer: 99 }),
    );
    expect(result.errorType).toBe('UNCLASSIFIED');
  });
});
