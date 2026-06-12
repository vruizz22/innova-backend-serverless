import { LinearEquationStrategy } from './algebra-eq-linear.strategy';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

const makeDto = (
  overrides: Partial<Record<string, unknown>>,
): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    topicCode: 'T-ALG',
    expectedAnswer: 0,
    studentAnswer: 0,
    rawSteps: [],
    ...overrides,
  }) as unknown as CreateAttemptDto;

const step = (expression: string) => [{ expression, isFinal: true }];

describe('LinearEquationStrategy', () => {
  const strategy = new LinearEquationStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('ALGEBRA_EQ_LINEAR');
  });

  it('CORRECT — 2x + 3 = 11 → 4', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2x + 3 = 11'),
        expectedAnswer: 4,
        studentAnswer: 4,
      }),
    );
    expect(r.errorType).toBe('CORRECT');
  });

  it('SIGN_FLIP_TRANSPOSE — 2x + 3 = 11 answered 7', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2x + 3 = 11'),
        expectedAnswer: 4,
        studentAnswer: 7,
      }),
    );
    expect(r.errorType).toBe('ALGEBRA_EQ_LINEAR_SIGN_FLIP_TRANSPOSE_G8');
  });

  it('DIVIDES_ONE_TERM — 2x + 3 = 11 answered 2,5', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2x + 3 = 11'),
        expectedAnswer: 4,
        studentAnswer: 2.5,
      }),
    );
    expect(r.errorType).toBe('ALGEBRA_EQ_LINEAR_DIVIDES_ONE_TERM_G8');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2x + 3 = 11'),
        expectedAnswer: 4,
        studentAnswer: 99,
      }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});
