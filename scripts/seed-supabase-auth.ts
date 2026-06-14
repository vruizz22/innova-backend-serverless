/**
 * Private Supabase Auth provisioner — creates the demo accounts in Supabase Auth
 * with the SAME deterministic UIDs the Postgres seed writes, so you can log in on
 * a freshly deployed environment to smoke-test the deploy.
 *
 * Why this exists: `prisma/seed.ts` only writes `users.supabase_uid` in Postgres.
 * Without the matching Supabase Auth users, nobody can actually authenticate. This
 * script closes that gap — but it is INTENTIONALLY private:
 *   - The demo password is NEVER in the repo; it comes from `SEED_DEMO_PASSWORD`.
 *   - It refuses to run unless `ALLOW_SEED=1` (anti-accident guard).
 *   - It is only wired into a `workflow_dispatch` workflow (collaborators only) and
 *     local runs that already hold the prod service-role key. No public endpoint.
 *
 * Uses the Supabase Admin REST API via global `fetch` (Node 18+) — no extra deps.
 *
 * Usage (local):
 *   ALLOW_SEED=1 \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SEED_DEMO_PASSWORD=... \
 *   pnpm seed:auth [--dry-run]
 */
import 'dotenv/config';

import { DEMO_IDENTITIES, type DemoIdentity } from '../prisma/demo-identities';

const DRY_RUN = process.argv.includes('--dry-run');

interface SupabaseAdminUser {
  readonly id: string;
  readonly email: string | null;
}

interface SupabaseAdminError {
  readonly code?: number;
  readonly error_code?: string;
  readonly msg?: string;
  readonly message?: string;
}

type ProvisionOutcome = 'created' | 'updated' | 'conflict' | 'dry-run';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function assertAllowed(): void {
  const allow = process.env['ALLOW_SEED'];
  if (allow !== '1' && allow !== 'true') {
    throw new Error(
      'Refusing to run: set ALLOW_SEED=1 to confirm you intend to provision Supabase Auth users.',
    );
  }
}

function isDuplicate(status: number, body: SupabaseAdminError): boolean {
  if (status === 409 || status === 422) return true;
  const text =
    `${body.error_code ?? ''} ${body.msg ?? ''} ${body.message ?? ''}`.toLowerCase();
  return (
    text.includes('already') ||
    text.includes('registered') ||
    text.includes('exists')
  );
}

async function adminRequest(
  url: string,
  method: 'POST' | 'PUT',
  serviceRoleKey: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: SupabaseAdminUser & SupabaseAdminError }> {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as SupabaseAdminUser &
    SupabaseAdminError;
  return { status: res.status, body };
}

async function provision(
  identity: DemoIdentity,
  baseUrl: string,
  serviceRoleKey: string,
  password: string,
): Promise<ProvisionOutcome> {
  if (DRY_RUN) {
    console.log(
      `  [dry-run] would upsert ${identity.email} (uid=${identity.supabaseUid}, role=${identity.role})`,
    );
    return 'dry-run';
  }

  const createPayload: Record<string, unknown> = {
    id: identity.supabaseUid,
    email: identity.email,
    password,
    email_confirm: true,
    app_metadata: { role: identity.role, provider: 'email' },
    user_metadata: { display_name: identity.displayName },
  };

  const created = await adminRequest(
    `${baseUrl}/admin/users`,
    'POST',
    serviceRoleKey,
    createPayload,
  );

  if (created.status >= 200 && created.status < 300) {
    return 'created';
  }

  if (!isDuplicate(created.status, created.body)) {
    throw new Error(
      `Create failed for ${identity.email} (HTTP ${created.status}): ` +
        `${created.body.msg ?? created.body.message ?? JSON.stringify(created.body)}`,
    );
  }

  // Already exists — update password + confirm by deterministic id (idempotent).
  const updated = await adminRequest(
    `${baseUrl}/admin/users/${identity.supabaseUid}`,
    'PUT',
    serviceRoleKey,
    {
      password,
      email_confirm: true,
      app_metadata: { role: identity.role, provider: 'email' },
      user_metadata: { display_name: identity.displayName },
    },
  );

  if (updated.status >= 200 && updated.status < 300) {
    return 'updated';
  }

  // The email is taken by a user whose id != our deterministic UID — manual fix needed.
  console.warn(
    `  ⚠️  ${identity.email} exists under a different id than ${identity.supabaseUid}. ` +
      `Delete the conflicting Supabase Auth user (or align its id) and re-run. ` +
      `(HTTP ${updated.status}: ${updated.body.msg ?? updated.body.message ?? 'unknown'})`,
  );
  return 'conflict';
}

async function main(): Promise<void> {
  assertAllowed();

  const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const password = requireEnv('SEED_DEMO_PASSWORD');
  if (password.length < 8) {
    throw new Error('SEED_DEMO_PASSWORD must be at least 8 characters.');
  }

  const baseUrl = `${supabaseUrl}/auth/v1`;
  console.log(
    `🔐 Provisioning ${DEMO_IDENTITIES.length} demo users in Supabase Auth (${supabaseUrl})${
      DRY_RUN ? ' [DRY RUN]' : ''
    }`,
  );

  const tally: Record<ProvisionOutcome, number> = {
    created: 0,
    updated: 0,
    conflict: 0,
    'dry-run': 0,
  };

  for (const identity of DEMO_IDENTITIES) {
    const outcome = await provision(
      identity,
      baseUrl,
      serviceRoleKey,
      password,
    );
    tally[outcome] += 1;
    if (outcome === 'created' || outcome === 'updated') {
      console.log(`  ✅ ${outcome.padEnd(7)} ${identity.email}`);
    }
  }

  console.log(
    `\n🎉 Done — created: ${tally.created}, updated: ${tally.updated}, conflicts: ${tally.conflict}.`,
  );
  if (tally.conflict > 0) {
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error(
    '❌ Supabase Auth seed failed:',
    e instanceof Error ? e.message : e,
  );
  process.exit(1);
});
