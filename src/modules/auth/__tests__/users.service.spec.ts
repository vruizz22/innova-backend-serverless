import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '@modules/auth/users.service';
import { PrismaService } from '@infrastructure/database/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByCognitoSub()', () => {
    it('should return user when cognitoSub exists in database', async () => {
      const cognitoSub = 'us-east-1:00000000-0000-0000-0000-000000000001';
      const expectedUser = {
        id: 'user-123',
        email: 'teacher@example.com',
        cognitoSub,
      };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(expectedUser);

      const result = await service.findByCognitoSub(cognitoSub);

      expect(result).toEqual(expectedUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { cognitoSub },
      });
    });

    it('should return null when cognitoSub does not exist', async () => {
      const cognitoSub = 'us-east-1:00000000-0000-0000-0000-000000000999';

      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      const result = await service.findByCognitoSub(cognitoSub);

      expect(result).toBeNull();
    });
  });

  describe('findByEmail()', () => {
    it('should return user when email exists in database', async () => {
      const email = 'teacher@example.com';
      const expectedUser = {
        id: 'user-123',
        email,
        cognitoSub: 'us-east-1:00000000-0000-0000-0000-000000000001',
      };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(expectedUser);

      const result = await service.findByEmail(email);

      expect(result).toEqual(expectedUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
    });

    it('should return null when email does not exist', async () => {
      const email = 'unknown@example.com';

      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      const result = await service.findByEmail(email);

      expect(result).toBeNull();
    });
  });

  describe('linkCognitoSubToUser()', () => {
    it('should update user with cognitoSub and return updated user', async () => {
      const userId = 'user-123';
      const cognitoSub = 'us-east-1:00000000-0000-0000-0000-000000000001';
      const updatedUser = {
        id: userId,
        email: 'teacher@example.com',
        cognitoSub,
      };

      mockPrismaService.user.update.mockResolvedValueOnce(updatedUser);

      const result = await service.linkCognitoSubToUser(userId, cognitoSub);

      expect(result).toEqual(updatedUser);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { cognitoSub },
      });
    });

    it('should handle linking multiple users independently', async () => {
      const userId1 = 'user-123';
      const userId2 = 'user-456';
      const cognitoSub1 = 'us-east-1:00000000-0000-0000-0000-000000000001';
      const cognitoSub2 = 'us-east-1:00000000-0000-0000-0000-000000000002';

      mockPrismaService.user.update
        .mockResolvedValueOnce({
          id: userId1,
          email: 'user1@example.com',
          cognitoSub: cognitoSub1,
        })
        .mockResolvedValueOnce({
          id: userId2,
          email: 'user2@example.com',
          cognitoSub: cognitoSub2,
        });

      const result1 = await service.linkCognitoSubToUser(userId1, cognitoSub1);
      const result2 = await service.linkCognitoSubToUser(userId2, cognitoSub2);

      expect(result1.cognitoSub).toBe(cognitoSub1);
      expect(result2.cognitoSub).toBe(cognitoSub2);
      expect(mockPrismaService.user.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('findOrLinkByPayload()', () => {
    it('should find user by cognitoSub if it exists', async () => {
      const sub = 'us-east-1:00000000-0000-0000-0000-000000000001';
      const email = 'teacher@example.com';
      const expectedUser = {
        id: 'user-123',
        email,
        cognitoSub: sub,
      };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(expectedUser);

      const result = await service.findOrLinkByPayload({ sub, email });

      expect(result).toEqual(expectedUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { cognitoSub: sub },
      });
      // Should not query by email if found by sub
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should find and link user by email if cognitoSub is not found', async () => {
      const sub = 'us-east-1:00000000-0000-0000-0000-000000000001';
      const email = 'teacher@example.com';
      const existingUser = {
        id: 'user-123',
        email,
        cognitoSub: null,
      };
      const linkedUser = {
        id: 'user-123',
        email,
        cognitoSub: sub,
      };

      // First call: findUnique by cognitoSub returns null
      // Second call: findUnique by email returns existing user
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingUser);
      mockPrismaService.user.update.mockResolvedValueOnce(linkedUser);

      const result = await service.findOrLinkByPayload({ sub, email });

      expect(result).toEqual(linkedUser);
      // Should have called findUnique twice (by sub, then by email)
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { cognitoSub: sub },
      });
    });

    it('should return null if neither sub nor email exist in database', async () => {
      const sub = 'us-east-1:00000000-0000-0000-0000-000000000999';
      const email = 'unknown@example.com';

      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.findOrLinkByPayload({ sub, email });

      expect(result).toBeNull();
    });

    it('should handle payload without email gracefully', async () => {
      const sub = 'us-east-1:00000000-0000-0000-0000-000000000001';

      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      const result = await service.findOrLinkByPayload({ sub });

      expect(result).toBeNull();
      // Should only query by sub (email is undefined)
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should return null if sub is missing (invalid payload)', async () => {
      const email = 'user@example.com';

      const result = await service.findOrLinkByPayload({ sub: '', email });

      expect(result).toBeNull();
      // Should return early without querying database
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should preserve returned user with cognitoSub after linking', async () => {
      const sub = 'us-east-1:00000000-0000-0000-0000-000000000001';
      const email = 'teacher@example.com';
      const existingUser = {
        id: 'user-123',
        email,
        cognitoSub: null,
      };

      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingUser);
      mockPrismaService.user.update.mockResolvedValueOnce({
        ...existingUser,
        cognitoSub: sub,
      });

      const result = await service.findOrLinkByPayload({ sub, email });

      // Verify that returned user has cognitoSub set
      expect(result?.cognitoSub).toBe(sub);
      expect(result?.email).toBe(email);
    });
  });
});
