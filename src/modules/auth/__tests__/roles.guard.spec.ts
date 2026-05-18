import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@modules/auth/roles.guard';
import { ROLES_KEY } from '@modules/auth/roles.decorator';
import { Role } from '@modules/auth/roles.enum';

function buildContext(
  user: { role?: Role } | undefined,
  handler = {},
  klass = {},
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => klass,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = buildContext({ role: Role.STUDENT });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when roles array is empty', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const ctx = buildContext({ role: Role.STUDENT });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when user role matches required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.TEACHER]);
    const ctx = buildContext({ role: Role.TEACHER });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies access when user role does not match required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.TEACHER]);
    const ctx = buildContext({ role: Role.STUDENT });
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('allows access when user role is one of multiple required roles', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.TEACHER, Role.ADMIN]);
    const ctx = buildContext({ role: Role.ADMIN });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('defaults to STUDENT when user has no role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.STUDENT]);
    const ctx = buildContext({}); // no role property
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('defaults to STUDENT when user is undefined', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.TEACHER]);
    const ctx = buildContext(undefined);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('uses ROLES_KEY metadata key', () => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.TEACHER]);
    const ctx = buildContext({ role: Role.TEACHER });
    guard.canActivate(ctx);
    expect(spy).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });
});
