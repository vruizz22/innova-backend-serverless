import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from '@modules/auth/auth.service';
import { Public } from '@modules/auth/public.decorator';
import { RegisterDto } from '@modules/auth/dto/register.dto';
import { LoginDto } from '@modules/auth/dto/login.dto';
import { RefreshDto } from '@modules/auth/dto/refresh.dto';
import { ForgotPasswordDto } from '@modules/auth/dto/forgot-password.dto';
import { ConfirmForgotPasswordDto } from '@modules/auth/dto/confirm-forgot-password.dto';
import { AuthenticatedPrincipal } from '@modules/auth/jwt.strategy';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedPrincipal;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new local auth user' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Generate a password reset code' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('confirm-forgot-password')
  @ApiOperation({ summary: 'Confirm password reset with code' })
  confirmForgotPassword(@Body() dto: ConfirmForgotPasswordDto) {
    return this.authService.confirmForgotPassword(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the current authenticated user' })
  @ApiResponse({ status: 200, description: 'Authenticated profile' })
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.me(req.user as AuthenticatedPrincipal);
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session' })
  @ApiResponse({ status: 200, description: 'Session revoked' })
  logout(@Req() req: AuthenticatedRequest) {
    return this.authService.logout(req.user as AuthenticatedPrincipal);
  }
}
