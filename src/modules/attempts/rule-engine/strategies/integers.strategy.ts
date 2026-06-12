import { type CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import {
  type RuleClassificationResult,
  type RuleEngineStrategy,
} from '@modules/attempts/rule-engine/strategy.interface';

/**
 * Extracts two signed integer operands from the first step expression, tolerating
 * parentheses around negatives (e.g. "5 - (-3)", "(-4) × 6", "-3 + 5").
 * `opChars` is the char-class body of accepted operators. Falls back to the
 * repurposed minuend/subtrahend DTO fields.
 */
function parseTwoInts(
  payload: CreateAttemptDto,
  opChars: string,
): { a: number; b: number } | null {
  const expr = payload.rawSteps?.[0]?.expression ?? '';
  const re = new RegExp(
    `\\(?\\s*(-?\\d+)\\s*\\)?\\s*[${opChars}]\\s*\\(?\\s*(-?\\d+)\\s*\\)?`,
  );
  const m = re.exec(expr);
  if (m) return { a: parseInt(m[1], 10), b: parseInt(m[2], 10) };
  if (payload.minuend !== undefined && payload.subtrahend !== undefined) {
    return { a: payload.minuend, b: payload.subtrahend };
  }
  return null;
}

const UNCLASSIFIED: RuleClassificationResult = {
  isCorrect: false,
  errorType: 'UNCLASSIFIED',
  confidence: 0.0,
  evidence: ['No deterministic rule matched'],
};

export class IntAdditionStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'INT_ADD';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (studentAnswer === expectedAnswer) {
      return { isCorrect: true, errorType: 'CORRECT', confidence: 1.0 };
    }

    const ops = parseTwoInts(payload, '+');
    if (ops) {
      const { a, b } = ops;
      const sameSign = a !== 0 && b !== 0 && a < 0 === b < 0;
      const diffSign = a < 0 !== b < 0;

      // Same sign but magnitudes subtracted instead of added
      if (sameSign) {
        const wrong = Math.sign(a) * Math.abs(Math.abs(a) - Math.abs(b));
        if (studentAnswer === wrong && wrong !== expectedAnswer) {
          return {
            isCorrect: false,
            errorType: 'INT_ADD_SAME_SIGN_SUBTRACTS_G7',
            confidence: 0.9,
            evidence: [
              `Same-sign operands ${a}, ${b}: magnitudes subtracted → ${studentAnswer}`,
            ],
          };
        }
      }

      if (diffSign) {
        const mag = Math.abs(a) + Math.abs(b);
        // Different signs but magnitudes added
        if (
          (studentAnswer === mag || studentAnswer === -mag) &&
          Math.abs(studentAnswer) !== Math.abs(expectedAnswer)
        ) {
          return {
            isCorrect: false,
            errorType: 'INT_ADD_DIFF_SIGN_ADDS_MAGNITUDES_G7',
            confidence: 0.88,
            evidence: [
              `Different-sign operands ${a}, ${b}: magnitudes added → ${studentAnswer}`,
            ],
          };
        }
        // Correct magnitude, wrong sign (sign of the smaller magnitude kept)
        if (studentAnswer === -expectedAnswer && expectedAnswer !== 0) {
          return {
            isCorrect: false,
            errorType: 'INT_ADD_KEEPS_WRONG_SIGN_G7',
            confidence: 0.82,
            evidence: [`Correct magnitude but wrong sign → ${studentAnswer}`],
          };
        }
      }
    }

    return UNCLASSIFIED;
  }
}

export class IntSubtractionStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'INT_SUB';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (studentAnswer === expectedAnswer) {
      return { isCorrect: true, errorType: 'CORRECT', confidence: 1.0 };
    }

    const ops = parseTwoInts(payload, '-');
    if (ops) {
      const { a, b } = ops;

      // Subtracting a negative not turned into addition: a - (-b) done as a - |b|
      if (b < 0) {
        const wrong = a - Math.abs(b);
        if (studentAnswer === wrong && wrong !== expectedAnswer) {
          return {
            isCorrect: false,
            errorType: 'INT_SUB_DOUBLE_NEGATIVE_NOT_APPLIED_G7',
            confidence: 0.9,
            evidence: [
              `${a} - (${b}) treated as ${a} - ${Math.abs(b)} → ${studentAnswer}`,
            ],
          };
        }
      }

      // Subtraction converted to addition (sign of subtrahend not flipped)
      if (b > 0 && studentAnswer === a + b && a + b !== expectedAnswer) {
        return {
          isCorrect: false,
          errorType: 'INT_SUB_AS_ADD_SIGN_ERROR_G7',
          confidence: 0.85,
          evidence: [`${a} - ${b} computed as ${a} + ${b} → ${studentAnswer}`],
        };
      }
    }

    return UNCLASSIFIED;
  }
}

export class IntMultiplicationStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'INT_MUL';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    if (studentAnswer === expectedAnswer) {
      return { isCorrect: true, errorType: 'CORRECT', confidence: 1.0 };
    }

    const ops = parseTwoInts(payload, '•×xX*');
    if (ops) {
      const { a, b } = ops;
      const prodMag = Math.abs(a * b);

      // Negative × negative given a negative result
      if (a < 0 && b < 0 && studentAnswer === -prodMag && expectedAnswer > 0) {
        return {
          isCorrect: false,
          errorType: 'INT_SIGN_NEG_TIMES_NEG_IS_NEG_G7',
          confidence: 0.9,
          evidence: [
            `(${a})×(${b}) given a negative result → ${studentAnswer}`,
          ],
        };
      }

      // Exactly one negative given a positive result
      if (a < 0 !== b < 0 && studentAnswer === prodMag && expectedAnswer < 0) {
        return {
          isCorrect: false,
          errorType: 'INT_SIGN_NEG_TIMES_POS_IS_POS_G7',
          confidence: 0.9,
          evidence: [`${a}×${b} given a positive result → ${studentAnswer}`],
        };
      }
    }

    return UNCLASSIFIED;
  }
}
