import { FractionSameDenomStrategy } from './fraction-same-denom.strategy';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

const makeDto = (
  overrides: Partial<Record<string, unknown>>,
): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    topicCode: 'T-FRAC-SAME-DENOM',
    expectedAnswer: 3,
    studentAnswer: 3,
    rawSteps: [],
    ...overrides,
  }) as unknown as CreateAttemptDto;

describe('FractionSameDenomStrategy', () => {
  let strategy: FractionSameDenomStrategy;

  beforeEach(() => {
    strategy = new FractionSameDenomStrategy();
  });

  it('supports T-FRAC-SAME-DENOM and fractions_addsub_same_denom', () => {
    expect(strategy.supports('T-FRAC-SAME-DENOM')).toBe(true);
    expect(strategy.supports('fractions_addsub_same_denom')).toBe(true);
    expect(strategy.supports('T-SUB-BORROW')).toBe(false);
  });

  it('CORRECT — returns CORRECT when student answer matches expected', () => {
    const result = strategy.classify(
      makeDto({ studentAnswer: 3, expectedAnswer: 3 }),
    );
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBe('CORRECT');
  });

  it('ARITHMETIC_FACT_ERROR — off by 1 from expected', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 3, studentAnswer: 2 }),
    );
    expect(result.errorType).toBe('ARITHMETIC_FACT_ERROR');
  });

  it('IMPROPER_FRACTION_NOT_REDUCED — student answer is integer multiple of expected', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 3, studentAnswer: 6 }),
    );
    expect(result.errorType).toBe('IMPROPER_FRACTION_NOT_REDUCED');
  });

  it('UNCLASSIFIED — no rule matches', () => {
    // 7/3 is not integer, |7-3|=4>1, no rawSteps → UNCLASSIFIED
    const result = strategy.classify(
      makeDto({ expectedAnswer: 3, studentAnswer: 7 }),
    );
    expect(result.errorType).toBe('UNCLASSIFIED');
    expect(result.confidence).toBe(0.0);
  });
});
