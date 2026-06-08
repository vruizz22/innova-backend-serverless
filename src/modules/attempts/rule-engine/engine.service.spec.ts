import { type CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import { RuleEngineFactory } from '@modules/attempts/rule-engine/factory';
import { RuleEngineService } from '@modules/attempts/rule-engine/engine.service';

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
  return new RuleEngineService(new RuleEngineFactory());
}

describe('RuleEngineService', () => {
  let service: RuleEngineService;

  beforeEach(() => {
    service = buildService();
  });

  it('classifies CORRECT via ARITH_SUB strategy', () => {
    const result = service.classify(
      makeDto({ studentAnswer: 27, expectedAnswer: 27 }),
      'ARITH_SUB',
    );
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBe('CORRECT');
  });

  it('classifies ARITH_SUB_BORROW_OMITTED_TENS_G3', () => {
    // 53-26: without borrow units column → 53-26=33 (wrong, expected 27)
    const result = service.classify(
      makeDto({
        studentAnswer: 33,
        expectedAnswer: 27,
        minuend: 53,
        subtrahend: 26,
      }),
      'ARITH_SUB',
    );
    expect(result.isCorrect).toBe(false);
    expect(result.errorType).toBe('ARITH_SUB_BORROW_OMITTED_TENS_G3');
  });

  it('classifies CORRECT via ARITH_ADD strategy', () => {
    const result = service.classify(
      makeDto({
        minuend: 38,
        subtrahend: 27,
        expectedAnswer: 65,
        studentAnswer: 65,
      }),
      'ARITH_ADD',
    );
    expect(result.isCorrect).toBe(true);
    expect(result.errorType).toBe('CORRECT');
  });

  it('classifies CORRECT via FRACT_ADDSUB strategy', () => {
    const result = service.classify(
      makeDto({ expectedAnswer: 3, studentAnswer: 3, rawSteps: [] }),
      'FRACT_ADDSUB',
    );
    expect(result.isCorrect).toBe(true);
  });

  it('returns UNCLASSIFIED for unknown subdomain code', () => {
    const result = service.classify(
      makeDto({ studentAnswer: 99, expectedAnswer: 27 }),
      'UNKNOWN_SUBDOMAIN',
    );
    expect(result.errorType).toBe('UNCLASSIFIED');
    expect(result.confidence).toBe(0);
  });
});
