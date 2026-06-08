import { type CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import {
  type RuleClassificationResult,
  type RuleEngineStrategy,
} from '@modules/attempts/rule-engine/strategy.interface';

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function parseSimpleFraction(
  expr: string,
): { num: number; den: number } | null {
  const m = /^(-?\d+)\/(\d+)$/.exec(expr.trim());
  if (!m) return null;
  return { num: parseInt(m[1], 10), den: parseInt(m[2], 10) };
}

function parseMixed(
  expr: string,
): { whole: number; num: number; den: number } | null {
  const m = /^(-?\d+)\s+(\d+)\/(\d+)$/.exec(expr.trim());
  if (!m) return null;
  return {
    whole: parseInt(m[1], 10),
    num: parseInt(m[2], 10),
    den: parseInt(m[3], 10),
  };
}

export class FractionSameDenomStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'FRACT_ADDSUB';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;

    // CORRECT (numeric comparison)
    if (studentAnswer === expectedAnswer) {
      return { isCorrect: true, errorType: 'CORRECT', confidence: 1.0 };
    }

    // For fraction topics we use rawSteps to derive expression context.
    // Step expressions like "2/5 + 1/5" or "3/8 - 1/8"
    const steps = payload.rawSteps ?? [];
    const problemExpr = steps[0]?.expression ?? '';

    // Detect "sum numerators AND denominators" pattern:
    // e.g. 2/5 + 1/5 → student writes 3/10 (wrong) vs 3/5 (correct)
    const fracMatch = /(\d+)\/(\d+)\s*[+-]\s*(\d+)\/(\d+)/.exec(problemExpr);
    if (fracMatch) {
      const [, n1, d1, n2, d2] = fracMatch.map(Number);
      if (d1 === d2) {
        const wrongNumerator = n1 + n2;
        const wrongDenominator = d1 + d2;
        if (studentAnswer === wrongNumerator && wrongDenominator !== d1) {
          // student wrote numerator part correctly but probably also added denominators
          return {
            isCorrect: false,
            errorType: 'FRACT_ADDSUB_SUM_NUMERATOR_AND_DENOMINATOR_G5',
            confidence: 0.9,
            evidence: [
              `Student likely added both numerators and denominators: ${n1}+${n2}/${d1}+${d2}`,
            ],
          };
        }
      }
    }

    // IMPROPER_FRACTION_NOT_REDUCED: numeric value correct but not simplified
    // We check by ratio: if student/expected is a non-1 integer ratio, both represent same value
    if (expectedAnswer !== 0 && studentAnswer !== 0) {
      const ratio = studentAnswer / expectedAnswer;
      if (Number.isInteger(ratio) && ratio > 1) {
        return {
          isCorrect: false,
          errorType: 'FRACT_ADDSUB_IMPROPER_NOT_REDUCED_G5',
          confidence: 0.82,
          evidence: [
            `Answer ${studentAnswer} is ${ratio}× expected ${expectedAnswer} — not reduced`,
          ],
        };
      }
    }

    // INVERTED_FRACTION: student swapped numerator/denominator
    // If expected=num/den, student gives den/num as integer approximation
    const expFrac = parseSimpleFraction(String(expectedAnswer));
    if (expFrac && studentAnswer === expFrac.den && expFrac.num !== 0) {
      return {
        isCorrect: false,
        errorType: 'FRACT_ADDSUB_INVERTED_FRACTION_G5',
        confidence: 0.85,
        evidence: [
          `Student may have inverted fraction: wrote ${studentAnswer} which matches denominator`,
        ],
      };
    }

    // WHOLE_NUMBER_LOST: check if problem has mixed number and student only gave fraction part
    const mixedMatch = parseMixed(problemExpr);
    if (mixedMatch) {
      const withoutWhole = Math.abs(
        studentAnswer - mixedMatch.whole * mixedMatch.den - mixedMatch.num,
      );
      if (withoutWhole <= 1) {
        return {
          isCorrect: false,
          errorType: 'FRACT_ADDSUB_WHOLE_NUMBER_LOST_G5',
          confidence: 0.88,
          evidence: [
            `Student appears to have lost the whole number part ${mixedMatch.whole}`,
          ],
        };
      }
    }

    // basic fact error — off by ≤1
    if (Math.abs(studentAnswer - expectedAnswer) <= 1) {
      return {
        isCorrect: false,
        errorType: 'ARITH_TRANSV_FACT_ERROR',
        confidence: 0.65,
        evidence: [`Answer off by ${Math.abs(studentAnswer - expectedAnswer)}`],
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

// Prevent unused import warning
export { gcd };
