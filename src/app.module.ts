import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { TelemetryModule } from '@infrastructure/telemetry.module';
import { ProfilesModule } from '@/profiles/profiles.module';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { SkillsModule } from '@modules/skills/skills.module';
import { ItemsModule } from '@modules/items/items.module';
import { AttemptsModule } from '@modules/attempts/attempts.module';
import { MasteryModule } from '@modules/mastery/mastery.module';
import { AlertsModule } from '@modules/alerts/alerts.module';
import { PracticeModule } from '@modules/practice/practice.module';
import { AuthModule } from '@modules/auth/auth.module';
import { TraceIdMiddleware } from '@shared/http/trace-id.middleware';

@Module({
  imports: [
    DatabaseModule,
    TelemetryModule,
    ProfilesModule,
    SkillsModule,
    ItemsModule,
    AttemptsModule,
    MasteryModule,
    AlertsModule,
    PracticeModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceIdMiddleware).forRoutes('*');
  }
}
