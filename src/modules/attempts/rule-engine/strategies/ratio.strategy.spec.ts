import { PercentStrategy, ProportionStrategy } from './ratio.strategy';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

const makeDto = (
  overrides: Partial<Record<string, unknown>>,
): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    topicCode: 'T-RATIO',
    expectedAnswer: 0,
    studentAnswer: 0,
    rawSteps: [],
    ...overrides,
  }) as unknown as CreateAttemptDto;

const step = (expression: string) => [{ expression, isFinal: true }];

describe('PercentStrategy', () => {
  const strategy = new PercentStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('RATIO_PERCENT');
  });

  it('CORRECT — 15% de 200 = 30', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('15% de 200'),
        expectedAnswer: 30,
        studentAnswer: 30,
      }),
    );
    expect(r.errorType).toBe('CORRECT');
  });

  it('DIVIDE_BY_PERCENT — 15% de 200 answered 200/15', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('15% de 200'),
        expectedAnswer: 30,
        studentAnswer: 200 / 15,
      }),
    );
    expect(r.errorType).toBe('RATIO_PERCENT_DIVIDE_BY_PERCENT_G7');
  });

  it('DECIMAL_SHIFT_ERROR — 15% de 200 answered 3', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('15% de 200'),
        expectedAnswer: 30,
        studentAnswer: 3,
      }),
    );
    expect(r.errorType).toBe('RATIO_PERCENT_DECIMAL_SHIFT_ERROR_G7');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('15% de 200'),
        expectedAnswer: 30,
        studentAnswer: 31,
      }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});

describe('ProportionStrategy', () => {
  const strategy = new ProportionStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('RATIO_PROPORTION');
  });

  it('CORRECT — 2:4 = 3:x → 6', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2:4 = 3:x'),
        expectedAnswer: 6,
        studentAnswer: 6,
      }),
    );
    expect(r.errorType).toBe('CORRECT');
  });

  it('ADDITIVE_STRATEGY — 2:4 = 3:x answered 5', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2:4 = 3:x'),
        expectedAnswer: 6,
        studentAnswer: 5,
      }),
    );
    expect(r.errorType).toBe('RATIO_PROPORTION_ADDITIVE_STRATEGY_G7');
  });

  it('CROSS_PRODUCT_ERROR — 2:4 = 3:x answered 1,5', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2:4 = 3:x'),
        expectedAnswer: 6,
        studentAnswer: 1.5,
      }),
    );
    expect(r.errorType).toBe('RATIO_PROPORTION_CROSS_PRODUCT_ERROR_G7');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2:4 = 3:x'),
        expectedAnswer: 6,
        studentAnswer: 99,
      }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});
