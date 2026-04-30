import { SubtractionBorrowStrategy } from './subtraction-borrow.strategy';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

const makeDto = (overrides: Partial<CreateAttemptDto>): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    skillKey: 'subtraction_borrow',
    expectedAnswer: 27,
    studentAnswer: 27,
    rawSteps: [],
    minuend: 53,
    subtrahend: 26,
    ...overrides,
  }) as CreateAttemptDto;

describe('SubtractionBorrowStrategy', () => {
  let strategy: SubtractionBorrowStrategy;

  beforeEach(() => {
    strategy = new SubtractionBorrowStrategy();
  });

  it('supports subtraction_borrow skill key', () => {
    expect(strategy.supports('subtraction_borrow')).toBe(true);
    expect(strategy.supports('other_skill')).toBe(false);
  });

  it('CORRECT — returns CORRECT when student answer matches expected', () => {
    const result = strategy.classify(
      makeDto({ studentAnswer: 27, expectedAnswer: 27 }),
    );
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBe('CORRECT');
    expect(result.confidence).toBe(1.0);
  });

  it('SUBTRAHEND_MINUEND_SWAPPED — student computed subtrahend - minuend', () => {
    // minuend=26, subtrahend=53 → expected=-27 impossible, so student gives 53-26=27
    const result = strategy.classify(
      makeDto({
        minuend: 26,
        subtrahend: 53,
        expectedAnswer: -27,
        studentAnswer: 27,
      }),
    );
    expect(result.errorType).toBe('SUBTRAHEND_MINUEND_SWAPPED');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('BORROW_OMITTED_TENS — 53-26 student writes 33 (column by column no borrow)', () => {
    // noBorrow: |3-6|=3 + 50-20=30 → 33
    const result = strategy.classify(
      makeDto({
        minuend: 53,
        subtrahend: 26,
        expectedAnswer: 27,
        studentAnswer: 33,
      }),
    );
    expect(result.errorType).toBe('BORROW_OMITTED_TENS');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('DIGIT_TRANSPOSITION — answer has correct digits but swapped', () => {
    // expected=27, student writes 72
    const result = strategy.classify(
      makeDto({
        minuend: 53,
        subtrahend: 26,
        expectedAnswer: 27,
        studentAnswer: 72,
      }),
    );
    expect(result.errorType).toBe('DIGIT_TRANSPOSITION');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('PLACE_VALUE_ERROR — answer is factor-of-10 off', () => {
    // expected=27, student writes 270
    const result = strategy.classify(
      makeDto({
        minuend: 53,
        subtrahend: 26,
        expectedAnswer: 27,
        studentAnswer: 270,
      }),
    );
    expect(result.errorType).toBe('PLACE_VALUE_ERROR');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('BASIC_FACT_ERROR — answer differs by ≤2 from expected', () => {
    // expected=27, student writes 25 (off by 2)
    const result = strategy.classify(
      makeDto({
        minuend: 53,
        subtrahend: 26,
        expectedAnswer: 27,
        studentAnswer: 25,
      }),
    );
    expect(result.errorType).toBe('BASIC_FACT_ERROR');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('BORROW_FROM_ZERO_ERROR — detected for numbers with zero in tens', () => {
    // 100 - 27 = 73; student with zero borrow issue
    const result = strategy.classify(
      makeDto({
        minuend: 100,
        subtrahend: 27,
        expectedAnswer: 73,
        studentAnswer: 83,
      }),
    );
    expect(result.errorType).toBe('BORROW_FROM_ZERO_ERROR');
  });

  it('UNCLASSIFIED — no rule matches', () => {
    const result = strategy.classify(
      makeDto({
        minuend: 53,
        subtrahend: 26,
        expectedAnswer: 27,
        studentAnswer: 99,
      }),
    );
    expect(result.errorType).toBe('UNCLASSIFIED');
    expect(result.confidence).toBe(0.0);
  });
});
