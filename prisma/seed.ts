import 'dotenv/config';
import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env['DATABASE_URL']!,
});
const prisma = new PrismaClient({ adapter });

const ERROR_TYPES = [
  'BORROW_OMITTED',
  'BORROW_FROM_ZERO_ERROR',
  'SIGN_ERROR',
  'SUBTRAHEND_MINUEND_SWAPPED',
  'PLACE_VALUE_ERROR',
  'BASIC_FACT_ERROR',
  'PARTIAL_BORROW_ERROR',
  'UNCLASSIFIED',
] as const;

interface ItemSeed {
  prompt: string;
  expectedAnswer: number;
  irtA: number;
  irtB: number;
}

const ITEMS_BY_ERROR: Record<string, ItemSeed[]> = {
  BORROW_OMITTED: [
    { prompt: '53 - 26 = ?', expectedAnswer: 27, irtA: 1.2, irtB: -0.3 },
    { prompt: '72 - 48 = ?', expectedAnswer: 24, irtA: 1.1, irtB: -0.1 },
    { prompt: '81 - 35 = ?', expectedAnswer: 46, irtA: 1.3, irtB: 0.2 },
    { prompt: '64 - 27 = ?', expectedAnswer: 37, irtA: 1.0, irtB: -0.5 },
  ],
  BORROW_FROM_ZERO_ERROR: [
    { prompt: '300 - 47 = ?', expectedAnswer: 253, irtA: 1.4, irtB: 0.5 },
    { prompt: '500 - 183 = ?', expectedAnswer: 317, irtA: 1.5, irtB: 0.8 },
    { prompt: '200 - 56 = ?', expectedAnswer: 144, irtA: 1.3, irtB: 0.4 },
    { prompt: '400 - 123 = ?', expectedAnswer: 277, irtA: 1.2, irtB: 0.6 },
  ],
  SIGN_ERROR: [
    { prompt: '35 - 48 = ?', expectedAnswer: -13, irtA: 1.0, irtB: 0.0 },
    { prompt: '24 - 57 = ?', expectedAnswer: -33, irtA: 1.1, irtB: 0.1 },
    { prompt: '12 - 30 = ?', expectedAnswer: -18, irtA: 0.9, irtB: -0.2 },
    { prompt: '41 - 65 = ?', expectedAnswer: -24, irtA: 1.2, irtB: 0.3 },
  ],
  SUBTRAHEND_MINUEND_SWAPPED: [
    { prompt: '46 - 83 = ?', expectedAnswer: -37, irtA: 1.3, irtB: 0.4 },
    { prompt: '23 - 74 = ?', expectedAnswer: -51, irtA: 1.1, irtB: 0.2 },
    { prompt: '15 - 42 = ?', expectedAnswer: -27, irtA: 1.0, irtB: 0.1 },
    { prompt: '37 - 91 = ?', expectedAnswer: -54, irtA: 1.4, irtB: 0.6 },
  ],
  PLACE_VALUE_ERROR: [
    { prompt: '45 - 18 = ?', expectedAnswer: 27, irtA: 1.5, irtB: 0.7 },
    { prompt: '73 - 29 = ?', expectedAnswer: 44, irtA: 1.4, irtB: 0.5 },
    { prompt: '62 - 37 = ?', expectedAnswer: 25, irtA: 1.3, irtB: 0.3 },
    { prompt: '84 - 46 = ?', expectedAnswer: 38, irtA: 1.2, irtB: 0.4 },
  ],
  BASIC_FACT_ERROR: [
    { prompt: '13 - 7 = ?', expectedAnswer: 6, irtA: 0.8, irtB: -1.0 },
    { prompt: '15 - 8 = ?', expectedAnswer: 7, irtA: 0.9, irtB: -0.8 },
    { prompt: '12 - 5 = ?', expectedAnswer: 7, irtA: 0.8, irtB: -0.9 },
    { prompt: '16 - 9 = ?', expectedAnswer: 7, irtA: 1.0, irtB: -0.7 },
  ],
  PARTIAL_BORROW_ERROR: [
    { prompt: '342 - 185 = ?', expectedAnswer: 157, irtA: 1.6, irtB: 0.9 },
    { prompt: '524 - 276 = ?', expectedAnswer: 248, irtA: 1.5, irtB: 0.8 },
    { prompt: '631 - 357 = ?', expectedAnswer: 274, irtA: 1.4, irtB: 0.7 },
    { prompt: '413 - 168 = ?', expectedAnswer: 245, irtA: 1.5, irtB: 0.8 },
  ],
  UNCLASSIFIED: [
    { prompt: '999 - 567 = ?', expectedAnswer: 432, irtA: 2.0, irtB: 1.5 },
    { prompt: '1024 - 768 = ?', expectedAnswer: 256, irtA: 1.8, irtB: 1.2 },
    { prompt: '2001 - 999 = ?', expectedAnswer: 1002, irtA: 1.9, irtB: 1.4 },
    { prompt: '500 - 257 = ?', expectedAnswer: 243, irtA: 1.6, irtB: 1.0 },
  ],
};

