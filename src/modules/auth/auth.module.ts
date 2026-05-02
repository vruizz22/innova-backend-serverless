import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { JwtStrategy } from '@modules/auth/jwt.strategy';
import { RolesGuard } from '@modules/auth/roles.guard';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { UsersService } from '@modules/auth/users.service';
import { AuthController } from '@modules/auth/auth.controller';
import { AuthService } from '@modules/auth/auth.service';
import { AuthTokenService } from '@modules/auth/auth-token.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    DatabaseModule,
  ],
  controllers: [AuthController],
  providers: [
    UsersService,
    AuthService,
    AuthTokenService,
    JwtStrategy,
    JwtAuthGuard,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AuthModule {}
