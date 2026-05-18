import { RuleEngineService } from '@modules/attempts/rule-engine/engine.service';
import { RuleEngineFactory } from '@modules/attempts/rule-engine/factory';
import { SubtractionBorrowStrategy } from '@modules/attempts/rule-engine/strategies/subtraction-borrow.strategy';
import { AdditionCarryStrategy } from '@modules/attempts/rule-engine/strategies/addition-carry.strategy';
import { FractionSameDenomStrategy } from '@modules/attempts/rule-engine/strategies/fraction-same-denom.strategy';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';

const makeDto = (
  overrides: Partial<Record<string, unknown>>,
): CreateAttemptDto =>
  ({
    studentId: 'student-1',
    topicCode: 'T-SUB-BORROW',
    expectedAnswer: 27,
    studentAnswer: 27,
    rawSteps: [],
    minuend: 53,
    subtrahend: 26,
    ...overrides,
  }) as unknown as CreateAttemptDto;

function buildService(): RuleEngineService {
  const strategy = new SubtractionBorrowStrategy();
  const addCarry = new AdditionCarryStrategy();
  const fracSame = new FractionSameDenomStrategy();
  const factory = new RuleEngineFactory(strategy, addCarry, fracSame);
  return new RuleEngineService(factory);
}

describe('RuleEngineService', () => {
  let service: RuleEngineService;

  beforeEach(() => {
    service = buildService();
  });

  it('delegates to SubtractionBorrowStrategy for T-SUB-BORROW', () => {
    const result = service.classify(
      makeDto({
        topicCode: 'T-SUB-BORROW',
        studentAnswer: 27,
        expectedAnswer: 27,
      }),
    );
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBe('CORRECT');
  });

  it('classifies BORROW_OMITTED_TENS via rule engine', () => {
    const result = service.classify(
      makeDto({
        topicCode: 'T-SUB-BORROW',
        studentAnswer: 33,
        expectedAnswer: 27,
      }),
    );
    expect(result.isCorrect).toBe(false);
    expect(result.errorType).toBe('BORROW_OMITTED_TENS');
  });

  it('delegates to AdditionCarryStrategy for T-ADD-CARRY', () => {
    const result = service.classify(
      makeDto({
        topicCode: 'T-ADD-CARRY',
        minuend: 38,
        subtrahend: 27,
        expectedAnswer: 65,
        studentAnswer: 65,
      }),
    );
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBe('CORRECT');
  });

  it('delegates to FractionSameDenomStrategy for T-FRAC-SAME-DENOM', () => {
    const result = service.classify(
      makeDto({
        topicCode: 'T-FRAC-SAME-DENOM',
        expectedAnswer: 3,
        studentAnswer: 3,
        rawSteps: [],
      }),
    );
    expect(result.isCorrect).toBe(true);
  });

  it('falls back to subtraction strategy for unknown topic codes', () => {
    const result = service.classify(
      makeDto({
        topicCode: 'UNKNOWN_TOPIC',
        studentAnswer: 27,
        expectedAnswer: 27,
      }),
    );
    expect(result.isCorrect).toBe(true);
  });
});