const DEMO_PASSWORD = 'Innova123!';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}.${derivedKey.toString('hex')}`;
}

async function main() {
  console.log('🌱 Starting seed...');

  const school = await prisma.school.upsert({
    where: { id: 'seed-school-001' },
    update: {},
    create: { id: 'seed-school-001', name: 'Escuela Innova Demo' },
  });

  const classroom = await prisma.classroom.upsert({
    where: { id: 'seed-classroom-001' },
    update: {},
    create: {
      id: 'seed-classroom-001',
      name: '3° Básico A',
      schoolId: school.id,
    },
  });

  // Demo Cognito subjects (deterministic UUIDs for testing)
  const DEMO_COGNITO_SUBS = {
    teacher: 'us-east-1:00000000-0000-0000-0000-000000000001',
    student1: 'us-east-1:00000000-0000-0000-0000-000000000011',
    student2: 'us-east-1:00000000-0000-0000-0000-000000000012',
    student3: 'us-east-1:00000000-0000-0000-0000-000000000013',
    student4: 'us-east-1:00000000-0000-0000-0000-000000000014',
    student5: 'us-east-1:00000000-0000-0000-0000-000000000015',
  };

  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher@innova.demo' },
    update: {
      cognitoSub: DEMO_COGNITO_SUBS.teacher,
      authRole: 'teacher',
      passwordHash: hashPassword(DEMO_PASSWORD),
    },
    create: {
      email: 'teacher@innova.demo',
      cognitoSub: DEMO_COGNITO_SUBS.teacher,
      authRole: 'teacher',
      passwordHash: hashPassword(DEMO_PASSWORD),
    },
  });

  const teacher = await prisma.teacher.upsert({
    where: { id: 'seed-teacher-001' },
    update: {},
    create: { id: 'seed-teacher-001', userId: teacherUser.id },
  });
  console.log(
    `✅ Teacher: ${teacher.id} (cognitoSub: ${DEMO_COGNITO_SUBS.teacher})`,
  );

  const studentData = [
    { email: 'student1@innova.demo', cognitoSub: DEMO_COGNITO_SUBS.student1 },
    { email: 'student2@innova.demo', cognitoSub: DEMO_COGNITO_SUBS.student2 },
    { email: 'student3@innova.demo', cognitoSub: DEMO_COGNITO_SUBS.student3 },
    { email: 'student4@innova.demo', cognitoSub: DEMO_COGNITO_SUBS.student4 },
    { email: 'student5@innova.demo', cognitoSub: DEMO_COGNITO_SUBS.student5 },
  ];

  for (let i = 0; i < studentData.length; i++) {
    const { email, cognitoSub } = studentData[i];
    const sUser = await prisma.user.upsert({
      where: { email },
      update: {
        cognitoSub,
        authRole: 'student',
        passwordHash: hashPassword(DEMO_PASSWORD),
      },
      create: {
        email,
        cognitoSub,
        authRole: 'student',
        passwordHash: hashPassword(DEMO_PASSWORD),
      },
    });
    await prisma.student.upsert({
      where: { id: `seed-student-00${i + 1}` },
      update: {},
      create: {
        id: `seed-student-00${i + 1}`,
        userId: sUser.id,
        classroomId: classroom.id,
      },
    });
  }
  console.log('✅ 5 Students created with cognitoSub linking');

  const skill = await prisma.skill.upsert({
    where: { key: 'subtraction_borrow' },
    update: {},
    create: {
      key: 'subtraction_borrow',
      name: 'Sustracción con préstamo',
      description: 'Resta con reagrupación para 3° básico',
    },
  });

  await prisma.skillBKTParams.upsert({
    where: { skillId: skill.id },
    update: {},
    create: {
      skillId: skill.id,
      pL0: 0.3,
      pT: 0.1,
      pS: 0.1,
      pG: 0.2,
    },
  });
  console.log(`✅ Skill + BKT params: ${skill.key}`);

  let itemCount = 0;
  for (const [, items] of Object.entries(ITEMS_BY_ERROR)) {
    for (const item of items) {
      await prisma.item.create({
        data: {
          skillId: skill.id,
          content: { prompt: item.prompt, expectedAnswer: item.expectedAnswer },
          irtA: item.irtA,
          irtB: item.irtB,
        },
      });
      itemCount++;
    }
  }
  console.log(`✅ ${itemCount} Items created for subtraction_borrow`);
  console.log(
    `\n🎉 Seed complete! School: "${school.name}", Classroom: "${classroom.name}"`,
  );
  console.log(`   Teacher ID: ${teacher.id}`);
  console.log(`   Skill ID: ${skill.id}`);
  console.log(`   Error types covered: ${ERROR_TYPES.join(', ')}`);
  console.log(
    `\n📌 Demo Cognito mapping (for real Cognito JWT validation in tests):`,
  );
  console.log(`   teacher@innova.demo → ${DEMO_COGNITO_SUBS.teacher}`);
  console.log(
    `\n💡 To add real Cognito groups, run AWS CLI commands (after user signup):`,
  );
  console.log(
    `   aws cognito-idp admin-add-user-to-group --user-pool-id <POOL_ID> --username teacher@innova.demo --group-name TEACHER`,
  );
  console.log(
    `   aws cognito-idp admin-add-user-to-group --user-pool-id <POOL_ID> --username student1@innova.demo --group-name STUDENT`,
  );
  console.log(
    `\n📝 Demo users are seeded with hardcoded cognitoSub for local testing.`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
