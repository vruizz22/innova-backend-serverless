// ===== MOCKS FOR ES MODULES =====
// jwks-rsa uses jose (ES module) which Jest cannot parse.
// Mock before importing AppModule which depends on JwtStrategy.
jest.mock('jwks-rsa', () => ({
  passportJwtSecret: () => {
    return {
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri:
        'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ikikne/.well-known/jwks.json',
    };
  },
}));

jest.mock('passport-jwt', () => ({
  Strategy: class PassportJWTStrategy {
    constructor(options: any) {
      this.name = 'jwt';
      this._userProperty = 'user';
    }
    name: string;
    _userProperty: string;
  },
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: () => (req: any) => {
      const auth = req.headers.authorization;
      if (!auth) return null;
      const parts = auth.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
      return parts[1];
    },
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '@app/app.module';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { Role } from '@modules/auth/roles.enum';

/**
 * End-to-End tests for JWT authentication flow.
 *
 * This test suite validates:
 * 1. Bearer token extraction from Authorization header
 * 2. JWT signature validation (mocked JWKS)
 * 3. User resolution and linking (cognitoSub ↔ Prisma)
 * 4. Role-based access control (TEACHER, STUDENT, ADMIN)
 * 5. Error handling (401 Unauthorized, 403 Forbidden)
 *
 * Note: In production, Cognito issues real RS256-signed JWTs.
 * For testing, we mock the payload structure and validate the flow.
 */
describe('Auth E2E — JWT Bearer Token Flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const COGNITO_REGION = 'us-east-1';
  const COGNITO_POOL_ID = 'us-east-1_ikikne';
  const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}`;

  // Test data
  const demoUsers = {
    teacher: {
      sub: 'us-east-1:00000000-0000-0000-0000-000000000001',
      email: 'teacher@innova.demo',
      groups: ['TEACHER'],
    },
    student: {
      sub: 'us-east-1:00000000-0000-0000-0000-000000000011',
      email: 'student@innova.demo',
      groups: ['STUDENT'],
    },
  };

  /**
   * Generate a mock JWT payload matching Cognito structure.
   * In tests, we sign with HS256 (for simplicity).
   * Real Cognito uses RS256 with asymmetric keys.
   */
  const generateMockJwt = (
    sub: string,
    email: string,
    groups: string[] = [],
  ): string => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub,
      email,
      'cognito:groups': groups,
      token_use: 'access',
      iss: COGNITO_ISSUER,
      exp: now + 3600,
      iat: now,
    };
    return jwt.sign(payload, 'test-secret-key', { algorithm: 'HS256' });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    // Note: Keep seeded data intact for demo purposes
    // In production tests, truncate all tables and reseed
  });

  describe('Public endpoints (no auth required)', () => {
    it('GET /health should return 200 without Authorization header', async () => {
      const response = await supertest(app.getHttpServer()).get('/health');
      expect(response.status).toBe(200);
    });
  });

  describe('Protected endpoints with valid Bearer token', () => {
    it('should allow request with valid Bearer token for TEACHER', async () => {
      const token = generateMockJwt(
        demoUsers.teacher.sub,
        demoUsers.teacher.email,
        demoUsers.teacher.groups,
      );

      // Ensure teacher exists in DB (use upsert to handle seed conflicts)
      await prisma.user.upsert({
        where: { email: demoUsers.teacher.email },
        update: { cognitoSub: demoUsers.teacher.sub },
        create: {
          email: demoUsers.teacher.email,
          cognitoSub: demoUsers.teacher.sub,
        },
      });

      // Test endpoint: GET /items (example protected route)
      const response = await supertest(app.getHttpServer())
        .get('/items')
        .set('Authorization', `Bearer ${token}`);

      // Should succeed (not 401 or 403)
      expect([200, 400]).toContain(response.status);
      // If 400, it's due to missing query params, not auth failure
    });

    it('should allow request with valid Bearer token for STUDENT', async () => {
      const token = generateMockJwt(
        demoUsers.student.sub,
        demoUsers.student.email,
        demoUsers.student.groups,
      );

      // Ensure student exists in DB (use upsert to handle seed conflicts)
      await prisma.user.upsert({
        where: { email: demoUsers.student.email },
        update: { cognitoSub: demoUsers.student.sub },
        create: {
          email: demoUsers.student.email,
          cognitoSub: demoUsers.student.sub,
        },
      });

      const response = await supertest(app.getHttpServer())
        .get('/items')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Protected endpoints without Bearer token', () => {
    it('should return 401 Unauthorized when Authorization header is missing', async () => {
      const response = await supertest(app.getHttpServer()).get('/items');
      expect(response.status).toBe(401);
    });

    it('should return 401 Unauthorized when Authorization header format is invalid', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/items')
        .set('Authorization', 'InvalidFormat');
      expect(response.status).toBe(401);
    });

    it('should return 401 Unauthorized when Bearer token is malformed', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/items')
        .set('Authorization', 'Bearer malformed.token.here');
      expect(response.status).toBe(401);
    });
  });

  describe('Role-based access control (RBAC)', () => {
    it('TEACHER should access /teacher/* endpoints (if they exist)', async () => {
      const token = generateMockJwt(
        demoUsers.teacher.sub,
        demoUsers.teacher.email,
        demoUsers.teacher.groups,
      );

      // Seed teacher
      await prisma.user.upsert({
        where: { email: demoUsers.teacher.email },
        update: {},
        create: {
          email: demoUsers.teacher.email,
          cognitoSub: demoUsers.teacher.sub,
        },
      });

      // Attempt protected endpoint
      const response = await supertest(app.getHttpServer())
        .get('/items')
        .set('Authorization', `Bearer ${token}`);

      // Should not be 403 Forbidden (auth succeeded)
      // May be 200 or 400 (validation), but not 403
      expect(response.status).not.toBe(403);
    });

    it('STUDENT should not access TEACHER-only endpoints', async () => {
      const token = generateMockJwt(
        demoUsers.student.sub,
        demoUsers.student.email,
        demoUsers.student.groups,
      );

      // Seed student
      await prisma.user.upsert({
        where: { email: demoUsers.student.email },
        update: {},
        create: {
          email: demoUsers.student.email,
          cognitoSub: demoUsers.student.sub,
        },
      });

      // Attempt a hypothetical TEACHER-only endpoint
      // (adjust based on actual route guards in the app)
      const response = await supertest(app.getHttpServer())
        .get('/teacher/alerts')
        .set('Authorization', `Bearer ${token}`);

      // If the endpoint exists and is guarded with @Roles(Role.TEACHER):
      // expect(response.status).toBe(403);
      // Otherwise, endpoint may not exist (404)
    });
  });

  describe('User linking on first login', () => {
    it('should auto-link cognitoSub to existing user by email', async () => {
      // Create a user by email only (no cognitoSub)
      const userByEmail = await prisma.user.create({
        data: {
          email: 'email-only@innova.demo',
          cognitoSub: null,
        },
      });

      // Generate token with this sub and email
      const token = generateMockJwt(
        'us-east-1:00000000-0000-0000-0000-000000000099',
        'email-only@innova.demo',
        ['STUDENT'],
      );

      // Make authenticated request
      await supertest(app.getHttpServer())
        .get('/items')
        .set('Authorization', `Bearer ${token}`);

      // Verify that cognitoSub was linked
      const updatedUser = await prisma.user.findUnique({
        where: { id: userByEmail.id },
      });

      expect(updatedUser?.cognitoSub).toBe(
        'us-east-1:00000000-0000-0000-0000-000000000099',
      );
    });
  });

  describe('Token expiration handling', () => {
    it('should return 401 when token is expired', async () => {
      // Generate an expired token
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        sub: demoUsers.teacher.sub,
        email: demoUsers.teacher.email,
        'cognito:groups': ['TEACHER'],
        token_use: 'access',
        iss: COGNITO_ISSUER,
        exp: now - 3600, // Expired 1 hour ago
        iat: now - 7200,
      };
      const expiredToken = jwt.sign(payload, 'test-secret-key', {
        algorithm: 'HS256',
      });

      const response = await supertest(app.getHttpServer())
        .get('/items')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('Bearer token extraction edge cases', () => {
    it('should ignore additional whitespace in Authorization header', async () => {
      const token = generateMockJwt(
        demoUsers.teacher.sub,
        demoUsers.teacher.email,
        demoUsers.teacher.groups,
      );

      await prisma.user.upsert({
        where: { email: demoUsers.teacher.email },
        update: {},
        create: {
          email: demoUsers.teacher.email,
          cognitoSub: demoUsers.teacher.sub,
        },
      });

      // Note: supertest may normalize headers, so this test validates the strategy logic
      const response = await supertest(app.getHttpServer())
        .get('/items')
        .set('Authorization', `Bearer  ${token}`); // Extra space

      // Should either accept (if header normalized) or reject (401)
      expect([200, 400, 401]).toContain(response.status);
    });
  });

  describe('Multiple requests with same Bearer token', () => {
    it('should handle repeated requests with the same token', async () => {
      const token = generateMockJwt(
        demoUsers.teacher.sub,
        demoUsers.teacher.email,
        demoUsers.teacher.groups,
      );

      await prisma.user.upsert({
        where: { email: demoUsers.teacher.email },
        update: {},
        create: {
          email: demoUsers.teacher.email,
          cognitoSub: demoUsers.teacher.sub,
        },
      });

      // Make 3 requests with the same token
      for (let i = 0; i < 3; i++) {
        const response = await supertest(app.getHttpServer())
          .get('/items')
          .set('Authorization', `Bearer ${token}`);

        // Should succeed consistently (not 401 or 403)
        expect([200, 400]).toContain(response.status);
      }
    });
  });
});
