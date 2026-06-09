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

interface LinearEq {
  a: number;
  b: number;
  c: number;
}

/**
 * Parse "a·x + b = c" from the first step. Contract: a single-variable linear
 * equation written as "<coef><var> <±b> = <c>" (e.g. "2x + 3 = 11", "-3y - 4 = 5",
 * "x + 2 = 9"). Coefficient and constant are integers; the variable is any letter.
 */
function parseLinear(payload: CreateAttemptDto): LinearEq | null {
  const expr = payload.rawSteps?.[0]?.expression ?? '';
  const m = /(-?\d*)\s*[a-zA-Z]\s*([+-]\s*\d+)\s*=\s*(-?\d+)/.exec(expr);
  if (!m) return null;
  const coef = m[1];
  const a =
    coef === '' || coef === '+' ? 1 : coef === '-' ? -1 : parseInt(coef, 10);
  const b = parseInt(m[2].replace(/\s+/g, ''), 10);
  const c = parseInt(m[3], 10);
  if (a === 0) return null;
  return { a, b, c };
}

/**
 * ALGEBRA_EQ_LINEAR — solve a·x + b = c, correct x = (c − b)/a.
 * Detects transposing b without flipping its sign, and dividing only one term by
 * the coefficient. Anything else escalates to the LLM.
 */
export class LinearEquationStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'ALGEBRA_EQ_LINEAR';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (approx(studentAnswer, expectedAnswer)) return CORRECT;

    const eq = parseLinear(payload);
    if (eq) {
      const { a, b, c } = eq;

      // Transposed b without flipping its sign: x = (c + b)/a.
      const signFlip = (c + b) / a;
      if (
        approx(studentAnswer, signFlip) &&
        !approx(signFlip, expectedAnswer)
      ) {
        return {
          isCorrect: false,
          errorType: 'ALGEBRA_EQ_LINEAR_SIGN_FLIP_TRANSPOSE_G8',
          confidence: 0.9,
          evidence: [
            `Transposed ${b} without flipping sign → (${c} + ${b})/${a}`,
          ],
        };
      }

      // Divided only the constant by the coefficient: x = c/a − b.
      if (Math.abs(a) !== 1) {
        const divOne = c / a - b;
        if (approx(studentAnswer, divOne) && !approx(divOne, expectedAnswer)) {
          return {
            isCorrect: false,
            errorType: 'ALGEBRA_EQ_LINEAR_DIVIDES_ONE_TERM_G8',
            confidence: 0.85,
            evidence: [`Divided only ${c} by ${a}, not the whole side`],
          };
        }
      }
    }

    return UNCLASSIFIED;
  }
}
