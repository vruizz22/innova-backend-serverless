import { UserLinkerService } from '@modules/auth/user-linker.service';
import { PrismaService } from '@infrastructure/database/prisma.service';

const SUB = '00000000-0000-0000-0000-000000000001';
const EMAIL = 'test@innova.demo';

type StoredUser = {
  id: string;
  email: string;
  supabaseUid: string | null;
  authRole: string | null;
};

function buildMockPrisma(stored: Map<string, StoredUser>): PrismaService {
  const profiles: Record<string, Record<string, unknown> | null> = {
    student: null,
    teacher: null,
    parent: null,
  };

  const makeProfileMock = (role: 'student' | 'teacher' | 'parent') => ({
    findFirst: jest
      .fn()
      .mockImplementation(() => Promise.resolve(profiles[role])),
    create: jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        profiles[role] = { id: `${role}-id`, ...data };
        return Promise.resolve(profiles[role]);
      }),
    update: jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        profiles[role] = { ...profiles[role], ...data };
        return Promise.resolve(profiles[role]);
      }),
  });

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
              const newUser: StoredUser = {
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
    student: makeProfileMock('student'),
    teacher: makeProfileMock('teacher'),
    parent: makeProfileMock('parent'),
  } as unknown as PrismaService;
}

describe('UserLinkerService', () => {
  let service: UserLinkerService;
  let stored: Map<string, StoredUser>;
  let mockPrisma: PrismaService;

  beforeEach(() => {
    stored = new Map();
    mockPrisma = buildMockPrisma(stored);
    service = new UserLinkerService(mockPrisma);
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

  it('creates a Student profile on first login', async () => {
    await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'student',
    });

    expect((mockPrisma.student as unknown as any).create).toHaveBeenCalledTimes(
      1,
    );
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

  it('does not create a second profile on repeated calls (profile already exists)', async () => {
    await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'student',
    });
    await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'student',
    });

    expect((mockPrisma.student as unknown as any).create).toHaveBeenCalledTimes(
      1,
    );
  });

  it('returns supabaseUid as string (never null)', async () => {
    const result = await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'teacher',
    });
    expect(typeof result.supabaseUid).toBe('string');
  });

  it('creates a Teacher profile on first login', async () => {
    await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'teacher',
    });

    expect((mockPrisma.teacher as unknown as any).create).toHaveBeenCalledTimes(
      1,
    );
  });

  it('creates a Parent profile on first login', async () => {
    await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'parent',
    });

    expect((mockPrisma.parent as unknown as any).create).toHaveBeenCalledTimes(
      1,
    );
  });

  it('creates Student profile even if User row already existed (pre-fix users)', async () => {
    // Simulate a User row that existed before the fix (no profile yet)
    stored.set(SUB, {
      id: 'pre-existing-id',
      email: EMAIL,
      supabaseUid: SUB,
      authRole: 'student',
    });
    await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'student',
    });

    expect((mockPrisma.student as unknown as any).create).toHaveBeenCalledTimes(
      1,
    );
  });

  it('creates Student with real displayName when name is provided', async () => {
    await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'student',
      name: 'Valentina Jara',
    });

    expect((mockPrisma.student as unknown as any).create).toHaveBeenCalledWith({
      data: { userId: 'generated-id', displayName: 'Valentina Jara' },
    });
  });

  it('updates displayName from "Nuevo Alumno" to real name on subsequent login', async () => {
    // First login without name → placeholder
    await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'student',
    });
    // Second login with real name → update
    await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'student',
      name: 'Valentina Jara',
    });

    expect((mockPrisma.student as unknown as any).update).toHaveBeenCalledWith({
      where: { id: 'student-id' },
      data: { displayName: 'Valentina Jara' },
    });
  });

  it('does not update displayName if already customized (not "Nuevo Alumno")', async () => {
    await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'student',
      name: 'Valentina Jara',
    });
    // Second login with a different name should not overwrite a custom displayName
    await service.ensureUser({
      supabaseUid: SUB,
      email: EMAIL,
      role: 'student',
      name: 'Otro Nombre',
    });

    expect(
      (mockPrisma.student as unknown as any).update,
    ).not.toHaveBeenCalled();
  });
});
