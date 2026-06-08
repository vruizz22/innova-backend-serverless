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

function computeNoBorrowResult(minuend: number, subtrahend: number): number {
  let result = 0;
  let multiplier = 1;
  let m = minuend;
  let s = subtrahend;
  while (m > 0 || s > 0) {
    const md = m % 10;
    const sd = s % 10;
    result += Math.abs(md - sd) * multiplier;
    multiplier *= 10;
    m = Math.floor(m / 10);
    s = Math.floor(s / 10);
  }
  return result;
}

export class SubtractionBorrowStrategy implements RuleEngineStrategy {
  readonly subdomainCode = 'ARITH_SUB';

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer, rawSteps } = payload;
    const minuend = payload.minuend ?? 0;
    const subtrahend = payload.subtrahend ?? 0;

    // CORRECT
    if (studentAnswer === expectedAnswer) {
      return { isCorrect: true, errorType: 'CORRECT', confidence: 1.0 };
    }

    // Rule 1: minuend and subtrahend swapped
    if (subtrahend > minuend && studentAnswer === subtrahend - minuend) {
      return {
        isCorrect: false,
        errorType: 'ARITH_SUB_MINUEND_SUBTRAHEND_SWAPPED_G3',
        confidence: 0.95,
        evidence: [
          `Expected ${minuend}-${subtrahend}=${expectedAnswer}; student got ${subtrahend}-${minuend}=${studentAnswer}`,
        ],
      };
    }

    // Rule 2: borrow omitted — subtracted each column without borrowing
    const noBorrowResult = computeNoBorrowResult(minuend, subtrahend);
    const unitsM = minuend % 10;
    const unitsS = subtrahend % 10;
    const tensM = Math.floor(minuend / 10) % 10;
    if (studentAnswer === noBorrowResult && noBorrowResult !== expectedAnswer) {
      if (unitsS > unitsM && tensM > 0) {
        return {
          isCorrect: false,
          errorType: 'ARITH_SUB_BORROW_OMITTED_TENS_G3',
          confidence: 0.93,
          evidence: [
            `Units column: ${unitsM}-${unitsS} done without borrow → answer ${studentAnswer} vs expected ${expectedAnswer}`,
          ],
        };
      }
    }

    // Rule 3: borrow omitted at hundreds column
    const hundredsM = Math.floor(minuend / 100) % 10;
    const hundredsS = Math.floor(subtrahend / 100) % 10;
    const tensForHundreds = Math.floor(minuend / 10) % 10;
    if (
      hundredsS > hundredsM &&
      tensForHundreds === 0 &&
      studentAnswer === noBorrowResult
    ) {
      return {
        isCorrect: false,
        errorType: 'ARITH_SUB_BORROW_OMITTED_HUNDREDS_G3',
        confidence: 0.91,
        evidence: [`Hundreds column ${hundredsM}-${hundredsS} without borrow`],
      };
    }

    // Rule 4: borrowing from zero — tens is 0, hundreds exist, borrow propagation failed
    if (tensM === 0 && hundredsM > 0 && unitsS > unitsM) {
      return {
        isCorrect: false,
        errorType: 'ARITH_SUB_BORROW_FROM_ZERO_G3',
        confidence: 0.87,
        evidence: [`Borrow propagation through zero in tens column failed`],
      };
    }

    // Rule 5: borrow propagation stopped mid-chain (multiple zeros in minuend)
    const strMinuend = minuend.toString();
    const zeroCount = (strMinuend.match(/0/g) ?? []).length;
    if (zeroCount >= 2 && rawSteps && rawSteps.length > 0) {
      return {
        isCorrect: false,
        errorType: 'ARITH_SUB_BORROW_PROPAGATION_STOP_G3',
        confidence: 0.82,
        evidence: [`Multiple zeros detected; borrow chain likely stopped`],
      };
    }

    // Rule 6: digit transposition
    if (isTranspositionOf(studentAnswer, expectedAnswer)) {
      return {
        isCorrect: false,
        errorType: 'ARITH_TRANSV_DIGIT_TRANSPOSITION',
        confidence: 0.88,
        evidence: [
          `Digits of ${studentAnswer} are a transposition of expected ${expectedAnswer}`,
        ],
      };
    }

    // Rule 7: place value error — answer is off by factor of 10
    if (
      studentAnswer === expectedAnswer * 10 ||
      studentAnswer * 10 === expectedAnswer ||
      studentAnswer === Math.floor(expectedAnswer / 10)
    ) {
      return {
        isCorrect: false,
        errorType: 'ARITH_TRANSV_PLACE_VALUE_ERROR',
        confidence: 0.85,
        evidence: [
          `Answer ${studentAnswer} is a factor-of-10 shift of expected ${expectedAnswer}`,
        ],
      };
    }

    // Rule 8: basic arithmetic fact error — off by ≤2
    if (Math.abs(studentAnswer - expectedAnswer) <= 2) {
      return {
        isCorrect: false,
        errorType: 'ARITH_TRANSV_FACT_ERROR',
        confidence: 0.65,
        evidence: [
          `Answer differs by ${Math.abs(studentAnswer - expectedAnswer)} — likely basic fact recall error`,
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
