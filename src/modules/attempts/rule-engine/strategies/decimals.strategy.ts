import { type CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import {
  type RuleClassificationResult,
  type RuleEngineStrategy,
} from '@modules/attempts/rule-engine/strategy.interface';

const EPS = 1e-9;
const approx = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

const UNCLASSIFIED: RuleClassificationResult = {
  isCorrect: false,
  errorType: 'UNCLASSIFIED',
  confidence: 0.0,
  evidence: ['No deterministic rule matched'],
};

const CORRECT: RuleClassificationResult = {
  isCorrect: true,
  errorType: 'CORRECT',
  confidence: 1.0,
};

/** Decimal places in a numeric literal (Chilean comma or dot). "2,50" -> 2. */
function decimalsOf(literal: string): number {
  const m = /[.,](\d+)/.exec(literal);
  return m ? m[1].length : 0;
}

/** Parse a decimal literal accepting ',' or '.' as the separator. */
function toNum(literal: string): number {
  return parseFloat(literal.replace(',', '.'));
}

/** Digits of a decimal literal read as a plain integer (separator ignored). "2,5" -> 25. */
function digitsAsInt(literal: string): number {
  const neg = literal.trim().startsWith('-');
  const v = parseInt(literal.replace(/[^\d]/g, '') || '0', 10);
  return neg ? -v : v;
}

/** If `r` equals 10^k for some k in [-maxK, maxK] \ {0}, returns k; else null. */
function powerOfTenExponent(r: number, maxK = 4): number | null {
  for (let k = -maxK; k <= maxK; k++) {
    if (k === 0) continue;
    if (approx(r, Math.pow(10, k))) return k;
  }
  return null;
}

/** True when |x| is a power of ten other than 1 (i.e. a "×/÷ 10ⁿ" operand). */
function isPowerOfTen(x: number): boolean {
  const ax = Math.abs(x);
  if (approx(ax, 1)) return false;
  return powerOfTenExponent(ax) !== null;
}

interface DecimalOps {
  aLit: string;
  bLit: string;
  a: number;
  b: number;
}

/** Extract two decimal operands and the operator from the first step expression. */
function parseDecimalOp(
  payload: CreateAttemptDto,
  opChars: string,
): DecimalOps | null {
  const expr = payload.rawSteps?.[0]?.expression ?? '';
  const re = new RegExp(
    `(-?\\d+(?:[.,]\\d+)?)\\s*[${opChars}]\\s*(-?\\d+(?:[.,]\\d+)?)`,
  );
  const m = re.exec(expr);
  if (!m) return null;
  return { aLit: m[1], bLit: m[2], a: toNum(m[1]), b: toNum(m[2]) };
}

/**
 * DEC_ADD — decimal addition. Detects the canonical "right-align like integers"
 * misalignment: digits added as if both numbers were integers, then the point is
 * re-inserted at the larger decimal count.
 */
export class DecimalAdditionStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'DEC_ADD';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (approx(studentAnswer, expectedAnswer)) return CORRECT;

    const ops = parseDecimalOp(payload, '+');
    if (ops) {
      const decA = decimalsOf(ops.aLit);
      const decB = decimalsOf(ops.bLit);
      const maxDec = Math.max(decA, decB);
      if (maxDec > 0 && decA !== decB) {
        const wrong =
          (digitsAsInt(ops.aLit) + digitsAsInt(ops.bLit)) /
          Math.pow(10, maxDec);
        if (approx(studentAnswer, wrong) && !approx(wrong, expectedAnswer)) {
          return {
            isCorrect: false,
            errorType: 'DEC_ADD_RIGHT_ALIGNED_LIKE_INTEGERS_G5',
            confidence: 0.9,
            evidence: [
              `Digits added right-aligned (${ops.aLit} + ${ops.bLit}) → ${studentAnswer}`,
            ],
          };
        }
      }
    }

    return UNCLASSIFIED;
  }
}

/** DEC_SUB — decimal subtraction with the same right-alignment misalignment. */
export class DecimalSubtractionStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'DEC_SUB';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (approx(studentAnswer, expectedAnswer)) return CORRECT;

    const ops = parseDecimalOp(payload, '-');
    if (ops) {
      const decA = decimalsOf(ops.aLit);
      const decB = decimalsOf(ops.bLit);
      const maxDec = Math.max(decA, decB);
      if (maxDec > 0 && decA !== decB) {
        const wrong =
          (digitsAsInt(ops.aLit) - digitsAsInt(ops.bLit)) /
          Math.pow(10, maxDec);
        if (approx(studentAnswer, wrong) && !approx(wrong, expectedAnswer)) {
          return {
            isCorrect: false,
            errorType: 'DEC_SUB_MISALIGNED_POINTS_G5',
            confidence: 0.9,
            evidence: [
              `Digits subtracted right-aligned (${ops.aLit} - ${ops.bLit}) → ${studentAnswer}`,
            ],
          };
        }
      }
    }

    return UNCLASSIFIED;
  }
}

/**
 * DEC_MUL — decimal multiplication. Detects decimal-point placement errors
 * (answer is the correct product off by a power of ten), distinguishing the
 * ×/÷ power-of-ten "wrong direction" case.
 */
export class DecimalMultiplicationStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'DEC_MUL';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (approx(studentAnswer, expectedAnswer)) return CORRECT;

    const ops = parseDecimalOp(payload, '•×xX*');
    if (ops && !approx(expectedAnswer, 0) && !approx(studentAnswer, 0)) {
      const k = powerOfTenExponent(studentAnswer / expectedAnswer);
      if (k !== null) {
        if (isPowerOfTen(ops.a) || isPowerOfTen(ops.b)) {
          return {
            isCorrect: false,
            errorType: 'DEC_MUL_BY_POWER_TEN_POINT_WRONG_DIRECTION_G6',
            confidence: 0.88,
            evidence: [
              `Operand is a power of ten; point shifted the wrong way (×10^${k})`,
            ],
          };
        }
        return {
          isCorrect: false,
          errorType: 'DEC_MUL_POINT_PLACEMENT_ERROR_G6',
          confidence: 0.9,
          evidence: [
            `Correct digits but point misplaced by 10^${k} → ${studentAnswer}`,
          ],
        };
      }
    }

    return UNCLASSIFIED;
  }
}

/**
 * DEC_DIV — decimal division. Detects ignoring the point entirely vs. not
 * shifting the divisor's decimals.
 */
export class DecimalDivisionStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'DEC_DIV';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (approx(studentAnswer, expectedAnswer)) return CORRECT;

    const ops = parseDecimalOp(payload, ':÷/');
    if (ops && !approx(expectedAnswer, 0) && !approx(studentAnswer, 0)) {
      const decB = decimalsOf(ops.bLit);
      // Divisor was decimal but its point wasn't shifted: result off by 10^decB.
      if (decB > 0) {
        const wrong = expectedAnswer / Math.pow(10, decB);
        if (approx(studentAnswer, wrong)) {
          return {
            isCorrect: false,
            errorType: 'DEC_DIV_DIVISOR_DECIMAL_NOT_SHIFTED_G6',
            confidence: 0.9,
            evidence: [
              `Divisor ${ops.bLit} decimal not shifted → ${studentAnswer}`,
            ],
          };
        }
      }
      const k = powerOfTenExponent(studentAnswer / expectedAnswer);
      if (k !== null) {
        return {
          isCorrect: false,
          errorType: 'DEC_DIV_POINT_IGNORED_G6',
          confidence: 0.85,
          evidence: [`Decimal point ignored in division (10^${k})`],
        };
      }
    }

    return UNCLASSIFIED;
  }
}
