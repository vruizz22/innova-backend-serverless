import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) throw new Error('DATABASE_URL env var is not set');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const SUBMISSION_ID = '90a9d291-99d2-4a12-b0b2-6f68bc009647';

  const before = await prisma.guideSubmission.findUnique({
    where: { id: SUBMISSION_ID },
    select: { id: true, status: true, guideQuestionId: true, studentId: true },
  });

  if (!before) {
    console.log(`Submission ${SUBMISSION_ID} not found — nothing to delete.`);
    return;
  }

  console.log('Found submission:', before);

  if (before.status !== 'FAILED') {
    console.error(`Refusing to delete: status is ${before.status}, expected FAILED.`);
    process.exit(1);
  }

  await prisma.guideSubmission.delete({ where: { id: SUBMISSION_ID } });
  console.log(`Deleted submission ${SUBMISSION_ID} (FAILED).`);
}

main()
  .catch((e: unknown) => { console.error(e); process.exit(1); })
  .finally(() => void prisma.$disconnect());
