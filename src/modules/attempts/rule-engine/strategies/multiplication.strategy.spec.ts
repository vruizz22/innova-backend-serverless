import { MultiplicationStrategy } from './multiplication.strategy';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

const makeDto = (
  overrides: Partial<Record<string, unknown>>,
): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    topicCode: 'T-MUL',
    expectedAnswer: 56,
    studentAnswer: 56,
    rawSteps: [],
    minuend: 7,
    subtrahend: 8,
    ...overrides,
  }) as unknown as CreateAttemptDto;

describe('MultiplicationStrategy', () => {
  let strategy: MultiplicationStrategy;

  beforeEach(() => {
    strategy = new MultiplicationStrategy();
  });

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('ARITH_MUL');
  });

  it('CORRECT — student answer matches expected', () => {
    const result = strategy.classify(
      makeDto({ studentAnswer: 56, expectedAnswer: 56 }),
    );
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBe('CORRECT');
  });

  it('ZERO_TIMES_N — 0×5 written as 5', () => {
    const result = strategy.classify(
      makeDto({
        minuend: 0,
        subtrahend: 5,
        expectedAnswer: 0,
        studentAnswer: 5,
      }),
    );
    expect(result.errorType).toBe('ARITH_MUL_ZERO_TIMES_N_EQUALS_N_G3');
  });

  it('ADD_INSTEAD — 7×8 answered as 15', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 56, studentAnswer: 15 }),
    );
    expect(result.errorType).toBe('ARITH_MUL_ADD_INSTEAD_G3');
  });

  it('BY_POWER_OF_TEN_NO_ZEROS — 34×100 answered as 34', () => {
    const result = strategy.classify(
      makeDto({
        minuend: 34,
        subtrahend: 100,
        expectedAnswer: 3400,
        studentAnswer: 34,
      }),
    );
    expect(result.errorType).toBe('ARITH_MUL_BY_POWER_OF_TEN_NO_ZEROS_G4');
  });

  it('TABLE_RECALL_ERROR — 7×8 answered as 49 (off by one row)', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 56, studentAnswer: 49 }),
    );
    expect(result.errorType).toBe('ARITH_MUL_TABLE_RECALL_ERROR_G3');
  });

  it('PARTIAL_NOT_SHIFTED — 12×13 partials added without shift → 48', () => {
    const result = strategy.classify(
      makeDto({
        minuend: 12,
        subtrahend: 13,
        expectedAnswer: 156,
        studentAnswer: 48,
      }),
    );
    expect(result.errorType).toBe('ARITH_MUL_PARTIAL_NOT_SHIFTED_G5');
  });

  it('DIGIT_TRANSPOSITION — 7×8 answered as 65', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 56, studentAnswer: 65 }),
    );
    expect(result.errorType).toBe('ARITH_TRANSV_DIGIT_TRANSPOSITION');
  });

  it('PLACE_VALUE_ERROR — answer shifted by factor of 10', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 56, studentAnswer: 560 }),
    );
    expect(result.errorType).toBe('ARITH_TRANSV_PLACE_VALUE_ERROR');
  });

  it('parses operands from the step expression (Chilean • operator)', () => {
    const result = strategy.classify(
      makeDto({
        minuend: undefined,
        subtrahend: undefined,
        rawSteps: [{ expression: '9 • 6 = 15', isFinal: true }],
        expectedAnswer: 54,
        studentAnswer: 15,
      }),
    );
    expect(result.errorType).toBe('ARITH_MUL_ADD_INSTEAD_G3');
  });

  it('UNCLASSIFIED — no rule matches', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 56, studentAnswer: 99 }),
    );
    expect(result.errorType).toBe('UNCLASSIFIED');
  });
});
