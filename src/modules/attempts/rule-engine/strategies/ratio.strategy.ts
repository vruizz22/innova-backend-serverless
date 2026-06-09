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

/** Parse a decimal literal accepting ',' or '.' as the separator. */
function toNum(literal: string): number {
  return parseFloat(literal.replace(',', '.'));
}

/** If `r` equals 10^k for some k in [-maxK, maxK] \ {0}, returns k; else null. */
function powerOfTenExponent(r: number, maxK = 4): number | null {
  for (let k = -maxK; k <= maxK; k++) {
    if (k === 0) continue;
    if (approx(r, Math.pow(10, k))) return k;
  }
  return null;
}

/**
 * RATIO_PERCENT — "p% de B" problems. Correct: (p/100)·B.
 * Expression contract for step[0]: "<p>% de <B>" (also "of"/"del"). Numbers may
 * use Chilean comma decimals. Falls back to a decimal-shift check that only needs
 * expected vs. student.
 */
export class PercentStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'RATIO_PERCENT';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (approx(studentAnswer, expectedAnswer)) return CORRECT;

    const expr = payload.rawSteps?.[0]?.expression ?? '';
    const m =
      /(-?\d+(?:[.,]\d+)?)\s*%\s*(?:de la|del|de|of)?\s*(-?\d+(?:[.,]\d+)?)/i.exec(
        expr,
      );
    if (m) {
      const p = toNum(m[1]);
      const base = toNum(m[2]);

      // Divided base by the percent number instead of multiplying by p/100.
      if (p !== 0) {
        const wrong = base / p;
        if (approx(studentAnswer, wrong) && !approx(wrong, expectedAnswer)) {
          return {
            isCorrect: false,
            errorType: 'RATIO_PERCENT_DIVIDE_BY_PERCENT_G7',
            confidence: 0.88,
            evidence: [`Computed ${base} ÷ ${p} instead of ${p}% of ${base}`],
          };
        }
      }
    }

    // Decimal-shift: correct magnitude, point misplaced (e.g. forgot /100 or /10).
    if (!approx(expectedAnswer, 0) && !approx(studentAnswer, 0)) {
      const k = powerOfTenExponent(studentAnswer / expectedAnswer);
      if (k !== null) {
        return {
          isCorrect: false,
          errorType: 'RATIO_PERCENT_DECIMAL_SHIFT_ERROR_G7',
          confidence: 0.85,
          evidence: [`Percent decimal point misplaced by 10^${k}`],
        };
      }
    }

    return UNCLASSIFIED;
  }
}

/**
 * RATIO_PROPORTION — solve x in a:b = c:x (or a/b = c/x). Correct: x = b·c/a.
 * Expression contract for step[0]: "<a>:<b> = <c>:x" or "<a>/<b> = <c>/x", with x
 * any letter or '?'.
 */
export class ProportionStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'RATIO_PROPORTION';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (approx(studentAnswer, expectedAnswer)) return CORRECT;

    const expr = payload.rawSteps?.[0]?.expression ?? '';
    const m =
      /(-?\d+(?:[.,]\d+)?)\s*[:/]\s*(-?\d+(?:[.,]\d+)?)\s*=\s*(-?\d+(?:[.,]\d+)?)\s*[:/]\s*[a-zA-Z?]/.exec(
        expr,
      );
    if (m) {
      const a = toNum(m[1]);
      const b = toNum(m[2]);
      const c = toNum(m[3]);

      // Additive strategy: x = c + (b - a) instead of the multiplicative b·c/a.
      const additive = c + (b - a);
      if (
        approx(studentAnswer, additive) &&
        !approx(additive, expectedAnswer)
      ) {
        return {
          isCorrect: false,
          errorType: 'RATIO_PROPORTION_ADDITIVE_STRATEGY_G7',
          confidence: 0.88,
          evidence: [`Used additive ${c} + (${b} - ${a}) instead of b·c/a`],
        };
      }

      // Cross product set up wrong: x = a·c/b instead of b·c/a.
      if (b !== 0) {
        const wrong = (a * c) / b;
        if (approx(studentAnswer, wrong) && !approx(wrong, expectedAnswer)) {
          return {
            isCorrect: false,
            errorType: 'RATIO_PROPORTION_CROSS_PRODUCT_ERROR_G7',
            confidence: 0.85,
            evidence: [`Cross product set up wrong (${a}·${c})/${b}`],
          };
        }
      }
    }

    return UNCLASSIFIED;
  }
}
