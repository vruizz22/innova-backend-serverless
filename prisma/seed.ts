import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ErrorSeverity,
  ErrorSource,
  ErrorStatus,
  PrismaClient,
} from '@prisma/client';

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

  // v8: Domains + Subdomains (MVP subset — full 19-domain catalog via import-error-catalog script)
  const domainArith = await prisma.domain.upsert({
    where: { code: 'ARITH' },
    update: {},
    create: {
      id: 'seed-domain-arith',
      code: 'ARITH',
      name: 'Aritmética de naturales',
    },
  });
  const domainFract = await prisma.domain.upsert({
    where: { code: 'FRACT' },
    update: {},
    create: { id: 'seed-domain-fract', code: 'FRACT', name: 'Fracciones' },
  });

  const subArithSub = await prisma.subdomain.upsert({
    where: { domainId_code: { domainId: domainArith.id, code: 'SUB' } },
    update: {},
    create: {
      id: 'seed-sub-arith-sub',
      domainId: domainArith.id,
      code: 'SUB',
      name: 'Sustracción',
    },
  });
  const subArithAdd = await prisma.subdomain.upsert({
    where: { domainId_code: { domainId: domainArith.id, code: 'ADD' } },
    update: {},
    create: {
      id: 'seed-sub-arith-add',
      domainId: domainArith.id,
      code: 'ADD',
      name: 'Adición',
    },
  });
  const subFractAddSub = await prisma.subdomain.upsert({
    where: { domainId_code: { domainId: domainFract.id, code: 'ADDSUB' } },
    update: {},
    create: {
      id: 'seed-sub-fract-addsub',
      domainId: domainFract.id,
      code: 'ADDSUB',
      name: 'Suma y resta de fracciones',
    },
  });
  console.log(
    '✅ Domains + Subdomains created (ARITH_SUB, ARITH_ADD, FRACT_ADDSUB)',
  );

  // Link topics to their domains/subdomains
  await prisma.topic.update({
    where: { id: topicSubBorrow.id },
    data: { domainId: domainArith.id, subdomainId: subArithSub.id },
  });
  await prisma.topic.update({
    where: { id: topicAddCarry.id },
    data: { domainId: domainArith.id, subdomainId: subArithAdd.id },
  });
  await prisma.topic.update({
    where: { id: topicFracSame.id },
    data: { domainId: domainFract.id, subdomainId: subFractAddSub.id },
  });
  console.log('✅ Topics linked to domains/subdomains');

  // Error Tags — v8 schema with enums
  const errorTagDefs: Array<{
    code: string;
    name: string;
    topicScope: string | null;
    description: string;
    domainId: string | null;
    subdomainCode: string | null;
    severity: ErrorSeverity;
    source: ErrorSource;
    status: ErrorStatus;
  }> = [
    {
      code: 'ARITH_SUB_BORROW_OMITTED_TENS_G3',
      name: 'Borrow omitido — decenas',
      topicScope: 'T-SUB-BORROW',
      description: 'Omite préstamo columna unidades → decenas',
      domainId: domainArith.id,
      subdomainCode: 'SUB',
      severity: ErrorSeverity.MED,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'ARITH_SUB_BORROW_OMITTED_HUNDREDS_G3',
      name: 'Borrow omitido — centenas',
      topicScope: 'T-SUB-BORROW',
      description: 'Omite préstamo columna centenas',
      domainId: domainArith.id,
      subdomainCode: 'SUB',
      severity: ErrorSeverity.MED,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'ARITH_SUB_MINUEND_SUBTRAHEND_SWAPPED_G3',
      name: 'Minuendo y sustraendo invertidos',
      topicScope: 'T-SUB-BORROW',
      description: 'Resta al revés: sustrae mayor del menor en cada columna',
      domainId: domainArith.id,
      subdomainCode: 'SUB',
      severity: ErrorSeverity.HIGH,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'ARITH_SUB_BORROW_FROM_ZERO_G3',
      name: 'Borrow desde cero — error',
      topicScope: 'T-SUB-BORROW',
      description:
        'Maneja incorrectamente el préstamo desde columna con dígito 0',
      domainId: domainArith.id,
      subdomainCode: 'SUB',
      severity: ErrorSeverity.HIGH,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'ARITH_SUB_BORROW_PROPAGATION_STOP_G3',
      name: 'Propagación del borrow detenida',
      topicScope: 'T-SUB-BORROW',
      description: 'Detiene propagación del préstamo en cadena de ceros',
      domainId: domainArith.id,
      subdomainCode: 'SUB',
      severity: ErrorSeverity.MED,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'ARITH_TRANSV_DIGIT_TRANSPOSITION',
      name: 'Transposición de dígitos',
      topicScope: null,
      description: 'Dígitos transpuestos en el resultado final',
      domainId: domainArith.id,
      subdomainCode: null,
      severity: ErrorSeverity.LOW,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'ARITH_TRANSV_COLUMN_MISALIGNMENT',
      name: 'Desalineación de columnas',
      topicScope: null,
      description: 'Alineación vertical incorrecta entre columnas',
      domainId: domainArith.id,
      subdomainCode: null,
      severity: ErrorSeverity.MED,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'ARITH_TRANSV_FACT_ERROR',
      name: 'Error en hecho básico',
      topicScope: null,
      description: 'Error en hecho aritmético básico (off-by-1/2)',
      domainId: domainArith.id,
      subdomainCode: null,
      severity: ErrorSeverity.LOW,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'ARITH_ADD_CARRY_OMITTED_G3',
      name: 'Llevada omitida',
      topicScope: 'T-ADD-CARRY',
      description: 'No agrega la llevada a la columna siguiente',
      domainId: domainArith.id,
      subdomainCode: 'ADD',
      severity: ErrorSeverity.MED,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'ARITH_ADD_CARRY_WRONG_COLUMN_G3',
      name: 'Llevada en columna incorrecta',
      topicScope: 'T-ADD-CARRY',
      description: 'Agrega la llevada a una columna equivocada',
      domainId: domainArith.id,
      subdomainCode: 'ADD',
      severity: ErrorSeverity.MED,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'FRACT_ADDSUB_SUM_NUMERATOR_AND_DENOMINATOR_G5',
      name: 'Suma numeradores y denominadores por separado',
      topicScope: 'T-FRAC-SAME-DENOM',
      description:
        'Suma o resta numeradores Y denominadores independientemente',
      domainId: domainFract.id,
      subdomainCode: 'ADDSUB',
      severity: ErrorSeverity.HIGH,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'FRACT_ADDSUB_IMPROPER_NOT_REDUCED_G5',
      name: 'Fracción impropia sin reducir',
      topicScope: 'T-FRAC-SAME-DENOM',
      description: 'Resultado no reducido a forma más simple',
      domainId: domainFract.id,
      subdomainCode: 'ADDSUB',
      severity: ErrorSeverity.LOW,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'FRACT_ADDSUB_INVERTED_FRACTION_G5',
      name: 'Fracción invertida',
      topicScope: 'T-FRAC-SAME-DENOM',
      description:
        'Inversión accidental de numerador y denominador en el resultado',
      domainId: domainFract.id,
      subdomainCode: 'ADDSUB',
      severity: ErrorSeverity.MED,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'FRACT_ADDSUB_WHOLE_NUMBER_LOST_G5',
      name: 'Parte entera perdida',
      topicScope: 'T-FRAC-SAME-DENOM',
      description: 'Pierde la parte entera al operar con números mixtos',
      domainId: domainFract.id,
      subdomainCode: 'ADDSUB',
      severity: ErrorSeverity.HIGH,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'ARITH_TRANSV_PLACE_VALUE_ERROR',
      name: 'Error de valor posicional',
      topicScope: null,
      description:
        'Respuesta desplazada un factor de 10 respecto al resultado correcto',
      domainId: domainArith.id,
      subdomainCode: null,
      severity: ErrorSeverity.MED,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'CORRECT',
      name: 'Correcto',
      topicScope: null,
      description: 'Respuesta correcta',
      domainId: null,
      subdomainCode: null,
      severity: ErrorSeverity.LOW,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
    {
      code: 'UNCLASSIFIED',
      name: 'Sin clasificar',
      topicScope: null,
      description: 'Sin clasificación determinista — encolado para LLM',
      domainId: null,
      subdomainCode: null,
      severity: ErrorSeverity.MED,
      source: ErrorSource.CURATED,
      status: ErrorStatus.ACTIVE,
    },
  ];

  for (const def of errorTagDefs) {
    await prisma.errorTag.upsert({
      where: { code: def.code },
      update: {},
      create: def,
    });
  }
  console.log(
    `✅ ${errorTagDefs.length} ErrorTags created (v8 naming convention)`,
  );

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
    where: { code: 'ARITH_SUB_BORROW_OMITTED_TENS_G3' },
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

  console.log('\n🎉 Seed v8 complete!');
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
