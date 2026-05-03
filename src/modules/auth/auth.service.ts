import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  AuthTokenService,
  LocalAuthSession,
} from '@modules/auth/auth-token.service';
import { EmailService } from '@modules/auth/email.service';
import { Role } from '@modules/auth/roles.enum';
import type { AuthenticatedPrincipal } from '@modules/auth/jwt.strategy';
import { LoginDto } from '@modules/auth/dto/login.dto';
import { RegisterDto } from '@modules/auth/dto/register.dto';
import { RefreshDto } from '@modules/auth/dto/refresh.dto';
import { ForgotPasswordDto } from '@modules/auth/dto/forgot-password.dto';
import { ConfirmForgotPasswordDto } from '@modules/auth/dto/confirm-forgot-password.dto';

const scrypt = promisify(scryptCallback);

type AuthUserRecord = {
  id: string;
  email: string;
  cognitoSub: string | null;
  authRole: string | null;
  passwordHash: string | null;
  passwordResetTokenHash: string | null;
  passwordResetExpiresAt: Date | null;
  tokenVersion: number;
};

export interface AuthSessionResponse extends LocalAuthSession {
  user: {
    id: string;
    email: string;
    role: Role;
    cognitoSub: string | null;
    tokenVersion: number;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: AuthTokenService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthSessionResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.upsert({
      where: { email: normalizedEmail },
      update: {
        passwordHash,
        authRole: dto.role,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
      create: {
        email: normalizedEmail,
        passwordHash,
        authRole: dto.role,
      },
    });

    return this.buildSessionResponse(
      user.id,
      user.email,
      this.resolveRole(user.authRole),
      user.tokenVersion,
      user.cognitoSub,
    );
  }

  async login(dto: LoginDto): Promise<AuthSessionResponse> {
    const user = await this.findLocalUserOrThrow(dto.email);

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'User is not configured for local password login',
      );
    }

    const passwordMatches = await this.verifyPassword(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildSessionResponse(
      user.id,
      user.email,
      this.resolveRole(user.authRole),
      user.tokenVersion,
      user.cognitoSub,
    );
  }

  async refresh(dto: RefreshDto): Promise<AuthSessionResponse> {
    const claims = this.tokenService.verifyRefreshToken(dto.refreshToken);
    if (claims.token_use !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.findLocalUserOrThrow(claims.email);
    this.assertTokenVersion(user, claims.tokenVersion);

    return this.buildSessionResponse(
      user.id,
      user.email,
      this.resolveRole(user.authRole),
      user.tokenVersion,
      user.cognitoSub,
    );
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{
    message: string;
  }> {
    const user = await this.findLocalUserOrThrow(dto.email);
    const resetCode = this.generateResetCode();
    const resetTokenHash = await this.hashSecret(resetCode);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: resetTokenHash,
        passwordResetExpiresAt: expiresAt,
      },
    });

    // Encode resetCode as URL-safe token for email link
    const resetToken = Buffer.from(
      JSON.stringify({ email: dto.email, code: resetCode }),
    ).toString('base64url');
    const appUrl = this.configService.get<string>('PUBLIC_APP_URL');
    if (!appUrl) {
      throw new Error(
        'PUBLIC_APP_URL is required to generate password reset links',
      );
    }

    const resetLink = new URL('/auth/reset', appUrl);
    resetLink.searchParams.set('token', resetToken);

    // Send email with reset link (NOT the code)
    const emailResult = await this.emailService.sendPasswordResetEmail(
      dto.email,
      resetLink.toString(),
    );

    if (!emailResult.success) {
      this.logger.error(
        `Password reset email failed for ${dto.email}: ${emailResult.error}`,
      );
      throw new InternalServerErrorException(
        'Unable to send password reset email',
      );
    }

