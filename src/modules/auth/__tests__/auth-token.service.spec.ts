import { AuthTokenService } from '@modules/auth/auth-token.service';
import { Role } from '@modules/auth/roles.enum';
import * as jwt from 'jsonwebtoken';

describe('AuthTokenService', () => {
  let service: AuthTokenService;

  const params = {
    sub: 'user-uuid-1',
    email: 'test@innova.demo',
    role: Role.TEACHER,
    tokenVersion: 0,
  };

  beforeEach(() => {
    service = new AuthTokenService();
  });

  describe('signAccessToken', () => {
    it('returns a non-empty JWT string', () => {
      const token = service.signAccessToken(params);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('verifies with verifyAccessToken', () => {
      const token = service.signAccessToken(params);
      const claims = service.verifyAccessToken(token);
      expect(claims.sub).toBe(params.sub);
      expect(claims.email).toBe(params.email);
      expect(claims.role).toBe(params.role);
      expect(claims.token_use).toBe('access');
    });

    it('throws on invalid signature', () => {
      const token = service.signAccessToken(params);
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => service.verifyAccessToken(tampered)).toThrow();
    });
  });

  describe('signRefreshToken', () => {
    it('returns a non-empty JWT string', () => {
      const token = service.signRefreshToken(params);
      expect(typeof token).toBe('string');
    });

    it('verifies with verifyRefreshToken', () => {
      const token = service.signRefreshToken(params);
      const claims = service.verifyRefreshToken(token);
      expect(claims.token_use).toBe('refresh');
      expect(claims.sub).toBe(params.sub);
    });

    it('throws when access token used as refresh token', () => {
      const accessToken = service.signAccessToken(params);
      expect(() => service.verifyRefreshToken(accessToken)).toThrow();
    });
  });

  describe('signResetToken', () => {
    it('returns a JWT signed with reset secret', () => {
      const token = service.signResetToken({
        email: params.email,
        tokenVersion: 0,
      });
      expect(typeof token).toBe('string');
    });

    it('verifies with verifyResetToken', () => {
      const token = service.signResetToken({
        email: params.email,
        tokenVersion: 0,
      });
      const payload = service.verifyResetToken(token);
      expect(typeof payload).toBe('object');
    });
  });

  describe('buildSession', () => {
    it('returns both access and refresh tokens plus metadata', () => {
      const session = service.buildSession(params);
      expect(session.accessToken).toBeDefined();
      expect(session.refreshToken).toBeDefined();
      expect(session.tokenType).toBe('Bearer');
      expect(session.expiresInSeconds).toBe(3600);
    });

    it('access and refresh tokens are different', () => {
      const session = service.buildSession(params);
      expect(session.accessToken).not.toBe(session.refreshToken);
    });

    it('access token claims contain correct role', () => {
      const session = service.buildSession(params);
      const decoded = jwt.decode(session.accessToken) as { role: string };
      expect(decoded.role).toBe(Role.TEACHER);
    });
  });
});
