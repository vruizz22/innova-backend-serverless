import {
  FractionDivisionStrategy,
  FractionMultiplicationStrategy,
} from './fractions-mul-div.strategy';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

const makeDto = (
  overrides: Partial<Record<string, unknown>>,
): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    topicCode: 'T-FRACT',
    expectedAnswer: 0,
    studentAnswer: 0,
    rawSteps: [],
    ...overrides,
  }) as unknown as CreateAttemptDto;

const step = (expression: string) => [{ expression, isFinal: true }];

describe('FractionMultiplicationStrategy', () => {
  const strategy = new FractionMultiplicationStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('FRACT_MUL');
  });

  it('CORRECT — 2/3 × 4/5 = 8/15', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2/3 × 4/5'),
        expectedAnswer: 8 / 15,
        studentAnswer: 8 / 15,
      }),
    );
    expect(r.errorType).toBe('CORRECT');
  });

  it('CROSS_MULTIPLIES — 2/3 × 4/5 answered 10/12', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2/3 × 4/5'),
        expectedAnswer: 8 / 15,
        studentAnswer: 10 / 12,
      }),
    );
    expect(r.errorType).toBe('FRACT_MUL_CROSS_MULTIPLIES_G6');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2/3 × 4/5'),
        expectedAnswer: 8 / 15,
        studentAnswer: 0.1,
      }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});

describe('FractionDivisionStrategy', () => {
  const strategy = new FractionDivisionStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('FRACT_DIV');
  });

  it('CORRECT — (2/3) : (4/5) = 10/12', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2/3 : 4/5'),
        expectedAnswer: 10 / 12,
        studentAnswer: 10 / 12,
      }),
    );
    expect(r.errorType).toBe('CORRECT');
  });

  it('NO_RECIPROCAL — straight across answered 8/15', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2/3 : 4/5'),
        expectedAnswer: 10 / 12,
        studentAnswer: 8 / 15,
      }),
    );
    expect(r.errorType).toBe('FRACT_DIV_NO_RECIPROCAL_G7');
  });

  it('INVERTS_FIRST_FRACTION — answered 12/10', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2/3 : 4/5'),
        expectedAnswer: 10 / 12,
        studentAnswer: 12 / 10,
      }),
    );
    expect(r.errorType).toBe('FRACT_DIV_INVERTS_FIRST_FRACTION_G7');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2/3 : 4/5'),
        expectedAnswer: 10 / 12,
        studentAnswer: 0.1,
      }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});
