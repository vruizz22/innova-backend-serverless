import { MaterialsModule } from "@/materials/materials.module";
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/infrastructure/database/database.module';
import { TelemetryModule } from '@/infrastructure/telemetry.module';
import { ProfilesModule } from '@/profiles/profiles.module';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';

@Module({
  imports: [DatabaseModule, TelemetryModule, ProfilesModule, MaterialsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
