import { Injectable, Logger } from '@nestjs/common';

import { type RuleEngineStrategy } from '@modules/attempts/rule-engine/strategy.interface';
import { AdditionCarryStrategy } from '@modules/attempts/rule-engine/strategies/addition-carry.strategy';
import { DivisionLongStrategy } from '@modules/attempts/rule-engine/strategies/division-long.strategy';
import { FractionSameDenomStrategy } from '@modules/attempts/rule-engine/strategies/fraction-same-denom.strategy';
import {
  IntAdditionStrategy,
  IntMultiplicationStrategy,
  IntSubtractionStrategy,
} from '@modules/attempts/rule-engine/strategies/integers.strategy';
import { MultiplicationStrategy } from '@modules/attempts/rule-engine/strategies/multiplication.strategy';
import { SubtractionBorrowStrategy } from '@modules/attempts/rule-engine/strategies/subtraction-borrow.strategy';

// Keyed by `<DOMAIN>_<SUBDOMAIN>` subdomain code.
// Register new strategies here as Sprint S8 subdomain implementations land.
const REGISTRY: Record<string, RuleEngineStrategy> = {
  ARITH_SUB: new SubtractionBorrowStrategy(),
  ARITH_ADD: new AdditionCarryStrategy(),
  ARITH_MUL: new MultiplicationStrategy(),
  ARITH_DIV: new DivisionLongStrategy(),
  INT_ADD: new IntAdditionStrategy(),
  INT_SUB: new IntSubtractionStrategy(),
  INT_MUL: new IntMultiplicationStrategy(),
  FRACT_ADDSUB: new FractionSameDenomStrategy(),
};

const UNCLASSIFIED_FALLBACK: RuleEngineStrategy = {
  subdomainCode: '__FALLBACK__',
  classify: () => ({
    isCorrect: false,
    errorType: 'UNCLASSIFIED',
    confidence: 0,
  }),
};

@Injectable()
export class RuleEngineFactory {
  private readonly logger = new Logger(RuleEngineFactory.name);

  /**
   * Returns the strategy for a given subdomain code.
   * Falls back to UNCLASSIFIED_FALLBACK, which escalates to the LLM classifier.
   */
  getStrategy(subdomainCode: string): RuleEngineStrategy {
    const strategy = REGISTRY[subdomainCode];
    if (!strategy) {
      this.logger.debug(
        `No strategy for subdomain ${subdomainCode} — escalating to LLM`,
      );
      return UNCLASSIFIED_FALLBACK;
    }
    return strategy;
  }

  registeredSubdomains(): string[] {
    return Object.keys(REGISTRY);
  }
}
