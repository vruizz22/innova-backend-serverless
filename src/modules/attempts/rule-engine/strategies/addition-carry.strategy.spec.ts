import { AdditionCarryStrategy } from './addition-carry.strategy';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

const makeDto = (
  overrides: Partial<Record<string, unknown>>,
): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    topicCode: 'T-ADD-CARRY',
    expectedAnswer: 65,
    studentAnswer: 65,
    rawSteps: [],
    minuend: 38,
    subtrahend: 27,
    ...overrides,
  }) as unknown as CreateAttemptDto;

describe('AdditionCarryStrategy', () => {
  let strategy: AdditionCarryStrategy;

  beforeEach(() => {
    strategy = new AdditionCarryStrategy();
  });

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('ARITH_ADD');
  });

  it('CORRECT — returns CORRECT when student answer matches expected', () => {
    const result = strategy.classify(
      makeDto({ studentAnswer: 65, expectedAnswer: 65 }),
    );
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBe('CORRECT');
    expect(result.confidence).toBe(1.0);
  });

  it('CARRY_OMITTED — 38+27 student writes 55 (no carry from units)', () => {
    // 8+7=15, no carry: units=5 tens=3+2=5 → 55
    const result = strategy.classify(
      makeDto({
        minuend: 38,
        subtrahend: 27,
        expectedAnswer: 65,
        studentAnswer: 55,
      }),
    );
    expect(result.errorType).toBe('ARITH_ADD_CARRY_OMITTED_G3');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('ARITH_TRANSV_DIGIT_TRANSPOSITION — answer has correct digits but swapped', () => {
    const result = strategy.classify(
      makeDto({
        minuend: 38,
        subtrahend: 27,
        expectedAnswer: 65,
        studentAnswer: 56,
      }),
    );
    expect(result.errorType).toBe('ARITH_TRANSV_DIGIT_TRANSPOSITION');
  });

  it('ARITH_TRANSV_FACT_ERROR — off by ≤2 from expected', () => {
    const result = strategy.classify(
      makeDto({
        minuend: 38,
        subtrahend: 27,
        expectedAnswer: 65,
        studentAnswer: 64,
      }),
    );
    expect(result.errorType).toBe('ARITH_TRANSV_FACT_ERROR');
  });

  it('UNCLASSIFIED — no rule matches', () => {
    const result = strategy.classify(
      makeDto({
        minuend: 38,
        subtrahend: 27,
        expectedAnswer: 65,
        studentAnswer: 99,
      }),
    );
    expect(result.errorType).toBe('UNCLASSIFIED');
  });
});
