import { Injectable } from '@nestjs/common';
import { RuleEngineStrategy } from '@modules/attempts/rule-engine/strategy.interface';
import { SubtractionBorrowStrategy } from '@modules/attempts/rule-engine/strategies/subtraction-borrow.strategy';

@Injectable()
export class RuleEngineFactory {
  constructor(
    private readonly subtractionBorrowStrategy: SubtractionBorrowStrategy,
  ) {}

  getStrategy(skillKey: string): RuleEngineStrategy {
    const strategies: RuleEngineStrategy[] = [this.subtractionBorrowStrategy];
    const strategy = strategies.find((candidate) =>
      candidate.supports(skillKey),
    );

    if (!strategy) {
      return this.subtractionBorrowStrategy;
    }

    return strategy;
  }
}
