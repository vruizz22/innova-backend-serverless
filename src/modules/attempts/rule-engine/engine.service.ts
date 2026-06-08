import { Injectable } from '@nestjs/common';

import { type CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import { RuleEngineFactory } from '@modules/attempts/rule-engine/factory';
import { type RuleClassificationResult } from '@modules/attempts/rule-engine/strategy.interface';

@Injectable()
export class RuleEngineService {
  constructor(private readonly factory: RuleEngineFactory) {}

  classify(
    payload: CreateAttemptDto,
    subdomainCode: string,
  ): RuleClassificationResult {
    const strategy = this.factory.getStrategy(subdomainCode);
    return strategy.classify(payload);
  }
}