    // Response does NOT include the resetCode — it's sent only via email
    return {
      message:
        'If an account exists with this email, a password reset link has been sent. Check your inbox and spam folder.',
    };
  }

  async confirmForgotPassword(
    dto: ConfirmForgotPasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.findLocalUserOrThrow(dto.email);

    if (!user.passwordResetTokenHash || !user.passwordResetExpiresAt) {
      throw new UnauthorizedException('Password reset has not been requested');
    }

    if (user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Password reset code has expired');
    }

    const codeMatches = await this.verifySecret(
      dto.code,
      user.passwordResetTokenHash,
    );
    if (!codeMatches) {
      throw new UnauthorizedException('Invalid password reset code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await this.hashPassword(dto.newPassword),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        tokenVersion: { increment: 1 },
      },
    });

    return { message: 'Password updated successfully' };
  }

  async me(principal: AuthenticatedPrincipal): Promise<{
    user: AuthSessionResponse['user'];
    principal: AuthenticatedPrincipal;
  }> {
    const user = await this.findByPrincipal(principal);
    return {
      user: {
        id: user.id,
        email: user.email,
        role: this.resolveRole(user.authRole),
        cognitoSub: user.cognitoSub,
        tokenVersion: user.tokenVersion,
      },
      principal,
    };
  }

  async logout(
    principal: AuthenticatedPrincipal,
  ): Promise<{ message: string }> {
    const user = await this.findByPrincipal(principal);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        tokenVersion: { increment: 1 },
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });

    return { message: 'Session revoked successfully' };
  }

  private buildSessionResponse(
    sub: string,
    email: string,
    role: Role,
    tokenVersion: number,
    cognitoSub: string | null,
  ): AuthSessionResponse {
    const session = this.tokenService.buildSession({
      sub,
      email,
      role,
      tokenVersion,
    });

    return {
      ...session,
      user: {
        id: sub,
        email,
        role,
        cognitoSub,
        tokenVersion,
      },
    };
  }

  private async findLocalUserOrThrow(email: string): Promise<AuthUserRecord> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        cognitoSub: true,
        authRole: true,
        passwordHash: true,
        passwordResetTokenHash: true,
        passwordResetExpiresAt: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async findByPrincipal(
    principal: AuthenticatedPrincipal,
  ): Promise<AuthUserRecord> {
    if (principal.prismaUser?.id) {
      const user = await this.prisma.user.findUnique({
        where: { id: principal.prismaUser.id },
        select: {
          id: true,
          email: true,
          cognitoSub: true,
          authRole: true,
          passwordHash: true,
          passwordResetTokenHash: true,
          passwordResetExpiresAt: true,
          tokenVersion: true,
        },
      });
      if (user) return user;
    }

    if (principal.email) {
      return this.findLocalUserOrThrow(principal.email);
    }

    throw new NotFoundException('Authenticated user not found');
  }

  private resolveRole(authRole: string | null): Role {
    if (authRole === Role.ADMIN) return Role.ADMIN;
    if (authRole === Role.TEACHER) return Role.TEACHER;
    return Role.STUDENT;
  }

  private assertTokenVersion(user: AuthUserRecord, tokenVersion: number): void {
    if (user.tokenVersion !== tokenVersion) {
      throw new UnauthorizedException('Session has been revoked');
    }
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    return `${salt}.${derivedKey.toString('hex')}`;
  }

  private async verifyPassword(
    password: string,
    storedHash: string,
  ): Promise<boolean> {
    return this.verifySecret(password, storedHash);
  }

  private async hashSecret(secret: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scrypt(secret, salt, 64)) as Buffer;
    return `${salt}.${derivedKey.toString('hex')}`;
  }

  private async verifySecret(
    secret: string,
    storedHash: string,
  ): Promise<boolean> {
    const [salt, hash] = storedHash.split('.');
    if (!salt || !hash) return false;

    const derivedKey = (await scrypt(secret, salt, 64)) as Buffer;
    const hashBuffer = Buffer.from(hash, 'hex');
    if (hashBuffer.length !== derivedKey.length) return false;
    return timingSafeEqual(hashBuffer, derivedKey);
  }

  private generateResetCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
