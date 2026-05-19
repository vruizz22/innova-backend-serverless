import { UserLinkerService } from '@modules/auth/user-linker.service';
import { PrismaService } from '@infrastructure/database/prisma.service';

const SUB = '00000000-0000-0000-0000-000000000001';
const EMAIL = 'test@innova.demo';

function buildMockPrisma(
  stored: Map<
    string,
    {
      id: string;
      email: string;
      supabaseUid: string | null;
      authRole: string | null;
    }
  >,
): PrismaService {
  return {
    ensureConnected: jest.fn().mockResolvedValue(undefined),
    user: {
      upsert: jest
        .fn()
        .mockImplementation(
          ({
            where,
            create,
          }: {
            where: { supabaseUid: string };
            create: { supabaseUid: string; email: string; authRole: string };
          }) => {
            const key = where.supabaseUid;
            const existing = stored.get(key);
            if (!existing) {
              const newUser = {
                id: 'generated-id',
                email: create.email,
                supabaseUid: create.supabaseUid,
                authRole: create.authRole,
              };
              stored.set(key, newUser);
              return Promise.resolve({
                id: newUser.id,
                email: newUser.email,
                supabaseUid: newUser.supabaseUid,
              });
            }
            return Promise.resolve({
              id: existing.id,
              email: existing.email,
              supabaseUid: existing.supabaseUid,
            });
          },
        ),
    },
  } as unknown as PrismaService;
}

describe('UserLinkerService', () => {
  let service: UserLinkerService;
  let stored: Map<
    string,
    {
      id: string;
      email: string;
      supabaseUid: string | null;
      authRole: string | null;
    }
  >;

  beforeEach(() => {
    stored = new Map();
    service = new UserLinkerService(buildMockPrisma(stored));
  });

  it('creates a new user on first login', async () => {
    const result = await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'student',
    });
    expect(result.supabaseUid).toBe(SUB);
    expect(result.email).toBe(EMAIL);
    expect(result.id).toBeDefined();
  });

  it('is idempotent — returns same user on repeated calls', async () => {
    const first = await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'student',
    });
    const second = await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'student',
    });
    expect(first.id).toBe(second.id);
    expect(first.supabaseUid).toBe(second.supabaseUid);
  });

  it('returns supabaseUid as string (never null)', async () => {
    const result = await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'teacher',
    });
    expect(typeof result.supabaseUid).toBe('string');
  });

  it('works for teacher role', async () => {
    const result = await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'teacher',
    });
    expect(result.email).toBe(EMAIL);
  });

  it('works for parent role', async () => {
    const result = await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'parent',
    });
    expect(result.email).toBe(EMAIL);
  });
});
