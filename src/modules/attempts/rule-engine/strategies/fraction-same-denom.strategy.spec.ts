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

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('FRACT_ADDSUB');
  });

  it('CORRECT — returns CORRECT when student answer matches expected', () => {
    const result = strategy.classify(
      makeDto({ studentAnswer: 3, expectedAnswer: 3 }),
    );
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBe('CORRECT');
  });

  it('ARITH_TRANSV_FACT_ERROR — off by 1 from expected', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 3, studentAnswer: 2 }),
    );
    expect(result.errorType).toBe('ARITH_TRANSV_FACT_ERROR');
  });

  it('FRACT_ADDSUB_IMPROPER_NOT_REDUCED_G5 — student answer is integer multiple of expected', () => {
    const result = strategy.classify(
      makeDto({ expectedAnswer: 3, studentAnswer: 6 }),
    );
    expect(result.errorType).toBe('FRACT_ADDSUB_IMPROPER_NOT_REDUCED_G5');
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
