import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { UsersService } from '@modules/auth/users.service';
import { Role } from '@modules/auth/roles.enum';
import * as jwt from 'jsonwebtoken';

// Mock jwks-rsa and passport-jwt to avoid ES module issues
jest.mock('jwks-rsa', () => {
  return {
    passportJwtSecret: jest.fn(() => {
      // Return a mocked secret provider function
      return (header: any, callback: any) => {
        callback(null, 'test-secret-key');
      };
    }),
  };
});

jest.mock('passport-jwt', () => ({
  Strategy: class MockStrategy {
    name = 'jwt';
  },
}));

// Import after mocking to use mocked modules
import {
  JwtStrategy,
  AuthenticatedPrincipal,
} from '@modules/auth/jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: UsersService;
  const mockUsersService = {
    findOrLinkByPayload: jest.fn(),
  };

  /**
   * Generate a mock JWT signed with RS256 (HS256 fallback for local testing).
   * In production, Cognito issues real RS256-signed tokens.
   * For testing, we simulate the JWKS payload structure.
   */
  const generateMockJwt = (payload: Record<string, unknown>): string => {
    // Use HS256 for local testing (not production-safe)
    // Real Cognito uses RS256 with JWKS validation
    return jwt.sign(payload, 'test-secret-key', { algorithm: 'HS256' });
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtStrategy,
          useFactory: (usersService: UsersService) => {
            // Override environment for testing
            process.env['COGNITO_REGION'] = 'us-east-1';
            process.env['COGNITO_USER_POOL_ID'] = 'us-east-1_ikikne';
            return new JwtStrategy(usersService);
          },
          inject: [UsersService],
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    usersService = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate()', () => {
    describe('Happy path: valid JWT with TEACHER role', () => {
      it('should return AuthenticatedPrincipal with role=TEACHER when cognito:groups contains TEACHER', async () => {
        const payload = {
          sub: 'us-east-1:00000000-0000-0000-0000-000000000001',
          email: 'teacher@example.com',
          'cognito:groups': ['TEACHER'],
          token_use: 'access',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ikikne',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        };

        const prismaUser = {
          id: 'user-123',
          email: 'teacher@example.com',
          cognitoSub: payload.sub,
        };

        mockUsersService.findOrLinkByPayload.mockResolvedValueOnce(prismaUser);

        const result = await strategy.validate(payload);

        expect(result).toMatchObject({
          sub: payload.sub,
          email: payload.email,
          role: Role.TEACHER,
          prismaUser,
          token_use: 'access',
        });
        expect(mockUsersService.findOrLinkByPayload).toHaveBeenCalledWith({
          sub: payload.sub,
          email: payload.email,
        });
      });

      it('should return AuthenticatedPrincipal with role=STUDENT when cognito:groups contains STUDENT', async () => {
        const payload = {
          sub: 'us-east-1:00000000-0000-0000-0000-000000000011',
          email: 'student1@example.com',
          'cognito:groups': ['STUDENT'],
          token_use: 'access',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ikikne',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        };

        const prismaUser = {
          id: 'user-456',
          email: 'student1@example.com',
          cognitoSub: payload.sub,
        };

        mockUsersService.findOrLinkByPayload.mockResolvedValueOnce(prismaUser);

        const result = await strategy.validate(payload);

        expect(result.role).toBe(Role.STUDENT);
        expect(result.prismaUser).toEqual(prismaUser);
      });

      it('should return AuthenticatedPrincipal with role=ADMIN when cognito:groups contains ADMIN', async () => {
        const payload = {
          sub: 'us-east-1:00000000-0000-0000-0000-000000000099',
          email: 'admin@example.com',
          'cognito:groups': ['ADMIN'],
          token_use: 'access',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ikikne',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        };

        const prismaUser = {
          id: 'user-999',
          email: 'admin@example.com',
          cognitoSub: payload.sub,
        };

        mockUsersService.findOrLinkByPayload.mockResolvedValueOnce(prismaUser);

        const result = await strategy.validate(payload);

        expect(result.role).toBe(Role.ADMIN);
      });
    });

    describe('Edge cases: missing or malformed cognito:groups', () => {
      it('should return AuthenticatedPrincipal with undefined role when cognito:groups is absent', async () => {
        const payload = {
          sub: 'us-east-1:00000000-0000-0000-0000-000000000020',
          email: 'user@example.com',
          token_use: 'access',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ikikne',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        };

        const prismaUser = {
          id: 'user-xyz',
          email: 'user@example.com',
          cognitoSub: payload.sub,
        };

        mockUsersService.findOrLinkByPayload.mockResolvedValueOnce(prismaUser);

        const result = await strategy.validate(payload);

        expect(result.role).toBeUndefined();
        expect(result.prismaUser).toEqual(prismaUser);
      });

      it('should handle empty cognito:groups array gracefully', async () => {
        const payload = {
          sub: 'us-east-1:00000000-0000-0000-0000-000000000021',
          email: 'user@example.com',
          'cognito:groups': [],
          token_use: 'access',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ikikne',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        };

        const prismaUser = {
          id: 'user-empty',
          email: 'user@example.com',
          cognitoSub: payload.sub,
        };

        mockUsersService.findOrLinkByPayload.mockResolvedValueOnce(prismaUser);

        const result = await strategy.validate(payload);

        expect(result.role).toBeUndefined();
      });
    });

    describe('Case insensitivity for group names', () => {
      it('should recognize "teacher" (lowercase) as Role.TEACHER', async () => {
        const payload = {
          sub: 'us-east-1:00000000-0000-0000-0000-000000000030',
          email: 'teacher@example.com',
          'cognito:groups': ['teacher'],
          token_use: 'access',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ikikne',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        };

        mockUsersService.findOrLinkByPayload.mockResolvedValueOnce({
          id: 'user-case',
          email: payload.email,
          cognitoSub: payload.sub,
        });

        const result = await strategy.validate(payload);

        expect(result.role).toBe(Role.TEACHER);
      });
    });

    describe('User linking logic', () => {
      it('should call usersService.findOrLinkByPayload with sub and email', async () => {
        const payload = {
          sub: 'us-east-1:00000000-0000-0000-0000-000000000040',
          email: 'newuser@example.com',
          'cognito:groups': ['STUDENT'],
          token_use: 'access',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ikikne',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        };

        mockUsersService.findOrLinkByPayload.mockResolvedValueOnce({
          id: 'user-linked',
          email: payload.email,
          cognitoSub: payload.sub,
        });

        await strategy.validate(payload);

        expect(mockUsersService.findOrLinkByPayload).toHaveBeenCalledWith({
          sub: payload.sub,
          email: payload.email,
        });
      });

      it('should handle null prismaUser (new user not yet in DB)', async () => {
        const payload = {
          sub: 'us-east-1:00000000-0000-0000-0000-000000000050',
          email: 'unknown@example.com',
          token_use: 'access',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ikikne',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        };

        mockUsersService.findOrLinkByPayload.mockResolvedValueOnce(null);

        const result = await strategy.validate(payload);

        expect(result.prismaUser).toBeNull();
        expect(result.sub).toBe(payload.sub);
      });
    });

    describe('Full payload propagation', () => {
      it('should preserve all JWT fields in returned AuthenticatedPrincipal', async () => {
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const iat = Math.floor(Date.now() / 1000);
        const payload = {
          sub: 'us-east-1:00000000-0000-0000-0000-000000000060',
          email: 'full@example.com',
          'cognito:groups': ['TEACHER'],
          token_use: 'access',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ikikne',
          exp,
          iat,
        };

        mockUsersService.findOrLinkByPayload.mockResolvedValueOnce({
          id: 'user-full',
          email: payload.email,
          cognitoSub: payload.sub,
        });

        const result = await strategy.validate(payload);

        expect(result).toEqual({
          sub: payload.sub,
          email: payload.email,
          role: Role.TEACHER,
          prismaUser: {
            id: 'user-full',
            email: payload.email,
            cognitoSub: payload.sub,
          },
          token_use: 'access',
          iss: payload.iss,
          exp,
          iat,
        });
      });
    });
  });
});
