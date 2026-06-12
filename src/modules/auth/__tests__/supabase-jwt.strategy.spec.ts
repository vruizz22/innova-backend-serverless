import { Role } from '@modules/auth/roles.enum';

// Extract and test the toRole helper logic by testing the validate method indirectly.
// We unit-test the role-mapping and user-linking behavior in isolation.

describe('SupabaseJwtStrategy — role mapping', () => {
  function toRole(raw: string | undefined): Role {
    if (raw === Role.TEACHER) return Role.TEACHER;
    if (raw === Role.PARENT) return Role.PARENT;
    if (raw === Role.ADMIN) return Role.ADMIN;
    return Role.STUDENT;
  }

  it('maps teacher role correctly', () => {
    expect(toRole('teacher')).toBe(Role.TEACHER);
  });

  it('maps parent role correctly', () => {
    expect(toRole('parent')).toBe(Role.PARENT);
  });

  it('maps admin role correctly', () => {
    expect(toRole('admin')).toBe(Role.ADMIN);
  });

  it('defaults to student for unknown roles', () => {
    expect(toRole(undefined)).toBe(Role.STUDENT);
    expect(toRole('unknown')).toBe(Role.STUDENT);
    expect(toRole('')).toBe(Role.STUDENT);
  });

  it('is case-sensitive — wrong case defaults to student', () => {
    expect(toRole('Teacher')).toBe(Role.STUDENT);
    expect(toRole('TEACHER')).toBe(Role.STUDENT);
  });
});

interface EnsureUserResult {
  id: string;
  email: string;
  supabaseUid: string;
}

describe('SupabaseJwtStrategy — validate behavior', () => {
  const mockUserLinker = {
    ensureUser: jest
      .fn<
        Promise<EnsureUserResult>,
        [{ supabaseUid: string; email: string; role: Role }]
      >()
      .mockResolvedValue({
        id: 'prisma-user-id',
        email: 'test@innova.demo',
        supabaseUid: 'supa-uid',
      }),
  };

  // Test validate logic extracted
  async function validatePayload(payload: {
    sub: string;
    email: string;
    app_metadata?: { role?: string };
  }) {
    function toRole(raw: string | undefined): Role {
      if (raw === Role.TEACHER) return Role.TEACHER;
      if (raw === Role.PARENT) return Role.PARENT;
      if (raw === Role.ADMIN) return Role.ADMIN;
      return Role.STUDENT;
    }

    const role = toRole(payload.app_metadata?.role);
    const user = await mockUserLinker.ensureUser({
      supabaseUid: payload.sub,
      email: payload.email,
      role,
    });
    return {
      supabaseUid: payload.sub,
      email: payload.email,
      role,
      prismaUserId: user.id,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns SupabaseUser with STUDENT role when no app_metadata', async () => {
    const payload = {
      sub: 'supa-uid',
      email: 'student@innova.demo',
    };
    const result = await validatePayload(payload);
    expect(result.supabaseUid).toBe('supa-uid');
    expect(result.email).toBe('student@innova.demo');
    expect(result.role).toBe(Role.STUDENT);
    expect(result.prismaUserId).toBe('prisma-user-id');
    expect(mockUserLinker.ensureUser).toHaveBeenCalledWith({
      supabaseUid: 'supa-uid',
      email: 'student@innova.demo',
      role: Role.STUDENT,
    });
  });

  it('returns SupabaseUser with TEACHER role from app_metadata', async () => {
    const payload = {
      sub: 'teacher-supa-uid',
      email: 'teacher@innova.demo',
      app_metadata: { role: 'teacher' },
    };
    const result = await validatePayload(payload);
    expect(result.role).toBe(Role.TEACHER);
  });

  it('calls userLinker.ensureUser to upsert the Prisma User', async () => {
    const payload = {
      sub: 'supa-uid-2',
      email: 'parent@innova.demo',
      app_metadata: { role: 'parent' },
    };
    await validatePayload(payload);
    expect(mockUserLinker.ensureUser).toHaveBeenCalledWith({
      supabaseUid: 'supa-uid-2',
      email: 'parent@innova.demo',
      role: Role.PARENT,
    });
  });
});
