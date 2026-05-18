import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '@modules/auth/auth.controller';
import { AuthService } from '@modules/auth/auth.service';
import { Role } from '@modules/auth/roles.enum';
import type { SupabaseUser } from '@modules/auth/supabase-jwt.strategy';

const mockSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenType: 'Bearer' as const,
  expiresInSeconds: 3600,
  user: {
    id: 'user-uuid',
    email: 'test@innova.demo',
    role: Role.STUDENT,
    profileId: null,
    supabaseUid: null,
    tokenVersion: 0,
  },
};

const mockAuthService = {
  register: jest.fn().mockResolvedValue(mockSession),
  login: jest.fn().mockResolvedValue(mockSession),
  refresh: jest.fn().mockResolvedValue(mockSession),
  forgotPassword: jest.fn().mockResolvedValue({ message: 'reset link sent' }),
  confirmForgotPassword: jest
    .fn()
    .mockResolvedValue({ message: 'Password updated successfully' }),
  me: jest.fn().mockReturnValue({
    id: 'user-uuid',
    email: 'test@innova.demo',
    role: Role.STUDENT,
  }),
  logout: jest
    .fn()
    .mockReturnValue({ message: 'Session revoked successfully' }),
};

const mockUser: SupabaseUser = {
  supabaseUid: 'supa-uid',
  email: 'test@innova.demo',
  role: Role.STUDENT,
  prismaUserId: 'user-uuid',
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('register delegates to AuthService', async () => {
    const dto = {
      email: 'student@innova.demo',
      password: 'Innova123!',
      role: Role.STUDENT,
    };
    const result = await controller.register(dto);
    expect(mockAuthService.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockSession);
  });

  it('login delegates to AuthService', async () => {
    const dto = { email: 'teacher@innova.demo', password: 'Innova123!' };
    const result = await controller.login(dto);
    expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockSession);
  });

  it('refresh delegates to AuthService', async () => {
    const dto = { refreshToken: 'refresh-token' };
    const result = await controller.refresh(dto);
    expect(mockAuthService.refresh).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockSession);
  });

  it('forgotPassword delegates to AuthService', async () => {
    const dto = { email: 'student@innova.demo' };
    const result = await controller.forgotPassword(dto);
    expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ message: 'reset link sent' });
  });

  it('confirmForgotPassword delegates to AuthService', async () => {
    const dto = {
      email: 'student@innova.demo',
      code: '123456',
      newPassword: 'NewPassword123!',
    };
    const result = await controller.confirmForgotPassword(dto);
    expect(mockAuthService.confirmForgotPassword).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ message: 'Password updated successfully' });
  });

  it('me returns current user profile', () => {
    const req = { user: mockUser };
    const result = controller.me(
      req as unknown as Parameters<typeof controller.me>[0],
    );
    expect(mockAuthService.me).toHaveBeenCalledWith(mockUser);
    expect(result).toEqual({
      id: 'user-uuid',
      email: 'test@innova.demo',
      role: Role.STUDENT,
    });
  });

  it('logout returns revocation message', () => {
    const req = { user: mockUser };
    const result = controller.logout(
      req as unknown as Parameters<typeof controller.logout>[0],
    );
    expect(mockAuthService.logout).toHaveBeenCalledWith(mockUser);
    expect(result).toEqual({ message: 'Session revoked successfully' });
  });
});
