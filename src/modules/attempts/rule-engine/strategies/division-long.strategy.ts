import { type CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import {
  type RuleClassificationResult,
  type RuleEngineStrategy,
} from '@modules/attempts/rule-engine/strategy.interface';

function digitsOf(n: number): number[] {
  return Math.abs(n)
    .toString()
    .split('')
    .map((d) => parseInt(d, 10));
}

function isTranspositionOf(a: number, b: number): boolean {
  const da = digitsOf(a).sort((x, y) => x - y);
  const db = digitsOf(b).sort((x, y) => x - y);
  if (da.length !== db.length) return false;
  return da.every((v, i) => v === db[i]);
}

/**
 * Extracts dividend/divisor from the first step expression. Chilean notation uses
 * ":" for division; we also accept "÷" and "/". Falls back to minuend/subtrahend.
 */
function parseDivision(
  payload: CreateAttemptDto,
): { dividend: number; divisor: number } | null {
  const expr = payload.rawSteps?.[0]?.expression ?? '';
  const m = /(-?\d+)\s*[:÷/]\s*(-?\d+)/.exec(expr);
  if (m) return { dividend: parseInt(m[1], 10), divisor: parseInt(m[2], 10) };
  if (payload.minuend !== undefined && payload.subtrahend !== undefined) {
    return { dividend: payload.minuend, divisor: payload.subtrahend };
  }
  return null;
}

export class DivisionLongStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'ARITH_DIV';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;

    // CORRECT
    if (studentAnswer === expectedAnswer) {
      return { isCorrect: true, errorType: 'CORRECT', confidence: 1.0 };
    }

    const ops = parseDivision(payload);
    if (ops) {
      const { dividend, divisor } = ops;

      // Rule 1: divisor and dividend swapped
      if (
        dividend > 0 &&
        divisor > 0 &&
        studentAnswer === Math.floor(divisor / dividend) &&
        studentAnswer !== expectedAnswer
      ) {
        return {
          isCorrect: false,
          errorType: 'ARITH_DIV_DIVISOR_DIVIDEND_SWAPPED_G4',
          confidence: 0.86,
          evidence: [
            `Student divided ${divisor}÷${dividend} instead of ${dividend}÷${divisor}`,
          ],
        };
      }

      // Rule 2: zero in the quotient skipped (long division)
      const expStr = expectedAnswer.toString();
      if (/\d0/.test(expStr) && expStr.length >= 2) {
        const withoutZeros = parseInt(expStr.replace(/0/g, ''), 10);
        if (!Number.isNaN(withoutZeros) && studentAnswer === withoutZeros) {
          return {
            isCorrect: false,
            errorType: 'ARITH_DIV_QUOTIENT_ZERO_SKIPPED_G5',
            confidence: 0.85,
            evidence: [
              `Quotient ${studentAnswer} drops the zero of expected ${expectedAnswer}`,
            ],
          };
        }
      }

      // Rule 3: partial quotient chosen too large (overestimated by one)
      if (studentAnswer === expectedAnswer + 1) {
        return {
          isCorrect: false,
          errorType: 'ARITH_DIV_PARTIAL_QUOTIENT_TOO_LARGE_G5',
          confidence: 0.78,
          evidence: [`Quotient overestimated by one → ${studentAnswer}`],
        };
      }

      // Rule 4: stopped early leaving a remainder ≥ divisor (underestimated by one)
      if (studentAnswer === expectedAnswer - 1) {
        return {
          isCorrect: false,
          errorType: 'ARITH_DIV_REMAINDER_GE_DIVISOR_G4',
          confidence: 0.75,
          evidence: [
            `Quotient underestimated by one; remainder would be ≥ divisor ${divisor}`,
          ],
        };
      }
    }

    // Answer-only rules
    if (isTranspositionOf(studentAnswer, expectedAnswer)) {
      return {
        isCorrect: false,
        errorType: 'ARITH_TRANSV_DIGIT_TRANSPOSITION',
        confidence: 0.85,
        evidence: [
          `Digits of ${studentAnswer} are a transposition of ${expectedAnswer}`,
        ],
      };
    }

    if (
      expectedAnswer !== 0 &&
      (studentAnswer === expectedAnswer * 10 ||
        studentAnswer * 10 === expectedAnswer)
    ) {
      return {
        isCorrect: false,
        errorType: 'ARITH_TRANSV_PLACE_VALUE_ERROR',
        confidence: 0.8,
        evidence: [
          `Answer ${studentAnswer} is a factor-of-10 shift of ${expectedAnswer}`,
        ],
      };
    }

    return {
      isCorrect: false,
      errorType: 'UNCLASSIFIED',
      confidence: 0.0,
      evidence: ['No deterministic rule matched'],
    };
  }
}
