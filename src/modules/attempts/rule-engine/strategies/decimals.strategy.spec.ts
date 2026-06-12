import {
  DecimalAdditionStrategy,
  DecimalDivisionStrategy,
  DecimalMultiplicationStrategy,
  DecimalSubtractionStrategy,
} from './decimals.strategy';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

const makeDto = (
  overrides: Partial<Record<string, unknown>>,
): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    topicCode: 'T-DEC',
    expectedAnswer: 0,
    studentAnswer: 0,
    rawSteps: [],
    ...overrides,
  }) as unknown as CreateAttemptDto;

const step = (expression: string) => [{ expression, isFinal: true }];

describe('DecimalAdditionStrategy', () => {
  const strategy = new DecimalAdditionStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('DEC_ADD');
  });

  it('CORRECT — 2,5 + 1,25 = 3,75', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2,5 + 1,25'),
        expectedAnswer: 3.75,
        studentAnswer: 3.75,
      }),
    );
    expect(r.errorType).toBe('CORRECT');
  });

  it('RIGHT_ALIGNED_LIKE_INTEGERS — 2,5 + 1,25 answered 1,5', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2,5 + 1,25'),
        expectedAnswer: 3.75,
        studentAnswer: 1.5,
      }),
    );
    expect(r.errorType).toBe('DEC_ADD_RIGHT_ALIGNED_LIKE_INTEGERS_G5');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2,5 + 1,25'),
        expectedAnswer: 3.75,
        studentAnswer: 9.99,
      }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});

describe('DecimalSubtractionStrategy', () => {
  const strategy = new DecimalSubtractionStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('DEC_SUB');
  });

  it('MISALIGNED_POINTS — 5,25 - 1,5 answered 5,1', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('5,25 - 1,5'),
        expectedAnswer: 3.75,
        studentAnswer: 5.1,
      }),
    );
    expect(r.errorType).toBe('DEC_SUB_MISALIGNED_POINTS_G5');
  });

  it('CORRECT', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('5,25 - 1,5'),
        expectedAnswer: 3.75,
        studentAnswer: 3.75,
      }),
    );
    expect(r.errorType).toBe('CORRECT');
  });
});

describe('DecimalMultiplicationStrategy', () => {
  const strategy = new DecimalMultiplicationStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('DEC_MUL');
  });

  it('POINT_PLACEMENT_ERROR — 0,3 × 0,2 answered 6', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('0,3 × 0,2'),
        expectedAnswer: 0.06,
        studentAnswer: 6,
      }),
    );
    expect(r.errorType).toBe('DEC_MUL_POINT_PLACEMENT_ERROR_G6');
  });

  it('BY_POWER_TEN_POINT_WRONG_DIRECTION — 3,5 × 0,1 answered 35', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('3,5 × 0,1'),
        expectedAnswer: 0.35,
        studentAnswer: 35,
      }),
    );
    expect(r.errorType).toBe('DEC_MUL_BY_POWER_TEN_POINT_WRONG_DIRECTION_G6');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('0,3 × 0,2'),
        expectedAnswer: 0.06,
        studentAnswer: 0.07,
      }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});

describe('DecimalDivisionStrategy', () => {
  const strategy = new DecimalDivisionStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('DEC_DIV');
  });

  it('DIVISOR_DECIMAL_NOT_SHIFTED — 6 : 0,2 answered 3', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('6 : 0,2'),
        expectedAnswer: 30,
        studentAnswer: 3,
      }),
    );
    expect(r.errorType).toBe('DEC_DIV_DIVISOR_DECIMAL_NOT_SHIFTED_G6');
  });

  it('POINT_IGNORED — 1,2 : 4 answered 3', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('1,2 : 4'),
        expectedAnswer: 0.3,
        studentAnswer: 3,
      }),
    );
    expect(r.errorType).toBe('DEC_DIV_POINT_IGNORED_G6');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('6 : 0,2'),
        expectedAnswer: 30,
        studentAnswer: 31,
      }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});
