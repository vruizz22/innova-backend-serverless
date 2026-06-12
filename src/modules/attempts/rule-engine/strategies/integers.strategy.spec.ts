import {
  IntAdditionStrategy,
  IntMultiplicationStrategy,
  IntSubtractionStrategy,
} from './integers.strategy';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

const makeDto = (
  overrides: Partial<Record<string, unknown>>,
): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    topicCode: 'T-INT',
    expectedAnswer: 0,
    studentAnswer: 0,
    rawSteps: [],
    ...overrides,
  }) as unknown as CreateAttemptDto;

describe('IntAdditionStrategy', () => {
  const strategy = new IntAdditionStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('INT_ADD');
  });

  it('CORRECT — -3 + 5 = 2', () => {
    const r = strategy.classify(
      makeDto({
        minuend: -3,
        subtrahend: 5,
        expectedAnswer: 2,
        studentAnswer: 2,
      }),
    );
    expect(r.errorType).toBe('CORRECT');
  });

  it('SAME_SIGN_SUBTRACTS — -3 + -5 answered -2', () => {
    const r = strategy.classify(
      makeDto({
        minuend: -3,
        subtrahend: -5,
        expectedAnswer: -8,
        studentAnswer: -2,
      }),
    );
    expect(r.errorType).toBe('INT_ADD_SAME_SIGN_SUBTRACTS_G7');
  });

  it('DIFF_SIGN_ADDS_MAGNITUDES — -3 + 5 answered 8', () => {
    const r = strategy.classify(
      makeDto({
        minuend: -3,
        subtrahend: 5,
        expectedAnswer: 2,
        studentAnswer: 8,
      }),
    );
    expect(r.errorType).toBe('INT_ADD_DIFF_SIGN_ADDS_MAGNITUDES_G7');
  });

  it('KEEPS_WRONG_SIGN — -3 + 5 answered -2', () => {
    const r = strategy.classify(
      makeDto({
        minuend: -3,
        subtrahend: 5,
        expectedAnswer: 2,
        studentAnswer: -2,
      }),
    );
    expect(r.errorType).toBe('INT_ADD_KEEPS_WRONG_SIGN_G7');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({
        minuend: -3,
        subtrahend: 5,
        expectedAnswer: 2,
        studentAnswer: 99,
      }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});

describe('IntSubtractionStrategy', () => {
  const strategy = new IntSubtractionStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('INT_SUB');
  });

  it('DOUBLE_NEGATIVE_NOT_APPLIED — 5 - (-3) answered 2', () => {
    const r = strategy.classify(
      makeDto({
        minuend: 5,
        subtrahend: -3,
        expectedAnswer: 8,
        studentAnswer: 2,
      }),
    );
    expect(r.errorType).toBe('INT_SUB_DOUBLE_NEGATIVE_NOT_APPLIED_G7');
  });

  it('parses operands from expression (5 - (-3))', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: [{ expression: '5 - (-3) = 2', isFinal: true }],
        expectedAnswer: 8,
        studentAnswer: 2,
      }),
    );
    expect(r.errorType).toBe('INT_SUB_DOUBLE_NEGATIVE_NOT_APPLIED_G7');
  });

  it('AS_ADD_SIGN_ERROR — 7 - 3 answered 10', () => {
    const r = strategy.classify(
      makeDto({
        minuend: 7,
        subtrahend: 3,
        expectedAnswer: 4,
        studentAnswer: 10,
      }),
    );
    expect(r.errorType).toBe('INT_SUB_AS_ADD_SIGN_ERROR_G7');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({
        minuend: 7,
        subtrahend: 3,
        expectedAnswer: 4,
        studentAnswer: 99,
      }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});

describe('IntMultiplicationStrategy', () => {
  const strategy = new IntMultiplicationStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('INT_MUL');
  });

  it('NEG_TIMES_NEG_IS_NEG — -4 × -6 answered -24', () => {
    const r = strategy.classify(
      makeDto({
        minuend: -4,
        subtrahend: -6,
        expectedAnswer: 24,
        studentAnswer: -24,
      }),
    );
    expect(r.errorType).toBe('INT_SIGN_NEG_TIMES_NEG_IS_NEG_G7');
  });

  it('NEG_TIMES_POS_IS_POS — -4 × 6 answered 24', () => {
    const r = strategy.classify(
      makeDto({
        minuend: -4,
        subtrahend: 6,
        expectedAnswer: -24,
        studentAnswer: 24,
      }),
    );
    expect(r.errorType).toBe('INT_SIGN_NEG_TIMES_POS_IS_POS_G7');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({
        minuend: -4,
        subtrahend: 6,
        expectedAnswer: -24,
        studentAnswer: 99,
      }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});
