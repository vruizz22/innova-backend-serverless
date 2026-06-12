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

function isPowerOfTen(n: number): boolean {
  return n >= 10 && /^10*$/.test(n.toString());
}

/**
 * Extracts two integer operands from the first step expression (e.g. "23 • 45",
 * "7 x 8", "7 × 8"). Falls back to the repurposed minuend/subtrahend DTO fields.
 */
function parseFactors(
  payload: CreateAttemptDto,
): { a: number; b: number } | null {
  const expr = payload.rawSteps?.[0]?.expression ?? '';
  const m = /(-?\d+)\s*[•×xX*]\s*(-?\d+)/.exec(expr);
  if (m) return { a: parseInt(m[1], 10), b: parseInt(m[2], 10) };
  if (payload.minuend !== undefined && payload.subtrahend !== undefined) {
    return { a: payload.minuend, b: payload.subtrahend };
  }
  return null;
}

export class MultiplicationStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'ARITH_MUL';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;

    // CORRECT
    if (studentAnswer === expectedAnswer) {
      return { isCorrect: true, errorType: 'CORRECT', confidence: 1.0 };
    }

    const ops = parseFactors(payload);
    if (ops) {
      const { a, b } = ops;

      // Rule 1: 0 × n treated as n
      if (
        (a === 0 || b === 0) &&
        studentAnswer === (a === 0 ? b : a) &&
        studentAnswer !== 0
      ) {
        return {
          isCorrect: false,
          errorType: 'ARITH_MUL_ZERO_TIMES_N_EQUALS_N_G3',
          confidence: 0.9,
          evidence: [`0×n treated as n → ${studentAnswer}`],
        };
      }

      // Rule 2: added instead of multiplied
      if (studentAnswer === a + b && a + b !== a * b) {
        return {
          isCorrect: false,
          errorType: 'ARITH_MUL_ADD_INSTEAD_G3',
          confidence: 0.92,
          evidence: [
            `Student computed ${a}+${b}=${a + b} instead of ${a}×${b}=${expectedAnswer}`,
          ],
        };
      }

      // Rule 3: multiply by power of ten without appending zeros
      if (isPowerOfTen(a) || isPowerOfTen(b)) {
        const nonTen = isPowerOfTen(a) ? b : a;
        if (studentAnswer === nonTen) {
          return {
            isCorrect: false,
            errorType: 'ARITH_MUL_BY_POWER_OF_TEN_NO_ZEROS_G4',
            confidence: 0.9,
            evidence: [
              `Multiplying by a power of ten without appending zeros → ${studentAnswer}`,
            ],
          };
        }
      }

      // Rule 4: multiplication-table recall error (single digit, off by one row)
      if (a > 0 && b > 0 && a < 10 && b < 10) {
        const diff = Math.abs(studentAnswer - expectedAnswer);
        if (diff === a || diff === b) {
          return {
            isCorrect: false,
            errorType: 'ARITH_MUL_TABLE_RECALL_ERROR_G3',
            confidence: 0.8,
            evidence: [
              `Single-digit product ${a}×${b} off by one row of the table → ${studentAnswer}`,
            ],
          };
        }
      }

      // Rule 5: second partial product not shifted one place
      if (b >= 10) {
        const noShift = a * (b % 10) + a * (Math.floor(b / 10) % 10);
        if (studentAnswer === noShift && noShift !== expectedAnswer) {
          return {
            isCorrect: false,
            errorType: 'ARITH_MUL_PARTIAL_NOT_SHIFTED_G5',
            confidence: 0.85,
            evidence: [
              `Partial products added without shifting the second one`,
            ],
          };
        }
      }

      // Rule 6: only corresponding-position digits multiplied (cross products missing)
      if (a >= 10 && b >= 10) {
        const corresponding =
          (Math.floor(a / 10) % 10) * (Math.floor(b / 10) % 10) * 100 +
          (a % 10) * (b % 10);
        if (
          studentAnswer === corresponding &&
          corresponding !== expectedAnswer
        ) {
          return {
            isCorrect: false,
            errorType: 'ARITH_MUL_ONLY_CORRESPONDING_DIGITS_G5',
            confidence: 0.78,
            evidence: [
              `Only matching-position digits multiplied; cross products missing`,
            ],
          };
        }
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
        confidence: 0.82,
        evidence: [
          `Answer ${studentAnswer} is a factor-of-10 shift of ${expectedAnswer}`,
        ],
      };
    }

    if (Math.abs(studentAnswer - expectedAnswer) <= 2) {
      return {
        isCorrect: false,
        errorType: 'ARITH_TRANSV_FACT_ERROR',
        confidence: 0.6,
        evidence: [
          `Answer differs by ${Math.abs(studentAnswer - expectedAnswer)} — likely basic fact error`,
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
