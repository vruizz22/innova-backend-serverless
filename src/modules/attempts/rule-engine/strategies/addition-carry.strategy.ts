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

function computeNoCarryResult(addend1: number, addend2: number): number {
  let result = 0;
  let multiplier = 1;
  let a = addend1;
  let b = addend2;
  while (a > 0 || b > 0) {
    const ad = a % 10;
    const bd = b % 10;
    result += ((ad + bd) % 10) * multiplier;
    multiplier *= 10;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return result;
}

export class AdditionCarryStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'ARITH_ADD';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer } = payload;
    // For addition, minuend = first addend, subtrahend = second addend (repurposed)
    const addend1 = payload.minuend ?? 0;
    const addend2 = payload.subtrahend ?? 0;

    // CORRECT
    if (studentAnswer === expectedAnswer) {
      return { isCorrect: true, errorType: 'CORRECT', confidence: 1.0 };
    }

    // Rule 1: carry omitted — added column-by-column without carrying
    const noCarryResult = computeNoCarryResult(addend1, addend2);
    if (studentAnswer === noCarryResult && noCarryResult !== expectedAnswer) {
      const unitsSum = (addend1 % 10) + (addend2 % 10);
      if (unitsSum >= 10) {
        return {
          isCorrect: false,
          errorType: 'ARITH_ADD_CARRY_OMITTED_G3',
          confidence: 0.93,
          evidence: [
            `Units ${addend1 % 10}+${addend2 % 10}=${unitsSum} generates carry; student ignored it → ${studentAnswer} vs expected ${expectedAnswer}`,
          ],
        };
      }
    }

    // Rule 2: carry applied to wrong column
    if (
      Math.abs(studentAnswer - noCarryResult) === 10 ||
      Math.abs(studentAnswer - noCarryResult) === 100
    ) {
      const unitsSum = (addend1 % 10) + (addend2 % 10);
      if (unitsSum >= 10) {
        return {
          isCorrect: false,
          errorType: 'ARITH_ADD_CARRY_WRONG_COLUMN_G3',
          confidence: 0.87,
          evidence: [
            `Carry appears to be added to wrong column; got ${studentAnswer}`,
          ],
        };
      }
    }

    // Rule 3: digit transposition
    if (isTranspositionOf(studentAnswer, expectedAnswer)) {
      return {
        isCorrect: false,
        errorType: 'ARITH_TRANSV_DIGIT_TRANSPOSITION',
        confidence: 0.88,
        evidence: [
          `Digits of ${studentAnswer} are a transposition of ${expectedAnswer}`,
        ],
      };
    }

    // Rule 4: basic arithmetic fact error — off by ≤2
    if (Math.abs(studentAnswer - expectedAnswer) <= 2) {
      return {
        isCorrect: false,
        errorType: 'ARITH_TRANSV_FACT_ERROR',
        confidence: 0.65,
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
