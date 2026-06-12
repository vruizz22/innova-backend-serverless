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

/**
 * POW_POWER — exponent laws on a common base. Expression contracts for step[0]:
 *  - product:        "a^m • a^n"   (correct a^(m+n); bug multiplies exponents)
 *  - quotient:       "a^m : a^n"   (correct a^(m−n); bug divides exponents)
 *  - power of power: "(a^m)^n"     (correct a^(m·n); bug adds exponents)
 *  - zero exponent:  "a^0"         (correct 1; bug = 0)
 */
export class PowerLawsStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'POW_POWER';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (approx(studentAnswer, expectedAnswer)) return CORRECT;

    const expr = payload.rawSteps?.[0]?.expression ?? '';

    // Product, same base: a^m · a^n → bug a^(m·n).
    const prod = /(\d+)\s*\^\s*(\d+)\s*[•×x*]\s*\1\s*\^\s*(\d+)/.exec(expr);
    if (prod) {
      const wrong = Math.pow(+prod[1], +prod[2] * +prod[3]);
      if (approx(studentAnswer, wrong) && !approx(wrong, expectedAnswer)) {
        return {
          isCorrect: false,
          errorType: 'POW_POWER_PRODUCT_MULTIPLIES_EXPONENTS_G8',
          confidence: 0.9,
          evidence: [
            `Multiplied exponents (${prod[2]}·${prod[3]}) on a product`,
          ],
        };
      }
    }

    // Power of a power: (a^m)^n → bug a^(m+n).
    const pop = /\(\s*(\d+)\s*\^\s*(\d+)\s*\)\s*\^\s*(\d+)/.exec(expr);
    if (pop) {
      const wrong = Math.pow(+pop[1], +pop[2] + +pop[3]);
      if (approx(studentAnswer, wrong) && !approx(wrong, expectedAnswer)) {
        return {
          isCorrect: false,
          errorType: 'POW_POWER_OF_POWER_ADDS_EXPONENTS_G8',
          confidence: 0.9,
          evidence: [
            `Added exponents (${pop[2]}+${pop[3]}) on a power of a power`,
          ],
        };
      }
    }

    // Quotient, same base: a^m / a^n → bug a^(m/n).
    const quo = /(\d+)\s*\^\s*(\d+)\s*[:÷]\s*\1\s*\^\s*(\d+)/.exec(expr);
    if (quo) {
      const wrong = Math.pow(+quo[1], +quo[2] / +quo[3]);
      if (approx(studentAnswer, wrong) && !approx(wrong, expectedAnswer)) {
        return {
          isCorrect: false,
          errorType: 'POW_POWER_QUOTIENT_DIVIDES_EXPONENTS_G8',
          confidence: 0.88,
          evidence: [`Divided exponents (${quo[2]}/${quo[3]}) on a quotient`],
        };
      }
    }

    // Zero exponent treated as 0 instead of 1.
    if (
      /(\d+)\s*\^\s*0(?!\d)/.test(expr) &&
      approx(studentAnswer, 0) &&
      approx(expectedAnswer, 1)
    ) {
      return {
        isCorrect: false,
        errorType: 'POW_POWER_ZERO_EXPONENT_EQUALS_ZERO_G8',
        confidence: 0.92,
        evidence: ['Zero exponent answered as 0 instead of 1'],
      };
    }

    return UNCLASSIFIED;
  }
}

/**
 * POW_ROOT — square roots. Expression contracts for step[0] (radical symbol √):
 *  - root of a sum:  "√(a + b)"  (bug √a + √b instead of √(a+b))
 *  - single radical: "√a"        (bug halves the radicand: a/2 instead of √a)
 */
export class RootLawsStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'POW_ROOT';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (approx(studentAnswer, expectedAnswer)) return CORRECT;

    const expr = payload.rawSteps?.[0]?.expression ?? '';

    // Root of a sum distributed over the terms: √(a+b) → √a + √b.
    const sum = /√\s*\(\s*(\d+)\s*\+\s*(\d+)\s*\)/.exec(expr);
    if (sum) {
      const wrong = Math.sqrt(+sum[1]) + Math.sqrt(+sum[2]);
      if (approx(studentAnswer, wrong) && !approx(wrong, expectedAnswer)) {
        return {
          isCorrect: false,
          errorType: 'POW_ROOT_OF_SUM_DISTRIBUTES_G9',
          confidence: 0.9,
          evidence: [
            `Distributed root: √${sum[1]} + √${sum[2]} instead of √(${sum[1]}+${sum[2]})`,
          ],
        };
      }
    }

    // Square root halved the radicand instead of taking the root: √a → a/2.
    const single = /√\s*(\d+)/.exec(expr);
    if (single) {
      const wrong = +single[1] / 2;
      if (approx(studentAnswer, wrong) && !approx(wrong, expectedAnswer)) {
        return {
          isCorrect: false,
          errorType: 'POW_ROOT_SQUARE_ROOT_HALVES_RADICAND_G8',
          confidence: 0.88,
          evidence: [
            `Halved the radicand (${single[1]}/2) instead of √${single[1]}`,
          ],
        };
      }
    }

    return UNCLASSIFIED;
  }
}
