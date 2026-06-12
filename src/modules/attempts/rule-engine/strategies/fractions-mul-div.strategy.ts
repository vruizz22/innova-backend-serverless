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

interface TwoFractions {
  a: number;
  b: number;
  c: number;
  d: number;
}

/**
 * Parse "a/b OP c/d" from the first step. `opChars` MUST NOT contain '/', which is
 * the fraction bar — fraction division uses ':' or '÷' between the two fractions.
 */
function parseTwoFractions(
  payload: CreateAttemptDto,
  opChars: string,
): TwoFractions | null {
  const expr = payload.rawSteps?.[0]?.expression ?? '';
  const re = new RegExp(
    `(-?\\d+)\\s*/\\s*(\\d+)\\s*[${opChars}]\\s*(-?\\d+)\\s*/\\s*(\\d+)`,
  );
  const m = re.exec(expr);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  const c = parseInt(m[3], 10);
  const d = parseInt(m[4], 10);
  if (b === 0 || d === 0) return null;
  return { a, b, c, d };
}

/**
 * FRACT_MUL — multiplication of fractions. Correct: (a·c)/(b·d).
 * Detects cross-multiplication, where the student multiplies in an X pattern.
 */
export class FractionMultiplicationStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'FRACT_MUL';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (approx(studentAnswer, expectedAnswer)) return CORRECT;

    const f = parseTwoFractions(payload, '•×xX*');
    if (f) {
      const { a, b, c, d } = f;
      // Cross-multiply instead of straight across: (a·d)/(b·c).
      if (b * c !== 0) {
        const wrong = (a * d) / (b * c);
        if (approx(studentAnswer, wrong) && !approx(wrong, expectedAnswer)) {
          return {
            isCorrect: false,
            errorType: 'FRACT_MUL_CROSS_MULTIPLIES_G6',
            confidence: 0.9,
            evidence: [
              `Cross-multiplied (${a}·${d})/(${b}·${c}) instead of straight across`,
            ],
          };
        }
      }
    }

    return UNCLASSIFIED;
  }
}

/**
 * FRACT_DIV — division of fractions. Correct: (a/b)·(d/c) = (a·d)/(b·c).
 * Detects dividing straight across (no reciprocal) and inverting the first
 * fraction instead of the second.
 */
export class FractionDivisionStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'FRACT_DIV';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (approx(studentAnswer, expectedAnswer)) return CORRECT;

    const f = parseTwoFractions(payload, ':÷');
    if (f) {
      const { a, b, c, d } = f;

      // No reciprocal: multiplied straight across (a·c)/(b·d).
      if (b * d !== 0) {
        const wrong = (a * c) / (b * d);
        if (approx(studentAnswer, wrong) && !approx(wrong, expectedAnswer)) {
          return {
            isCorrect: false,
            errorType: 'FRACT_DIV_NO_RECIPROCAL_G7',
            confidence: 0.9,
            evidence: [
              `Multiplied straight across without reciprocal (${a}·${c})/(${b}·${d})`,
            ],
          };
        }
      }

      // Inverted the first fraction instead of the second: (b/a)·(c/d).
      if (a * d !== 0) {
        const wrong = (b * c) / (a * d);
        if (approx(studentAnswer, wrong) && !approx(wrong, expectedAnswer)) {
          return {
            isCorrect: false,
            errorType: 'FRACT_DIV_INVERTS_FIRST_FRACTION_G7',
            confidence: 0.88,
            evidence: [
              `Inverted the first fraction (${b}/${a}) instead of the divisor`,
            ],
          };
        }
      }
    }

    return UNCLASSIFIED;
  }
}
