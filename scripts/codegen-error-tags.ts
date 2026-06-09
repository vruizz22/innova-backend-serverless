/**
 * Reads all ACTIVE ErrorTag rows from DB and generates
 * src/shared/domain/error-tags.generated.ts with a typed const enum + helpers.
 *
 * Run: pnpm codegen:error-tags
 * Pre-commit hook validates the generated file is in sync.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

import { PrismaPg } from '@prisma/adapter-pg';
import { ErrorStatus, PrismaClient } from '@prisma/client';

const OUTPUT_PATH = path.join(
  __dirname,
  '../src/shared/domain/error-tags.generated.ts',
);

const adapter = new PrismaPg({
  connectionString: process.env['DATABASE_URL']!,
});
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const tags = await prisma.errorTag.findMany({
    where: { status: ErrorStatus.ACTIVE },
    include: { domain: { select: { code: true } } },
    orderBy: [{ domainId: 'asc' }, { code: 'asc' }],
  });

  if (tags.length === 0) {
    console.error('❌ No ACTIVE ErrorTag rows found — run seeds first.');
    process.exit(1);
  }

  const enumEntries = tags.map((t) => `  ${t.code} = '${t.code}',`).join('\n');

  const domainMap = tags
    .filter((t) => t.domain !== null)
    .map((t) => `  [ErrorTagCode.${t.code}]: '${t.domain!.code}',`)
    .join('\n');

  const deprecatedSet = tags
    .filter((t) => t.deprecatedById !== null)
    .map((t) => `  ErrorTagCode.${t.code},`)
    .join('\n');

  const output = `// AUTO-GENERATED — do not edit manually.
// Run: pnpm tsx scripts/codegen-error-tags.ts
// Generated: ${new Date().toISOString()} (${tags.length} ACTIVE tags)

export const enum ErrorTagCode {
${enumEntries}
}

const DOMAIN_MAP: Partial<Record<ErrorTagCode, string>> = {
${domainMap}
};

const DEPRECATED_SET = new Set<ErrorTagCode>([
${deprecatedSet}
]);

export function getDomain(tag: ErrorTagCode): string | undefined {
  return DOMAIN_MAP[tag];
}

export function isDeprecated(tag: ErrorTagCode): boolean {
  return DEPRECATED_SET.has(tag);
}

export const ALL_ERROR_TAG_CODES = Object.values(ErrorTagCode) as ErrorTagCode[];
`;

  fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
  console.log(
    `✅ Generated ${OUTPUT_PATH} with ${tags.length} ACTIVE error tags.`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Codegen failed:', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
