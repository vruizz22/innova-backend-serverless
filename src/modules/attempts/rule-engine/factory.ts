import { Injectable } from '@nestjs/common';
import { RuleEngineStrategy } from '@modules/attempts/rule-engine/strategy.interface';
import { SubtractionBorrowStrategy } from '@modules/attempts/rule-engine/strategies/subtraction-borrow.strategy';
import { AdditionCarryStrategy } from '@modules/attempts/rule-engine/strategies/addition-carry.strategy';
import { FractionSameDenomStrategy } from '@modules/attempts/rule-engine/strategies/fraction-same-denom.strategy';

@Injectable()
export class RuleEngineFactory {
  constructor(
    private readonly subtractionBorrowStrategy: SubtractionBorrowStrategy,
    private readonly additionCarryStrategy: AdditionCarryStrategy,
    private readonly fractionSameDenomStrategy: FractionSameDenomStrategy,
  ) {}

  getStrategy(topicCode: string): RuleEngineStrategy {
    const strategies: RuleEngineStrategy[] = [
      this.subtractionBorrowStrategy,
      this.additionCarryStrategy,
      this.fractionSameDenomStrategy,
    ];
    return (
      strategies.find((s) => s.supports(topicCode)) ??
      this.subtractionBorrowStrategy
    );
  }
}
