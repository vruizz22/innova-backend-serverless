import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard';
import { JwtStrategy } from '@modules/auth/jwt.strategy';
import { RolesGuard } from '@modules/auth/roles.guard';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { UsersService } from '@modules/auth/users.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    DatabaseModule,
  ],
  providers: [
    UsersService,
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
