import { Module } from '@nestjs/common';
import { SqsAdapter } from '@adapters/sqs.adapter';
import { MasteryModule } from '@modules/mastery/mastery.module';
import { AttemptsController } from '@modules/attempts/attempts.controller';
import { AttemptsService } from '@modules/attempts/attempts.service';
import { RuleEngineService } from '@modules/attempts/rule-engine/engine.service';
import { RuleEngineFactory } from '@modules/attempts/rule-engine/factory';
import { SubtractionBorrowStrategy } from '@modules/attempts/rule-engine/strategies/subtraction-borrow.strategy';

@Module({
  imports: [MasteryModule],
  controllers: [AttemptsController],
  providers: [
    AttemptsService,
    RuleEngineService,
    RuleEngineFactory,
    SubtractionBorrowStrategy,
    SqsAdapter,
  ],
  exports: [AttemptsService],
})
export class AttemptsModule {}
