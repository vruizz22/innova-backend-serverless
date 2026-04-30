import { Injectable } from '@nestjs/common';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import {
  RuleClassificationResult,
  RuleEngineStrategy,
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

@Injectable()
export class SubtractionBorrowStrategy implements RuleEngineStrategy {
  supports(skillKey: string): boolean {
    return skillKey === 'subtraction_borrow';
  }

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const { expectedAnswer, studentAnswer, rawSteps } = payload;
    const minuend = payload.minuend ?? 0;
    const subtrahend = payload.subtrahend ?? 0;

    // CORRECT
    if (studentAnswer === expectedAnswer) {
      return { isCorrect: true, errorType: 'CORRECT', confidence: 1.0 };
    }

    // Rule 1: SUBTRAHEND_MINUEND_SWAPPED — student computed subtrahend - minuend
    if (subtrahend > minuend && studentAnswer === subtrahend - minuend) {
      return {
        isCorrect: false,
        errorType: 'SUBTRAHEND_MINUEND_SWAPPED',
        confidence: 0.95,
        evidence: [
          `Expected ${minuend}-${subtrahend}=${expectedAnswer}; student got ${subtrahend}-${minuend}=${studentAnswer}`,
        ],
      };
    }

    // Rule 2: BORROW_OMITTED_TENS — subtracted each column independently (no borrow)
    const noBorrowResult = computeNoBorrowResult(minuend, subtrahend);
    const unitsM = minuend % 10;
    const unitsS = subtrahend % 10;
    const tensM = Math.floor(minuend / 10) % 10;
    if (studentAnswer === noBorrowResult && noBorrowResult !== expectedAnswer) {
      if (unitsS > unitsM && tensM > 0) {
        return {
          isCorrect: false,
          errorType: 'BORROW_OMITTED_TENS',
          confidence: 0.93,
          evidence: [
            `Units column: ${unitsM}-${unitsS} done without borrow → answer ${studentAnswer} vs expected ${expectedAnswer}`,
          ],
        };
      }
    }

    // Rule 3: BORROW_OMITTED_HUNDREDS — hundreds column no borrow
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
        errorType: 'BORROW_OMITTED_HUNDREDS',
        confidence: 0.91,
        evidence: [`Hundreds column ${hundredsM}-${hundredsS} without borrow`],
      };
    }

    // Rule 4: BORROW_FROM_ZERO_ERROR — problem has zero in tens, student didn't propagate
    // Detects when tens digit is 0 and hundreds exist — student can't borrow from zero
    if (tensM === 0 && hundredsM > 0 && unitsS > unitsM) {
      return {
        isCorrect: false,
        errorType: 'BORROW_FROM_ZERO_ERROR',
        confidence: 0.87,
        evidence: [`Borrow propagation through zero in tens column failed`],
      };
    }

    // Rule 5: PARTIAL_BORROW_ERROR — propagation stopped mid-chain
    const strMinuend = minuend.toString();
    const zeroCount = (strMinuend.match(/0/g) ?? []).length;
    if (zeroCount >= 2 && rawSteps && rawSteps.length > 0) {
      return {
        isCorrect: false,
        errorType: 'PARTIAL_BORROW_ERROR',
        confidence: 0.82,
        evidence: [`Multiple zeros detected; borrow chain likely stopped`],
      };
    }

    // Rule 6: DIGIT_TRANSPOSITION — answer has same digits but swapped
    if (isTranspositionOf(studentAnswer, expectedAnswer)) {
      return {
        isCorrect: false,
        errorType: 'DIGIT_TRANSPOSITION',
        confidence: 0.88,
        evidence: [
          `Digits of ${studentAnswer} are a transposition of expected ${expectedAnswer}`,
        ],
      };
    }

    // Rule 7: PLACE_VALUE_ERROR — answer is off by factor of 10
    if (
      studentAnswer === expectedAnswer * 10 ||
      studentAnswer * 10 === expectedAnswer ||
      studentAnswer === Math.floor(expectedAnswer / 10)
    ) {
      return {
        isCorrect: false,
        errorType: 'PLACE_VALUE_ERROR',
        confidence: 0.85,
        evidence: [
          `Answer ${studentAnswer} is a factor-of-10 shift of expected ${expectedAnswer}`,
        ],
      };
    }

    // Rule 8: BASIC_FACT_ERROR — off by small magnitude (≤2), likely fact recall
    if (Math.abs(studentAnswer - expectedAnswer) <= 2) {
      return {
        isCorrect: false,
        errorType: 'BASIC_FACT_ERROR',
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
