import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env['DATABASE_URL']!,
});
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD_HASH = 'demo_hash_not_for_prod'; // dev only — real hash not needed for seed

// Demo Supabase UUIDs (deterministic for dev/testing)
const DEMO_SUPABASE_UIDS = {
  teacher: '00000000-0000-0000-0000-000000000001',
  parent: '00000000-0000-0000-0000-000000000021',
  student1: '00000000-0000-0000-0000-000000000011',
  student2: '00000000-0000-0000-0000-000000000012',
  student3: '00000000-0000-0000-0000-000000000013',
  student4: '00000000-0000-0000-0000-000000000014',
  student5: '00000000-0000-0000-0000-000000000015',
};

async function main() {
  console.log('🌱 Starting seed v7...');

  // Organization + School
  const org = await prisma.organization.upsert({
    where: { id: 'seed-org-001' },
    update: {},
    create: {
      id: 'seed-org-001',
      name: 'Innova Demo Network',
      country: 'CL',
      plan: 'PILOT',
    },
  });

  const school = await prisma.school.upsert({
    where: { id: 'seed-school-001' },
    update: {},
    create: {
      id: 'seed-school-001',
      organizationId: org.id,
      name: 'Escuela Innova Demo',
      rbd: 'DEMO-001',
    },
  });

  // Subject
  const subject = await prisma.subject.upsert({
    where: { code: 'MATH' },
    update: {},
    create: {
      id: 'seed-subject-001',
      code: 'MATH',
      name: 'Matemáticas',
      language: 'es',
    },
  });

  // Curriculum
  const curriculum = await prisma.curriculum.upsert({
    where: {
      subjectId_country_version: {
        subjectId: subject.id,
        country: 'CL',
        version: '1.0',
      },
    },
    update: {},
    create: {
      id: 'seed-curriculum-001',
      subjectId: subject.id,
      country: 'CL',
      name: 'Matemáticas básica chilena 3°-6° 2026',
      version: '1.0',
    },
  });

  // Units
  const unit3 = await prisma.unit.upsert({
    where: {
      curriculumId_code: { curriculumId: curriculum.id, code: 'U1-3B-NUMEROS' },
    },
    update: {},
    create: {
      id: 'seed-unit-001',
      curriculumId: curriculum.id,
      gradeLevel: 3,
      sequence: 1,
      code: 'U1-3B-NUMEROS',
      name: 'El mundo de los números',
    },
  });

  const unit4 = await prisma.unit.upsert({
    where: {
      curriculumId_code: { curriculumId: curriculum.id, code: 'U1-4B-NUMEROS' },
    },
    update: {},
    create: {
      id: 'seed-unit-002',
      curriculumId: curriculum.id,
      gradeLevel: 4,
      sequence: 1,
      code: 'U1-4B-NUMEROS',
      name: 'El medioambiente — Números hasta 10.000',
    },
  });

  const unit5 = await prisma.unit.upsert({
    where: {
      curriculumId_code: {
        curriculumId: curriculum.id,
        code: 'U3-5B-FRACCIONES',
      },
    },
    update: {},
    create: {
      id: 'seed-unit-003',
      curriculumId: curriculum.id,
      gradeLevel: 5,
      sequence: 3,
      code: 'U3-5B-FRACCIONES',
      name: 'Los animales — Fracciones',
    },
  });

  // Topics
  const topicSubBorrow = await prisma.topic.upsert({
    where: { unitId_code: { unitId: unit3.id, code: 'T-SUB-BORROW' } },
    update: {},
    create: {
      id: 'seed-topic-001',
      unitId: unit3.id,
      code: 'T-SUB-BORROW',
      name: 'Sustracción con préstamo',
      description: 'Resta con reagrupación para 3°-4° básico',
      bktPL0: 0.3,
      bktPTransit: 0.1,
      bktPSlip: 0.1,
      bktPGuess: 0.2,
    },
  });

  const topicAddCarry = await prisma.topic.upsert({
    where: { unitId_code: { unitId: unit3.id, code: 'T-ADD-CARRY' } },
    update: {},
    create: {
      id: 'seed-topic-002',
      unitId: unit3.id,
      code: 'T-ADD-CARRY',
      name: 'Suma con llevada',
      description: 'Suma con reagrupación de decenas',
      bktPL0: 0.3,
      bktPTransit: 0.1,
      bktPSlip: 0.1,
      bktPGuess: 0.2,
    },
  });

  const topicFracSame = await prisma.topic.upsert({
    where: { unitId_code: { unitId: unit5.id, code: 'T-FRAC-SAME-DENOM' } },
    update: {},
    create: {
      id: 'seed-topic-003',
      unitId: unit5.id,
      code: 'T-FRAC-SAME-DENOM',
      name: 'Suma/resta de fracciones con mismo denominador',
      bktPL0: 0.3,
      bktPTransit: 0.1,
      bktPSlip: 0.1,
      bktPGuess: 0.2,
    },
  });

  // Prerequisites: addition_carry before subtraction_borrow
  await prisma.topicPrerequisite.upsert({
    where: {
      topicId_prerequisiteTopicId: {
        topicId: topicSubBorrow.id,
        prerequisiteTopicId: topicAddCarry.id,
      },
    },
    update: {},
    create: {
      topicId: topicSubBorrow.id,
      prerequisiteTopicId: topicAddCarry.id,
    },
  });

  console.log(
    `✅ Curriculum: org → school → subject → curriculum → 3 units → 3 topics`,
  );

  // Error Tags (from error-taxonomy.md)
  const errorTagDefs = [
    {
      code: 'BORROW_OMITTED_TENS',
      topicScope: 'T-SUB-BORROW',
      description: 'Omite préstamo columna unidades',
      severity: 'MED',
    },
    {
      code: 'BORROW_OMITTED_HUNDREDS',
      topicScope: 'T-SUB-BORROW',
      description: 'Omite préstamo columna centenas',
      severity: 'MED',
    },
    {
      code: 'SUBTRAHEND_MINUEND_SWAPPED',
      topicScope: 'T-SUB-BORROW',
      description: 'Resta al revés (sustrayendo mayor del menor)',
      severity: 'HIGH',
    },
    {
      code: 'BORROW_FROM_ZERO_INCORRECT',
      topicScope: 'T-SUB-BORROW',
      description: 'Maneja mal préstamo desde columna con 0',
      severity: 'HIGH',
    },
    {
      code: 'STOP_BORROW_PROPAGATION',
      topicScope: 'T-SUB-BORROW',
      description: 'Detiene propagación del préstamo',
      severity: 'MED',
    },
    {
      code: 'DIGIT_TRANSPOSITION',
      topicScope: null,
      description: 'Dígitos transpuestos en el resultado',
      severity: 'LOW',
    },
    {
      code: 'COLUMN_MISALIGNMENT',
      topicScope: null,
      description: 'Alineación vertical incorrecta',
      severity: 'MED',
    },
    {
      code: 'ARITHMETIC_FACT_ERROR',
      topicScope: null,
      description: 'Error en hechos básicos (off-by-1/2)',
      severity: 'LOW',
    },
    {
      code: 'CARRY_OMITTED',
      topicScope: 'T-ADD-CARRY',
      description: 'No agregó la llevada a la columna',
      severity: 'MED',
    },
    {
      code: 'CARRY_ADDED_TO_WRONG_COLUMN',
      topicScope: 'T-ADD-CARRY',
      description: 'Llevada en columna equivocada',
      severity: 'MED',
    },
    {
      code: 'SUM_NUMERATORS_AND_DENOMINATORS',
      topicScope: 'T-FRAC-SAME-DENOM',
      description: 'Sumó/restó numeradores Y denominadores',
      severity: 'HIGH',
    },
    {
      code: 'IMPROPER_FRACTION_NOT_REDUCED',
      topicScope: 'T-FRAC-SAME-DENOM',
      description: 'Resultado no reducido a forma simple',
      severity: 'LOW',
    },
    {
      code: 'INVERTED_FRACTION',
      topicScope: 'T-FRAC-SAME-DENOM',
      description: 'Inversión accidental numerador/denominador',
      severity: 'MED',
    },
    {
      code: 'WHOLE_NUMBER_LOST',
      topicScope: 'T-FRAC-SAME-DENOM',
      description: 'Pierde la parte entera en números mixtos',
      severity: 'HIGH',
    },
    {
      code: 'CORRECT',
      topicScope: null,
      description: 'Respuesta correcta',
      severity: 'LOW',
    },
    {
      code: 'UNCLASSIFIED',
      topicScope: null,
      description: 'Sin clasificación determinista',
      severity: 'MED',
    },
  ];

  for (const def of errorTagDefs) {
    await prisma.errorTag.upsert({
      where: { code: def.code },
      update: {},
      create: def,
    });
  }
  console.log(`✅ ${errorTagDefs.length} ErrorTags created`);

  // Users
  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher@innova.demo' },
    update: { supabaseUid: DEMO_SUPABASE_UIDS.teacher, authRole: 'teacher' },
    create: {
      email: 'teacher@innova.demo',
      supabaseUid: DEMO_SUPABASE_UIDS.teacher,
      authRole: 'teacher',
      passwordHash: DEMO_PASSWORD_HASH,
    },
  });

  const teacher = await prisma.teacher.upsert({
    where: { userId: teacherUser.id },
    update: {},
    create: {
      id: 'seed-teacher-001',
      userId: teacherUser.id,
      displayName: 'Prof. Demo',
    },
  });

  // Course
  const course = await prisma.course.upsert({
    where: { id: 'seed-course-001' },
    update: { name: '4° A · Matemáticas' },
    create: {
      id: 'seed-course-001',
      schoolId: school.id,
      subjectId: subject.id,
      name: '4° A · Matemáticas',
      gradeLevel: 4,
      academicYear: 2026,
    },
  });

  await prisma.courseTeacher.upsert({
    where: {
      courseId_teacherId: { courseId: course.id, teacherId: teacher.id },
    },
    update: {},
    create: { courseId: course.id, teacherId: teacher.id, role: 'LEAD' },
  });

  console.log(`✅ Teacher ${teacher.id} linked to course "${course.name}"`);

  // Students
  const studentData = [
    {
      email: 'student1@innova.demo',
      supabaseUid: DEMO_SUPABASE_UIDS.student1,
      displayName: 'Diego Vega',
    },
    {
      email: 'student2@innova.demo',
      supabaseUid: DEMO_SUPABASE_UIDS.student2,
      displayName: 'Valentina Reyes',
    },
    {
      email: 'student3@innova.demo',
      supabaseUid: DEMO_SUPABASE_UIDS.student3,
      displayName: 'Matías Torres',
    },
    {
      email: 'student4@innova.demo',
      supabaseUid: DEMO_SUPABASE_UIDS.student4,
      displayName: 'Camila Soto',
    },
    {
      email: 'student5@innova.demo',
      supabaseUid: DEMO_SUPABASE_UIDS.student5,
      displayName: 'Benjamín Muñoz',
    },
  ];

  const studentIds: string[] = [];
  for (let i = 0; i < studentData.length; i++) {
    const { email, supabaseUid, displayName } = studentData[i];
    const sUser = await prisma.user.upsert({
      where: { email },
      update: { supabaseUid, authRole: 'student' },
      create: {
        email,
        supabaseUid,
        authRole: 'student',
        passwordHash: DEMO_PASSWORD_HASH,
      },
    });
    const student = await prisma.student.upsert({
      where: { userId: sUser.id },
      update: {},
      create: { id: `seed-student-00${i + 1}`, userId: sUser.id, displayName },
    });
    studentIds.push(student.id);

    await prisma.enrollment.upsert({
      where: {
        courseId_studentId: { courseId: course.id, studentId: student.id },
      },
      update: {},
      create: { courseId: course.id, studentId: student.id, status: 'ACTIVE' },
    });
  }
  console.log(`✅ 5 Students enrolled in course`);

  // Parent
  const parentUser = await prisma.user.upsert({
    where: { email: 'parent@innova.demo' },
    update: { supabaseUid: DEMO_SUPABASE_UIDS.parent, authRole: 'parent' },
    create: {
      email: 'parent@innova.demo',
      supabaseUid: DEMO_SUPABASE_UIDS.parent,
      authRole: 'parent',
      passwordHash: DEMO_PASSWORD_HASH,
    },
  });

  const parent = await prisma.parent.upsert({
    where: { userId: parentUser.id },
    update: {},
    create: {
      id: 'seed-parent-001',
      userId: parentUser.id,
      displayName: 'Apoderado Demo',
    },
  });

  await prisma.parentLink.upsert({
    where: {
      parentId_studentId: { parentId: parent.id, studentId: studentIds[0] },
    },
    update: {},
    create: {
      parentId: parent.id,
      studentId: studentIds[0],
      relationship: 'PADRE',
    },
  });

  console.log(`✅ Parent linked to Diego Vega`);

  // Exercises for subtraction_borrow topic
  const exerciseDefs = [
    {
      id: 'seed-ex-sub-001',
      prompt: '53 - 26 = ?',
      expectedAnswer: 27,
      irtA: 1.2,
      irtB: -0.3,
    },
    {
      id: 'seed-ex-sub-002',
      prompt: '72 - 48 = ?',
      expectedAnswer: 24,
      irtA: 1.1,
      irtB: -0.1,
    },
    {
      id: 'seed-ex-sub-003',
      prompt: '81 - 35 = ?',
      expectedAnswer: 46,
      irtA: 1.3,
      irtB: 0.2,
    },
    {
      id: 'seed-ex-sub-004',
      prompt: '64 - 27 = ?',
      expectedAnswer: 37,
      irtA: 1.0,
      irtB: -0.5,
    },
    {
      id: 'seed-ex-sub-005',
      prompt: '300 - 47 = ?',
      expectedAnswer: 253,
      irtA: 1.4,
      irtB: 0.5,
    },
    {
      id: 'seed-ex-sub-006',
      prompt: '500 - 183 = ?',
      expectedAnswer: 317,
      irtA: 1.5,
      irtB: 0.8,
    },
    {
      id: 'seed-ex-sub-007',
      prompt: '13 - 7 = ?',
      expectedAnswer: 6,
      irtA: 0.8,
      irtB: -1.0,
    },
    {
      id: 'seed-ex-sub-008',
      prompt: '342 - 185 = ?',
      expectedAnswer: 157,
      irtA: 1.6,
      irtB: 0.9,
    },
  ];

  for (const def of exerciseDefs) {
    await prisma.exercise.upsert({
      where: { id: def.id },
      update: {},
      create: {
        id: def.id,
        topicId: topicSubBorrow.id,
        source: 'SYSTEM',
        content: { prompt: def.prompt, expectedAnswer: def.expectedAnswer },
        irtA: def.irtA,
        irtB: def.irtB,
        status: 'ACTIVE',
      },
    });
  }
  console.log(
    `✅ ${exerciseDefs.length} Exercises created for subtraction_borrow`,
  );

  // StudentTopicMastery
  const masteryData = [
    { studentIdx: 0, topicId: topicSubBorrow.id, pKnown: 0.22 },
    { studentIdx: 0, topicId: topicAddCarry.id, pKnown: 0.55 },
    { studentIdx: 1, topicId: topicSubBorrow.id, pKnown: 0.82 },
    { studentIdx: 1, topicId: topicAddCarry.id, pKnown: 0.88 },
    { studentIdx: 2, topicId: topicSubBorrow.id, pKnown: 0.68 },
    { studentIdx: 2, topicId: topicAddCarry.id, pKnown: 0.45 },
    { studentIdx: 3, topicId: topicSubBorrow.id, pKnown: 0.53 },
    { studentIdx: 3, topicId: topicAddCarry.id, pKnown: 0.6 },
    { studentIdx: 4, topicId: topicSubBorrow.id, pKnown: 0.35 },
    { studentIdx: 4, topicId: topicFracSame.id, pKnown: 0.29 },
  ];

  for (const m of masteryData) {
    const studentId = studentIds[m.studentIdx];
    await prisma.studentTopicMastery.upsert({
      where: { studentId_topicId: { studentId, topicId: m.topicId } },
      update: { pKnown: m.pKnown },
      create: { studentId, topicId: m.topicId, pKnown: m.pKnown },
    });
  }
  console.log(`✅ StudentTopicMastery records created`);

  // Sample Attempts for Diego Vega (student 0)
  const errorTagSubBorrow = await prisma.errorTag.findUnique({
    where: { code: 'BORROW_OMITTED_TENS' },
  });
  const attemptDefs = [
    {
      id: 'seed-attempt-001',
      studentId: studentIds[0],
      exerciseId: 'seed-ex-sub-001',
      isCorrect: false,
      errorTagId: errorTagSubBorrow?.id,
    },
    {
      id: 'seed-attempt-002',
      studentId: studentIds[0],
      exerciseId: 'seed-ex-sub-002',
      isCorrect: false,
      errorTagId: errorTagSubBorrow?.id,
    },
    {
      id: 'seed-attempt-003',
      studentId: studentIds[0],
      exerciseId: 'seed-ex-sub-007',
      isCorrect: true,
      errorTagId: null,
    },
    {
      id: 'seed-attempt-004',
      studentId: studentIds[1],
      exerciseId: 'seed-ex-sub-001',
      isCorrect: true,
      errorTagId: null,
    },
    {
      id: 'seed-attempt-005',
      studentId: studentIds[4],
      exerciseId: 'seed-ex-sub-003',
      isCorrect: false,
      errorTagId: errorTagSubBorrow?.id,
    },
  ];

  for (const def of attemptDefs) {
    await prisma.attempt.upsert({
      where: { id: def.id },
      update: {},
      create: {
        id: def.id,
        studentId: def.studentId,
        exerciseId: def.exerciseId,
        courseId: course.id,
        isCorrect: def.isCorrect,
        errorTagId: def.errorTagId ?? null,
        classifierSource: 'RULE',
        confidence: def.isCorrect ? 0.95 : 0.88,
        inputMode: 'DIGITAL',
        status: 'CLASSIFIED',
      },
    });
  }
  console.log(`✅ ${attemptDefs.length} sample Attempts created`);

  // TeacherAlerts
  const alertDefs = [
    {
      id: 'seed-alert-001',
      teacherId: teacher.id,
      courseId: course.id,
      topicId: topicSubBorrow.id,
      studentId: studentIds[0],
      alertType: 'AT_RISK_STUDENT',
      severity: 'HIGH',
      payload: {
        message: 'Diego Vega lleva 3 errores seguidos en T-SUB-BORROW',
      },
    },
    {
      id: 'seed-alert-002',
      teacherId: teacher.id,
      courseId: course.id,
      topicId: topicSubBorrow.id,
      studentId: null,
      alertType: 'COMMON_ERROR_IN_TOPIC',
      severity: 'MED',
      payload: {
        message: 'BORROW_OMITTED_TENS detectado en 3 alumnos — patrón común',
      },
    },
  ];

  for (const alert of alertDefs) {
    await prisma.teacherAlert.upsert({
      where: { id: alert.id },
      update: {},
      create: {
        id: alert.id,
        teacherId: alert.teacherId,
        courseId: alert.courseId,
        topicId: alert.topicId,
        studentId: alert.studentId ?? undefined,
        alertType: alert.alertType,
        severity: alert.severity,
        payload: alert.payload,
      },
    });
  }
  console.log(`✅ ${alertDefs.length} TeacherAlerts created`);

  console.log('\n🎉 Seed v7 complete!');
  console.log(`   Teacher: teacher@innova.demo`);
  console.log(`   Students: student1–5@innova.demo`);
  console.log(`   Parent: parent@innova.demo (linked to Diego Vega)`);
  console.log(`   Course: "${course.name}" (${course.id})`);
  console.log('\n📌 Demo Supabase UID mapping:');
  console.log(`   teacher@innova.demo → ${DEMO_SUPABASE_UIDS.teacher}`);
  console.log(`   student1@innova.demo → ${DEMO_SUPABASE_UIDS.student1}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
