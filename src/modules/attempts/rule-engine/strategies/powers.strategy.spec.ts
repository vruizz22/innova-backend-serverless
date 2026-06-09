import { PowerLawsStrategy, RootLawsStrategy } from './powers.strategy';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

const makeDto = (
  overrides: Partial<Record<string, unknown>>,
): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    topicCode: 'T-POW',
    expectedAnswer: 0,
    studentAnswer: 0,
    rawSteps: [],
    ...overrides,
  }) as unknown as CreateAttemptDto;

const step = (expression: string) => [{ expression, isFinal: true }];

describe('PowerLawsStrategy', () => {
  const strategy = new PowerLawsStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('POW_POWER');
  });

  it('CORRECT — 2^3 • 2^2 = 32', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2^3 • 2^2'),
        expectedAnswer: 32,
        studentAnswer: 32,
      }),
    );
    expect(r.errorType).toBe('CORRECT');
  });

  it('PRODUCT_MULTIPLIES_EXPONENTS — 2^3 • 2^2 answered 64', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2^3 • 2^2'),
        expectedAnswer: 32,
        studentAnswer: 64,
      }),
    );
    expect(r.errorType).toBe('POW_POWER_PRODUCT_MULTIPLIES_EXPONENTS_G8');
  });

  it('POWER_OF_POWER_ADDS_EXPONENTS — (2^3)^2 answered 32', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('(2^3)^2'),
        expectedAnswer: 64,
        studentAnswer: 32,
      }),
    );
    expect(r.errorType).toBe('POW_POWER_OF_POWER_ADDS_EXPONENTS_G8');
  });

  it('QUOTIENT_DIVIDES_EXPONENTS — 2^6 : 2^3 answered 4', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2^6 : 2^3'),
        expectedAnswer: 8,
        studentAnswer: 4,
      }),
    );
    expect(r.errorType).toBe('POW_POWER_QUOTIENT_DIVIDES_EXPONENTS_G8');
  });

  it('ZERO_EXPONENT_EQUALS_ZERO — 5^0 answered 0', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('5^0'),
        expectedAnswer: 1,
        studentAnswer: 0,
      }),
    );
    expect(r.errorType).toBe('POW_POWER_ZERO_EXPONENT_EQUALS_ZERO_G8');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('2^3 • 2^2'),
        expectedAnswer: 32,
        studentAnswer: 99,
      }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});

describe('RootLawsStrategy', () => {
  const strategy = new RootLawsStrategy();

  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('POW_ROOT');
  });

  it('CORRECT — √16 = 4', () => {
    const r = strategy.classify(
      makeDto({ rawSteps: step('√16'), expectedAnswer: 4, studentAnswer: 4 }),
    );
    expect(r.errorType).toBe('CORRECT');
  });

  it('OF_SUM_DISTRIBUTES — √(9+16) answered 7', () => {
    const r = strategy.classify(
      makeDto({
        rawSteps: step('√(9+16)'),
        expectedAnswer: 5,
        studentAnswer: 7,
      }),
    );
    expect(r.errorType).toBe('POW_ROOT_OF_SUM_DISTRIBUTES_G9');
  });

  it('SQUARE_ROOT_HALVES_RADICAND — √16 answered 8', () => {
    const r = strategy.classify(
      makeDto({ rawSteps: step('√16'), expectedAnswer: 4, studentAnswer: 8 }),
    );
    expect(r.errorType).toBe('POW_ROOT_SQUARE_ROOT_HALVES_RADICAND_G8');
  });

  it('UNCLASSIFIED', () => {
    const r = strategy.classify(
      makeDto({ rawSteps: step('√16'), expectedAnswer: 4, studentAnswer: 99 }),
    );
    expect(r.errorType).toBe('UNCLASSIFIED');
  });
});
