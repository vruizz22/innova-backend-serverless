import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '@modules/auth/auth.service';
import { AuthTokenService } from '@modules/auth/auth-token.service';
import { EmailService } from '@modules/auth/email.service';
import { Role } from '@modules/auth/roles.enum';
import { PrismaService } from '@infrastructure/database/prisma.service';

const USER = {
  id: 'user-1',
  email: 'teacher@innova.demo',
  supabaseUid: 'supa-uid-1',
  authRole: 'teacher',
  passwordHash: null as string | null,
  passwordResetTokenHash: null as string | null,
  passwordResetExpiresAt: null as Date | null,
  tokenVersion: 0,
};

function buildMockPrisma(): PrismaService {
  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    user: {
      findUnique: jest.fn().mockResolvedValue(USER),
      upsert: jest.fn().mockResolvedValue(USER),
      update: jest.fn().mockResolvedValue(USER),
    },
    teacher: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'teacher-1', userId: 'user-1' }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'teacher-1', userId: 'user-1' }),
    },
    student: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'student-1' }),
    },
    parent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'parent-1' }),
    },
  } as unknown as PrismaService;
}

function buildMockTokenService() {
  return {
    buildSession: jest.fn().mockReturnValue({
      accessToken: 'mock-access',
      refreshToken: 'mock-refresh',
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
    }),
    verifyRefreshToken: jest.fn().mockReturnValue({
      token_use: 'refresh',
      email: 'teacher@innova.demo',
      tokenVersion: 0,
    }),
    signResetToken: jest.fn().mockReturnValue('mock-reset-token'),
  };
}

function buildMockEmailService() {
  return {
    sendPasswordResetEmail: jest
      .fn()
      .mockResolvedValue({ success: true, messageId: 'msg-1' }),
  };
}

function buildMockConfigService(appUrl = 'http://localhost:3001') {
  return { get: jest.fn().mockReturnValue(appUrl) };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let tokenService: ReturnType<typeof buildMockTokenService>;
  let emailService: ReturnType<typeof buildMockEmailService>;

  beforeEach(() => {
    prisma = buildMockPrisma();
    tokenService = buildMockTokenService();
    emailService = buildMockEmailService();
    const configService = buildMockConfigService();
    service = new AuthService(
      prisma,
      tokenService as unknown as AuthTokenService,
      emailService as unknown as EmailService,
      configService as never,
    );
  });

  describe('register', () => {
    it('creates user and returns session', async () => {
      const result = await service.register({
        email: 'teacher@innova.demo',
        password: 'Innova123!',
        role: Role.TEACHER,
      });
      expect(result.accessToken).toBe('mock-access');
      expect(result.user.role).toBe(Role.TEACHER);
    });

    it('creates student profile for student role', async () => {
      (prisma.user.upsert as jest.Mock).mockResolvedValue({
        ...USER,
        authRole: 'student',
      });
      (prisma.student.findFirst as jest.Mock).mockResolvedValue(null);
      await service.register({
        email: 'student@innova.demo',
        password: 'Innova123!',
        role: Role.STUDENT,
      });
      expect(prisma.student.create as jest.Mock).toHaveBeenCalled();
    });

    it('creates parent profile for parent role', async () => {
      (prisma.user.upsert as jest.Mock).mockResolvedValue({
        ...USER,
        authRole: 'parent',
      });
      (prisma.parent.findFirst as jest.Mock).mockResolvedValue(null);
      await service.register({
        email: 'parent@innova.demo',
        password: 'Innova123!',
        role: Role.PARENT,
      });
      expect(prisma.parent.create as jest.Mock).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('throws NotFoundException when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.login({ email: 'unknown@innova.demo', password: 'Innova123!' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnauthorizedException when no password hash', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...USER,
        passwordHash: null,
      });
      await expect(
        service.login({ email: 'teacher@innova.demo', password: 'Innova123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...USER,
        passwordHash: 'badhash.badhex',
      });
      await expect(
        service.login({
          email: 'teacher@innova.demo',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException for non-refresh token', async () => {
      tokenService.verifyRefreshToken.mockReturnValue({
        token_use: 'access',
      });
      await expect(
        service.refresh({ refreshToken: 'bad-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token version mismatch', async () => {
      tokenService.verifyRefreshToken.mockReturnValue({
        token_use: 'refresh',
        email: 'teacher@innova.demo',
        tokenVersion: 99,
      });
      await expect(
        service.refresh({ refreshToken: 'stale-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns session with matching token version', async () => {
      const result = await service.refresh({ refreshToken: 'valid-refresh' });
      expect(result.accessToken).toBe('mock-access');
    });
  });

  describe('me and logout', () => {
    const user = {
      supabaseUid: 'uid',
      email: 'teacher@innova.demo',
      role: Role.TEACHER,
      prismaUserId: 'user-1',
    };

    it('me returns id, email, role and the resolved profileId', async () => {
      const result = await service.me(user);
      expect(result.email).toBe('teacher@innova.demo');
      expect(result.role).toBe(Role.TEACHER);
      expect(result.profileId).toBe('teacher-1');
    });

    it('logout returns success message', () => {
      const result = service.logout(user);
      expect(result.message).toContain('revoked');
    });
  });
});
