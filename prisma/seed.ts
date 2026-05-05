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

// Mastery data per student×skill (p_known values)
// student index (0-4) × skill key → p_known
const MASTERY_DATA: Array<Record<string, number>> = [
  // student1 — Diego Vega — weak in subtraction, medium in others
  {
    subtraction_borrow: 0.22,
    addition_carry: 0.55,
    multiplication_table: 0.61,
    long_division: 0.38,
  },
  // student2 — strong overall
  {
    subtraction_borrow: 0.82,
    addition_carry: 0.88,
    multiplication_table: 0.79,
    long_division: 0.74,
  },
  // student3 — mixed
  {
    subtraction_borrow: 0.68,
    addition_carry: 0.45,
    multiplication_table: 0.72,
    long_division: 0.31,
  },
  // student4 — medium across the board
  {
    subtraction_borrow: 0.53,
    addition_carry: 0.60,
    multiplication_table: 0.48,
    long_division: 0.55,
  },
  // student5 — weak in subtraction and division
  {
    subtraction_borrow: 0.35,
    addition_carry: 0.71,
    multiplication_table: 0.65,
    long_division: 0.29,
  },
];

async function main() {
  console.log('🌱 Starting seed...');

  const school = await prisma.school.upsert({
    where: { id: 'seed-school-001' },
    update: {},
    create: { id: 'seed-school-001', name: 'Escuela Innova Demo' },
  });

  const classroom = await prisma.classroom.upsert({
    where: { id: 'seed-classroom-001' },
    update: { name: '4° A · Matemáticas' },
    create: {
      id: 'seed-classroom-001',
      name: '4° A · Matemáticas',
      schoolId: school.id,
    },
  });

  // Demo Cognito subjects (deterministic UUIDs for testing)
  const DEMO_COGNITO_SUBS = {
    teacher: 'us-east-1:00000000-0000-0000-0000-000000000001',
    parent: 'us-east-1:00000000-0000-0000-0000-000000000021',
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

  // Link teacher to classroom
  await prisma.teacherClassroom.upsert({
    where: { teacherId_classroomId: { teacherId: teacher.id, classroomId: classroom.id } },
    update: {},
    create: { teacherId: teacher.id, classroomId: classroom.id },
  });

  console.log(`✅ Teacher: ${teacher.id} linked to classroom "${classroom.name}"`);

  const studentNames = ['Diego Vega', 'Valentina Reyes', 'Matías Torres', 'Camila Soto', 'Benjamín Muñoz'];
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
        email,
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
  console.log(`✅ 5 Students (${studentNames.join(', ')}) created in classroom`);

  const parentUser = await prisma.user.upsert({
    where: { email: 'parent@innova.demo' },
    update: {
      cognitoSub: DEMO_COGNITO_SUBS.parent,
      authRole: 'parent',
      passwordHash: hashPassword(DEMO_PASSWORD),
    },
    create: {
      email: 'parent@innova.demo',
      cognitoSub: DEMO_COGNITO_SUBS.parent,
      authRole: 'parent',
      passwordHash: hashPassword(DEMO_PASSWORD),
    },
  });

  const parent = await prisma.parent.upsert({
    where: { id: 'seed-parent-001' },
    update: {},
    create: { id: 'seed-parent-001', userId: parentUser.id },
  });

  await prisma.parentLink.upsert({
    where: { id: 'seed-parent-link-001' },
    update: {},
    create: {
      id: 'seed-parent-link-001',
      parentId: parent.id,
      studentId: 'seed-student-001',
    },
  });
  console.log(`✅ Parent linked to Diego Vega (seed-student-001)`);

  // === Skills ===
  const skillDefs = [
    { key: 'subtraction_borrow', name: 'Sustracción con préstamo', description: 'Resta con reagrupación para 4° básico' },
    { key: 'addition_carry', name: 'Suma con llevada', description: 'Suma con reagrupación de decenas' },
    { key: 'multiplication_table', name: 'Tablas de multiplicar', description: 'Multiplicación básica 1–10' },
    { key: 'long_division', name: 'División larga', description: 'División con cociente de 2+ cifras' },
  ];

  const skillMap: Record<string, string> = {};
  for (const def of skillDefs) {
    const skill = await prisma.skill.upsert({
      where: { key: def.key },
      update: {},
      create: {
        key: def.key,
        name: def.name,
        description: def.description,
      },
    });
    skillMap[def.key] = skill.id;

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
  }
  console.log(`✅ 4 Skills created: ${skillDefs.map(s => s.key).join(', ')}`);

  // === Items for subtraction_borrow skill ===
  await prisma.item.deleteMany({
    where: {
      skillId: skillMap['subtraction_borrow'],
      attempts: { none: {} },
    },
  });

  let itemCount = 0;
  for (const [errorType, items] of Object.entries(ITEMS_BY_ERROR)) {
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      await prisma.item.upsert({
        where: { id: `seed-item-${errorType.toLowerCase()}-${index + 1}` },
        update: {
          content: { prompt: item.prompt, expectedAnswer: item.expectedAnswer },
          irtA: item.irtA,
          irtB: item.irtB,
        },
        create: {
          id: `seed-item-${errorType.toLowerCase()}-${index + 1}`,
          skillId: skillMap['subtraction_borrow'],
          content: { prompt: item.prompt, expectedAnswer: item.expectedAnswer },
          irtA: item.irtA,
          irtB: item.irtB,
        },
      });
      itemCount++;
    }
  }
  console.log(`✅ ${itemCount} Items created for subtraction_borrow`);

  // === StudentSkillMastery records ===
  for (let i = 0; i < 5; i++) {
    const studentId = `seed-student-00${i + 1}`;
    const masteryForStudent = MASTERY_DATA[i];

    for (const [skillKey, pKnown] of Object.entries(masteryForStudent)) {
      const skillId = skillMap[skillKey];
      if (!skillId) continue;
      const masteryId = `seed-mastery-s${i + 1}-${skillKey}`;
      await prisma.studentSkillMastery.upsert({
        where: { studentId_skillId: { studentId, skillId } },
        update: { pKnown },
        create: {
          id: masteryId,
          studentId,
          skillId,
          pKnown,
        },
      });
    }
  }
  console.log(`✅ StudentSkillMastery records created for 5 students × 4 skills`);

  // === Sample Attempts for Diego Vega (student1) — subtraction_borrow ===
  const attemptDefs = [
    { id: 'seed-attempt-001', studentId: 'seed-student-001', itemId: 'seed-item-borrow_omitted-1', isCorrect: false, errorType: 'BORROW_OMITTED' as const },
    { id: 'seed-attempt-002', studentId: 'seed-student-001', itemId: 'seed-item-borrow_omitted-2', isCorrect: false, errorType: 'BORROW_OMITTED' as const },
    { id: 'seed-attempt-003', studentId: 'seed-student-001', itemId: 'seed-item-basic_fact_error-1', isCorrect: true, errorType: undefined },
    { id: 'seed-attempt-004', studentId: 'seed-student-002', itemId: 'seed-item-borrow_omitted-1', isCorrect: true, errorType: undefined },
    { id: 'seed-attempt-005', studentId: 'seed-student-002', itemId: 'seed-item-borrow_from_zero_error-1', isCorrect: true, errorType: undefined },
    { id: 'seed-attempt-006', studentId: 'seed-student-005', itemId: 'seed-item-borrow_omitted-3', isCorrect: false, errorType: 'BORROW_OMITTED' as const },
  ];

  for (const def of attemptDefs) {
    await prisma.attempt.upsert({
      where: { id: def.id },
      update: {},
      create: {
        id: def.id,
        studentId: def.studentId,
        itemId: def.itemId,
        isCorrect: def.isCorrect,
        ...(def.errorType ? { errorType: def.errorType } : {}),
        classifierSource: 'RULE_ENGINE',
        confidence: def.isCorrect ? 0.95 : 0.88,
      },
    });
  }
  console.log(`✅ ${attemptDefs.length} sample Attempts created`);

  // === TeacherAlerts ===
  const alertDefs = [
    {
      id: 'seed-alert-001',
      teacherId: teacher.id,
      classroomId: classroom.id,
      studentId: 'seed-student-001',
      message: 'Diego Vega lleva 3 errores seguidos en subtraction_borrow — intervención recomendada.',
      resolved: false,
    },
    {
      id: 'seed-alert-002',
      teacherId: teacher.id,
      classroomId: classroom.id,
      studentId: null,
      message: 'Error BORROW_OMITTED detectado en 3 alumnos — patrón común en la clase.',
      resolved: false,
    },
    {
      id: 'seed-alert-003',
      teacherId: teacher.id,
      classroomId: classroom.id,
      studentId: 'seed-student-005',
      message: 'Benjamín Muñoz: dominio de long_division bajo 0.30 — en riesgo.',
      resolved: false,
    },
  ];

  for (const alert of alertDefs) {
    await prisma.teacherAlert.upsert({
      where: { id: alert.id },
      update: {},
      create: {
        id: alert.id,
        teacherId: alert.teacherId,
        classroomId: alert.classroomId,
        ...(alert.studentId ? { studentId: alert.studentId } : {}),
        message: alert.message,
        resolved: alert.resolved,
      },
    });
  }
  console.log(`✅ ${alertDefs.length} TeacherAlerts created`);

  console.log(
    `\n🎉 Seed complete! School: "${school.name}", Classroom: "${classroom.name}"`,
  );
  console.log(`   Teacher: teacher@innova.demo / Innova123!`);
  console.log(`   Students: student1–5@innova.demo / Innova123!`);
  console.log(`   Parent: parent@innova.demo / Innova123! (linked to Diego Vega)`);
  console.log(`   Skills: ${skillDefs.map(s => s.key).join(', ')}`);
  console.log(`   Classroom: ${classroom.name} (${classroom.id})`);
  console.log(
    `\n📌 Demo Cognito mapping (for real Cognito JWT validation in tests):`,
  );
  console.log(`   teacher@innova.demo → ${DEMO_COGNITO_SUBS.teacher}`);
  console.log(`   parent@innova.demo → ${DEMO_COGNITO_SUBS.parent}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
