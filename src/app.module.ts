import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { SkillsModule } from '@modules/skills/skills.module';
import { ItemsModule } from '@modules/items/items.module';
import { AttemptsModule } from '@modules/attempts/attempts.module';
import { MasteryModule } from '@modules/mastery/mastery.module';
import { AlertsModule } from '@modules/alerts/alerts.module';
import { PracticeModule } from '@modules/practice/practice.module';
import { AssignmentModule } from '@modules/assignment/assignment.module';
import { AuthModule } from '@modules/auth/auth.module';
import { ClassroomsModule } from '@modules/classrooms/classrooms.module';
import { GuidesModule } from '@modules/guides/guides.module';
import { GuideSubmissionsModule } from '@modules/guide-submissions/guide-submissions.module';
import { ParentModule } from '@modules/parent/parent.module';
import { AdminModule } from '@modules/admin/admin.module';
import { TelemetryModule } from '@infrastructure/telemetry.module';
import { TraceIdMiddleware } from '@shared/http/trace-id.middleware';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: { level: process.env['LOG_LEVEL'] ?? 'info' },
    }),
    DatabaseModule,
    TelemetryModule,
    SkillsModule,
    ItemsModule,
    AttemptsModule,
    MasteryModule,
    AlertsModule,
    PracticeModule,
    AssignmentModule,
    AuthModule,
    ClassroomsModule,
    GuidesModule,
    GuideSubmissionsModule,
    ParentModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceIdMiddleware).forRoutes('*');
  }
}
