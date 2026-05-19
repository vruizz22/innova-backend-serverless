import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { SupabaseJwtStrategy } from '@modules/auth/supabase-jwt.strategy';
import { RolesGuard } from '@modules/auth/roles.guard';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { UserLinkerService } from '@modules/auth/user-linker.service';
import { AuthController } from '@modules/auth/auth.controller';
import { AuthService } from '@modules/auth/auth.service';
import { AuthTokenService } from '@modules/auth/auth-token.service';
import { EmailService } from '@modules/auth/email.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'supabase-jwt' }),
    DatabaseModule,
  ],
  controllers: [AuthController],
  providers: [
    UserLinkerService,
    AuthService,
    AuthTokenService,
    EmailService,
    SupabaseJwtStrategy,
    SupabaseAuthGuard,
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [UserLinkerService],
})
export class AuthModule {}
