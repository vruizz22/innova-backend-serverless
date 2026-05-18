import { RuleEngineService } from '@modules/attempts/rule-engine/engine.service';
import { RuleEngineFactory } from '@modules/attempts/rule-engine/factory';
import { SubtractionBorrowStrategy } from '@modules/attempts/rule-engine/strategies/subtraction-borrow.strategy';
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

describe('RuleEngineService', () => {
  let service: RuleEngineService;

  beforeEach(() => {
    const strategy = new SubtractionBorrowStrategy();
    const factory = new RuleEngineFactory(strategy);
    service = new RuleEngineService(factory);
  });

  it('delegates to SubtractionBorrowStrategy for subtraction_borrow', () => {
    const result = service.classify(
      makeDto({ studentAnswer: 27, expectedAnswer: 27 }),
    );
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBe('CORRECT');
  });

  it('classifies incorrect answer via rule engine', () => {
    const result = service.classify(
      makeDto({ studentAnswer: 33, expectedAnswer: 27 }),
    );
    expect(result.isCorrect).toBe(false);
    expect(result.errorType).toBe('BORROW_OMITTED_TENS');
  });

  it('falls back to subtraction strategy for unknown skill keys', () => {
    const result = service.classify(
      makeDto({ skillKey: 'unknown_skill', studentAnswer: 27 }),
    );
    // Factory falls back to subtractionBorrowStrategy, which returns CORRECT since 27===27
    expect(result.isCorrect).toBe(true);
  });
});
