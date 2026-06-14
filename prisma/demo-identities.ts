/**
 * Single source of truth for the demo identities used by BOTH:
 *   - the Postgres seed (`prisma/seed.ts`) — writes `users.supabase_uid`, and
 *   - the private Supabase Auth provisioner (`scripts/seed-supabase-auth.ts`).
 *
 * Keeping the UIDs here guarantees the `supabase_uid` written to Postgres equals
 * the `id` of the user created in Supabase Auth, so login works end-to-end on a
 * fresh deploy. NEVER put real credentials here — the demo password is provided
 * at runtime via the `SEED_DEMO_PASSWORD` secret (private to the operator).
 */

export type DemoRole = 'teacher' | 'student' | 'parent';

export interface DemoIdentity {
  readonly email: string;
  readonly supabaseUid: string;
  readonly role: DemoRole;
  readonly displayName: string;
}

/** Deterministic Supabase UIDs (stable across reseeds). */
export const DEMO_SUPABASE_UIDS = {
  teacher: '00000000-0000-0000-0000-000000000001',
  parent: '00000000-0000-0000-0000-000000000021',
  student1: '00000000-0000-0000-0000-000000000011',
  student2: '00000000-0000-0000-0000-000000000012',
  student3: '00000000-0000-0000-0000-000000000013',
  student4: '00000000-0000-0000-0000-000000000014',
  student5: '00000000-0000-0000-0000-000000000015',
} as const;

/** Flat list consumed by the Supabase Auth provisioner. */
export const DEMO_IDENTITIES: readonly DemoIdentity[] = [
  {
    email: 'teacher@innova.demo',
    supabaseUid: DEMO_SUPABASE_UIDS.teacher,
    role: 'teacher',
    displayName: 'Prof. Demo',
  },
  {
    email: 'student1@innova.demo',
    supabaseUid: DEMO_SUPABASE_UIDS.student1,
    role: 'student',
    displayName: 'Diego Vega',
  },
  {
    email: 'student2@innova.demo',
    supabaseUid: DEMO_SUPABASE_UIDS.student2,
    role: 'student',
    displayName: 'Valentina Reyes',
  },
  {
    email: 'student3@innova.demo',
    supabaseUid: DEMO_SUPABASE_UIDS.student3,
    role: 'student',
    displayName: 'Matías Torres',
  },
  {
    email: 'student4@innova.demo',
    supabaseUid: DEMO_SUPABASE_UIDS.student4,
    role: 'student',
    displayName: 'Camila Soto',
  },
  {
    email: 'student5@innova.demo',
    supabaseUid: DEMO_SUPABASE_UIDS.student5,
    role: 'student',
    displayName: 'Benjamín Muñoz',
  },
  {
    email: 'parent@innova.demo',
    supabaseUid: DEMO_SUPABASE_UIDS.parent,
    role: 'parent',
    displayName: 'Apoderado Demo',
  },
];
