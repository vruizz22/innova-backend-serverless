import { Injectable } from '@nestjs/common';
import { CreateAttemptDto } from '@modules/attempts/dto/create-attempt.dto';
import { RuleEngineFactory } from '@modules/attempts/rule-engine/factory';
import { RuleClassificationResult } from '@modules/attempts/rule-engine/strategy.interface';

@Injectable()
export class RuleEngineService {
  constructor(private readonly factory: RuleEngineFactory) {}

  classify(payload: CreateAttemptDto): RuleClassificationResult {
    const strategy = this.factory.getStrategy(payload.skillKey);
    return strategy.classify(payload);
  }
}
