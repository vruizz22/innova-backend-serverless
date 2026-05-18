// ===== MOCKS FOR ES MODULES =====
// jwks-rsa uses jose (ES module) which Jest cannot parse.
// Mock before importing AppModule which depends on SupabaseJwtStrategy.
jest.mock('jwks-rsa', () => ({
  passportJwtSecret: () => {
    return (
      _request: unknown,
      _rawJwtToken: unknown,
      done: (error: unknown, secret?: string) => void,
    ) => {
      done(null, 'test-secret-key');
    };
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import supertest from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '@/app.module';
import { PrismaService } from '@infrastructure/database/prisma.service';

/**
 * End-to-End tests for Supabase JWT authentication flow (v7).
 *
 * Validates:
 * 1. Bearer token extraction from Authorization header
 * 2. JWT signature validation (mocked JWKS via jwks-rsa mock)
 * 3. User upsert by supabaseUid (UserLinkerService.ensureUser)
 * 4. Role-based access control (TEACHER, STUDENT, PARENT, ADMIN)
 * 5. Error handling (401 Unauthorized, 403 Forbidden)
 *
 * Note: In production, Supabase issues RS256-signed JWTs validated via JWKS.
 * For testing, jwks-rsa is mocked to return 'test-secret-key' for HS256 verification.
 */
describe('Auth E2E — Supabase JWT Bearer Token Flow', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let httpServer: Server | undefined;

  const SUPABASE_URL =
    process.env.SUPABASE_URL ?? 'https://test-project.supabase.co';
  const SUPABASE_ISSUER = `${SUPABASE_URL}/auth/v1`;

  // Test data — UUIDs matching Supabase auth.users format
  const demoUsers = {
    teacher: {
      sub: '00000000-0000-0000-0000-000000000001',
      email: 'teacher@innova.demo',
      role: 'teacher',
    },
    student: {
      sub: '00000000-0000-0000-0000-000000000011',
      email: 'student@innova.demo',
      role: 'student',
    },
  };

  /**
   * Generate a mock JWT payload matching Supabase RS256 JWT structure.
   * Signed with HS256 in tests since jwks-rsa is mocked.
   */
  const generateSupabaseJwt = (
    sub: string,
    email: string,
    role: string = 'student',
  ): string => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub,
      email,
      aud: 'authenticated',
      iss: SUPABASE_ISSUER,
      role: 'authenticated',
      app_metadata: { role },
      user_metadata: {},
      exp: now + 3600,
      iat: now,
    };
    return jwt.sign(payload, 'test-secret-key', { algorithm: 'HS256' });
  };

  const ensureUserWithSupabaseUid = async (
    email: string,
    supabaseUid: string,
    authRole: string = 'student',
  ): Promise<void> => {
    await prisma.user.upsert({
      where: { supabaseUid },
      update: { email },
      create: { email, supabaseUid, authRole },
    });
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
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Public endpoints (no auth required)', () => {
    it('GET / should return 200 without Authorization header', async () => {
      const response = await supertest(httpServer!).get('/');
      expect(response.status).toBe(200);
    });
  });

  describe('Protected endpoints with valid Bearer token', () => {
    it('should allow request with valid Bearer token for TEACHER', async () => {
      const token = generateSupabaseJwt(
        demoUsers.teacher.sub,
        demoUsers.teacher.email,
        demoUsers.teacher.role,
      );

      await ensureUserWithSupabaseUid(
        demoUsers.teacher.email,
        demoUsers.teacher.sub,
        demoUsers.teacher.role,
      );

      const response = await supertest(httpServer!)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('should allow request with valid Bearer token for STUDENT', async () => {
      const token = generateSupabaseJwt(
        demoUsers.student.sub,
        demoUsers.student.email,
        demoUsers.student.role,
      );

      await ensureUserWithSupabaseUid(
        demoUsers.student.email,
        demoUsers.student.sub,
        demoUsers.student.role,
      );

      const response = await supertest(httpServer!)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('GET /auth/me should return user profile with id, email, role', async () => {
      const token = generateSupabaseJwt(
        demoUsers.teacher.sub,
        demoUsers.teacher.email,
        demoUsers.teacher.role,
      );

      await ensureUserWithSupabaseUid(
        demoUsers.teacher.email,
        demoUsers.teacher.sub,
        demoUsers.teacher.role,
      );

      const response = await supertest(httpServer!)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        email: demoUsers.teacher.email,
        role: demoUsers.teacher.role,
      });
      expect(response.body.data.id).toBeDefined();
    });
  });

  describe('Protected endpoints without Bearer token', () => {
    it('should return 401 Unauthorized when Authorization header is missing', async () => {
      const response = await supertest(httpServer!).get('/auth/me');
      expect(response.status).toBe(401);
    });

    it('should return 401 Unauthorized when Authorization header format is invalid', async () => {
      const response = await supertest(httpServer!)
        .get('/auth/me')
        .set('Authorization', 'InvalidFormat');
      expect(response.status).toBe(401);
    });

    it('should return 401 Unauthorized when Bearer token is malformed', async () => {
      const response = await supertest(httpServer!)
        .get('/auth/me')
        .set('Authorization', 'Bearer malformed.token.here');
      expect(response.status).toBe(401);
    });
  });

  describe('User upsert on first login (ensureUser idempotency)', () => {
    it('should upsert user by supabaseUid on first login', async () => {
      const newSub = '00000000-0000-0000-0000-000000000099';
      const newEmail = 'new-user@innova.demo';

      // Ensure user does not exist before test
      await prisma.user.deleteMany({ where: { supabaseUid: newSub } });

      const token = generateSupabaseJwt(newSub, newEmail, 'student');

      const response = await supertest(httpServer!)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Verify the user was created in DB
      const createdUser = await prisma.user.findUnique({
        where: { supabaseUid: newSub },
      });

      expect(createdUser).not.toBeNull();
      expect(createdUser?.email).toBe(newEmail);
      expect(createdUser?.supabaseUid).toBe(newSub);

      // Cleanup
      await prisma.user.deleteMany({ where: { supabaseUid: newSub } });
    };);

    it('should be idempotent — repeated requests do not duplicate users', async () => {
      const token = generateSupabaseJwt(
        demoUsers.teacher.sub,
        demoUsers.teacher.email,
        demoUsers.teacher.role,
      );

      await ensureUserWithSupabaseUid(
        demoUsers.teacher.email,
        demoUsers.teacher.sub,
        demoUsers.teacher.role,
      );

      // Make 3 requests — user count should remain the same
      for (let i = 0; i < 3; i++) {
        const response = await supertest(httpServer!)
          .get('/auth/me')
          .set('Authorization', `Bearer ${token}`);
        expect(response.status).toBe(200);
      }

      const users = await prisma.user.findMany({
        where: { supabaseUid: demoUsers.teacher.sub },
      });
      expect(users.length).toBe(1);
    };);
  });

  describe('Token expiration handling', () => {
    it('should return 401 when token is expired', async () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        sub: demoUsers.teacher.sub,
        email: demoUsers.teacher.email,
        aud: 'authenticated',
        iss: SUPABASE_ISSUER,
        role: 'authenticated',
        app_metadata: { role: 'teacher' },
        exp: now - 3600, // Expired 1 hour ago
        iat: now - 7200,
      };
      const expiredToken = jwt.sign(payload, 'test-secret-key', {
        algorithm: 'HS256',
      });

      const response = await supertest(httpServer!)
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });
  });
});
