import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ErrorSeverity,
  ErrorSource,
  ErrorStatus,
  PrismaClient,
} from '@prisma/client';

// Single source of truth shared with the private Supabase Auth provisioner
// (`scripts/seed-supabase-auth.ts`) so `users.supabase_uid` matches Auth `id`.
import { DEMO_SUPABASE_UIDS } from './demo-identities';

const adapter = new PrismaPg({
  connectionString: process.env['DATABASE_URL']!,
});
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD_HASH = 'demo_hash_not_for_prod'; // dev only — real hash not needed for seed

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

  // v8: Domains + Subdomains — full 17-domain taxonomy (see docs/error-taxonomy/README.md §3).
  // The error catalog importer (scripts/import-error-catalog.ts) maps each entry's
  // domain_code → domainId, so EVERY domain referenced by error_catalog.jsonl must exist here.
  // subdomain_code is stored as a plain string on ErrorTag, but we seed Subdomain rows too
  // for the rule engine factory and dashboard filtering.
  const DOMAIN_TAXONOMY: Array<{
    code: string;
    name: string;
    subdomains: Array<{ code: string; name: string }>;
  }> = [
    {
      code: 'ARITH',
      name: 'Aritmética de números naturales',
      subdomains: [
        { code: 'COUNT', name: 'Conteo y orden' },
        { code: 'PLACE_VALUE', name: 'Valor posicional' },
        { code: 'ADD', name: 'Adición' },
        { code: 'SUB', name: 'Sustracción' },
        { code: 'MUL', name: 'Multiplicación' },
        { code: 'DIV', name: 'División' },
        { code: 'FACT_RECALL', name: 'Hechos básicos' },
      ],
    },
    {
      code: 'INT',
      name: 'Aritmética de enteros',
      subdomains: [
        { code: 'SIGN', name: 'Regla de signos' },
        { code: 'ADD', name: 'Adición de enteros' },
        { code: 'SUB', name: 'Sustracción de enteros' },
        { code: 'MUL', name: 'Multiplicación de enteros' },
        { code: 'DIV', name: 'División de enteros' },
        { code: 'ABS', name: 'Valor absoluto' },
        { code: 'COMPARE', name: 'Orden y comparación' },
      ],
    },
    {
      code: 'FRACT',
      name: 'Fracciones',
      subdomains: [
        { code: 'REPR', name: 'Representación' },
        { code: 'EQUIV', name: 'Equivalencia' },
        { code: 'REDUCE', name: 'Simplificación' },
        { code: 'COMPARE', name: 'Comparación' },
        { code: 'ADDSUB', name: 'Suma y resta' },
        { code: 'MUL', name: 'Multiplicación' },
        { code: 'DIV', name: 'División' },
        { code: 'MIXED', name: 'Números mixtos' },
      ],
    },
    {
      code: 'DEC',
      name: 'Números decimales',
      subdomains: [
        { code: 'REPR', name: 'Representación' },
        { code: 'COMPARE', name: 'Comparación y orden' },
        { code: 'ADD', name: 'Adición' },
        { code: 'SUB', name: 'Sustracción' },
        { code: 'MUL', name: 'Multiplicación' },
        { code: 'DIV', name: 'División' },
        { code: 'ROUND', name: 'Redondeo y aproximación' },
        { code: 'FRACT_CONV', name: 'Conversión fracción↔decimal' },
      ],
    },
    {
      code: 'RATIO',
      name: 'Razones, proporciones y porcentajes',
      subdomains: [
        { code: 'RATIO', name: 'Razones' },
        { code: 'PROPORTION', name: 'Proporciones' },
        { code: 'PERCENT', name: 'Porcentajes' },
        { code: 'RULE_OF_THREE', name: 'Regla de tres' },
      ],
    },
    {
      code: 'ALGEBRA',
      name: 'Álgebra (lineal y cuadrática)',
      subdomains: [
        { code: 'EXPR', name: 'Expresiones algebraicas' },
        { code: 'MONOMIAL', name: 'Monomios y términos semejantes' },
        { code: 'EQ_LINEAR', name: 'Ecuaciones lineales' },
        { code: 'INEQ_LINEAR', name: 'Inecuaciones lineales' },
        { code: 'SYSTEM_2X2', name: 'Sistemas 2×2' },
        { code: 'ABS_EQ', name: 'Ecuaciones con valor absoluto' },
        { code: 'EXPAND', name: 'Productos notables y expansión' },
        { code: 'FACTOR', name: 'Factorización' },
        { code: 'EQ_QUAD', name: 'Ecuaciones cuadráticas' },
        { code: 'INEQ_QUAD', name: 'Inecuaciones cuadráticas' },
        { code: 'POLY', name: 'Polinomios' },
      ],
    },
    {
      code: 'POW',
      name: 'Potencias, raíces y exponentes',
      subdomains: [
        { code: 'POWER', name: 'Potencias' },
        { code: 'ROOT', name: 'Raíces' },
        { code: 'RATIONAL_EXP', name: 'Exponente racional' },
        { code: 'RATIONALIZE', name: 'Racionalización' },
      ],
    },
    {
      code: 'FUNC',
      name: 'Funciones',
      subdomains: [
        { code: 'EVAL', name: 'Evaluación' },
        { code: 'DOMAIN', name: 'Dominio' },
        { code: 'RANGE', name: 'Recorrido' },
        { code: 'COMPOSITION', name: 'Composición' },
        { code: 'INVERSE', name: 'Función inversa' },
        { code: 'LINEAR', name: 'Función lineal y afín' },
        { code: 'QUAD', name: 'Función cuadrática' },
        { code: 'EXP', name: 'Función exponencial' },
        { code: 'RATIONAL', name: 'Función racional' },
      ],
    },
    {
      code: 'GEOM',
      name: 'Geometría plana',
      subdomains: [
        { code: 'ANGLE', name: 'Ángulos' },
        { code: 'TRIANGLE', name: 'Triángulos' },
        { code: 'QUAD_FIG', name: 'Cuadriláteros y polígonos' },
        { code: 'CIRCLE', name: 'Circunferencia y círculo' },
        { code: 'AREA', name: 'Área' },
        { code: 'PERIMETER', name: 'Perímetro' },
        { code: 'SIMILARITY', name: 'Semejanza' },
        { code: 'CONGRUENCE', name: 'Congruencia' },
        { code: 'TRANSFORM', name: 'Transformaciones isométricas' },
      ],
    },
    {
      code: 'GEOM3D',
      name: 'Geometría 3D y volumen',
      subdomains: [
        { code: 'PRISM', name: 'Prismas' },
        { code: 'CYLINDER', name: 'Cilindros' },
        { code: 'PYRAMID', name: 'Pirámides' },
        { code: 'CONE', name: 'Conos' },
        { code: 'SPHERE', name: 'Esferas' },
        { code: 'COMPOSITE', name: 'Cuerpos compuestos' },
      ],
    },
    {
      code: 'TRIG',
      name: 'Trigonometría',
      subdomains: [
        { code: 'RATIO', name: 'Razones trigonométricas' },
        { code: 'IDENTITY', name: 'Identidades' },
        { code: 'UNIT_CIRCLE', name: 'Círculo unitario' },
        { code: 'RIGHT_TRIANGLE', name: 'Triángulo rectángulo' },
        { code: 'EQ_TRIG', name: 'Ecuaciones trigonométricas' },
        { code: 'GRAPH', name: 'Gráficas trigonométricas' },
      ],
    },
    {
      code: 'STAT',
      name: 'Estadística y probabilidad',
      subdomains: [
        { code: 'MEASURE_CENTRAL', name: 'Medidas de tendencia central' },
        { code: 'MEASURE_DISPERSION', name: 'Medidas de dispersión' },
        { code: 'PROB', name: 'Probabilidad' },
        { code: 'COMBINATORICS', name: 'Combinatoria' },
      ],
    },
    {
      code: 'DATA',
      name: 'Tratamiento de datos',
      subdomains: [
        { code: 'TABLE', name: 'Tablas' },
        { code: 'BAR', name: 'Gráfico de barras' },
        { code: 'LINE', name: 'Gráfico de líneas' },
        { code: 'PIE', name: 'Gráfico circular' },
        { code: 'PICTOGRAM', name: 'Pictograma' },
        { code: 'FREQUENCY', name: 'Frecuencia' },
      ],
    },
    {
      code: 'LOG',
      name: 'Logaritmos',
      subdomains: [
        { code: 'DEF', name: 'Definición' },
        { code: 'PROPERTY', name: 'Propiedades' },
        { code: 'EQ_LOG', name: 'Ecuaciones logarítmicas' },
      ],
    },
    {
      code: 'SEQ',
      name: 'Sucesiones y series',
      subdomains: [
        { code: 'PATTERN', name: 'Patrones' },
        { code: 'ARITHMETIC', name: 'Sucesión aritmética' },
        { code: 'GEOMETRIC', name: 'Sucesión geométrica' },
        { code: 'RECURSIVE', name: 'Sucesión recursiva' },
      ],
    },
    {
      code: 'COORD',
      name: 'Geometría analítica y vectores',
      subdomains: [
        { code: 'PLOT', name: 'Ubicación en el plano' },
        { code: 'DISTANCE', name: 'Distancia' },
        { code: 'MIDPOINT', name: 'Punto medio' },
        { code: 'LINE_EQ', name: 'Ecuación de la recta' },
        { code: 'VECTOR', name: 'Vectores' },
      ],
    },
    {
      code: 'TRANSV',
      name: 'Errores transversales',
      subdomains: [
        { code: 'ALIGNMENT', name: 'Alineación de columnas' },
        { code: 'TRANSPOSITION', name: 'Transposición de dígitos' },
        { code: 'NOTATION', name: 'Notación' },
        { code: 'UNIT', name: 'Unidades de medida' },
        { code: 'ORDER', name: 'Orden de operaciones' },
      ],
    },
  ];

  const domainByCode = new Map<string, { id: string }>();
  const subdomainByKey = new Map<string, { id: string }>();
  for (const d of DOMAIN_TAXONOMY) {
    const domain = await prisma.domain.upsert({
      where: { code: d.code },
      update: { name: d.name },
      create: { code: d.code, name: d.name },
    });
    domainByCode.set(d.code, domain);
    for (const s of d.subdomains) {
      const sub = await prisma.subdomain.upsert({
        where: { domainId_code: { domainId: domain.id, code: s.code } },
        update: { name: s.name },
        create: { domainId: domain.id, code: s.code, name: s.name },
      });
      subdomainByKey.set(`${d.code}:${s.code}`, sub);
    }
  }

  // Back-compat aliases used by the rest of this seed (topic linking + curated ErrorTags).
  const domainArith = domainByCode.get('ARITH')!;
  const domainFract = domainByCode.get('FRACT')!;
  const subArithSub = subdomainByKey.get('ARITH:SUB')!;
  const subArithAdd = subdomainByKey.get('ARITH:ADD')!;
  const subFractAddSub = subdomainByKey.get('FRACT:ADDSUB')!;
  const subdomainCount = DOMAIN_TAXONOMY.reduce(
    (n, d) => n + d.subdomains.length,
    0,
  );
  console.log(
    `✅ ${DOMAIN_TAXONOMY.length} Domains + ${subdomainCount} Subdomains upserted`,
  );

  // Legacy topic → domain/subdomain links (kept for the 3 old hardcoded topics)
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
  console.log('✅ Legacy topics linked to domains/subdomains');

  // ── W1 backfill: Unit ≡ Domain (17) + Topic ≡ Subdomain (106) ────────────
  // Creates one Unit per Domain and one Topic per Subdomain (idempotent upsert).
  // After this backfill heatmap/BKT/mastery cover the full taxonomy without
  // needing a schema migration. The 3 legacy units above coexist harmlessly.
  let unitSeq = 1;
  const unitByDomainCode = new Map<string, { id: string }>();
  const topicBySubdomainKey = new Map<string, { id: string }>();

  for (const d of DOMAIN_TAXONOMY) {
    const domainRecord = domainByCode.get(d.code)!;
    const unit = await prisma.unit.upsert({
      where: { curriculumId_code: { curriculumId: curriculum.id, code: d.code } },
      update: { name: d.name },
      create: {
        curriculumId: curriculum.id,
        // gradeLevel=3: cross-grade domain; 3 is the entry grade for this curriculum
        gradeLevel: 3,
        sequence: unitSeq++,
        code: d.code,
        name: d.name,
      },
    });
    unitByDomainCode.set(d.code, unit);

    for (const s of d.subdomains) {
      const sub = subdomainByKey.get(`${d.code}:${s.code}`)!;
      const topic = await prisma.topic.upsert({
        where: { unitId_code: { unitId: unit.id, code: s.code } },
        update: { name: s.name, domainId: domainRecord.id, subdomainId: sub.id },
        create: {
          unitId: unit.id,
          domainId: domainRecord.id,
          subdomainId: sub.id,
          code: s.code,
          name: s.name,
          // BKT defaults (Corbett & Anderson 1995 — recalibrated from real data later)
          bktPL0: 0.3,
          bktPTransit: 0.1,
          bktPSlip: 0.1,
          bktPGuess: 0.2,
        },
      });
      topicBySubdomainKey.set(`${d.code}:${s.code}`, topic);
    }
  }
  console.log(
    `✅ W1 backfill: ${unitByDomainCode.size} Units (≡ Domain) + ${topicBySubdomainKey.size} Topics (≡ Subdomain)`,
  );

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
  // Key the upsert by supabaseUid (the stable external identity), not email:
  // tests may upsert by supabaseUid with a different email, so an email-keyed
  // upsert would try to CREATE and collide on the supabaseUid unique constraint.
  await prisma.user.upsert({
    where: { supabaseUid: DEMO_SUPABASE_UIDS.admin },
    update: { email: 'admin@innova.demo', authRole: 'admin' },
    create: {
      email: 'admin@innova.demo',
      supabaseUid: DEMO_SUPABASE_UIDS.admin,
      authRole: 'admin',
      passwordHash: DEMO_PASSWORD_HASH,
    },
  });

  const teacherUser = await prisma.user.upsert({
    where: { supabaseUid: DEMO_SUPABASE_UIDS.teacher },
    update: { email: 'teacher@innova.demo', authRole: 'teacher' },
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
    update: { name: '7° A · Matemáticas' },
    create: {
      id: 'seed-course-001',
      schoolId: school.id,
      subjectId: subject.id,
      name: '7° A · Matemáticas',
      gradeLevel: 7,
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
      where: { supabaseUid },
      update: { email, authRole: 'student' },
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
    where: { supabaseUid: DEMO_SUPABASE_UIDS.parent },
    update: { email: 'parent@innova.demo', authRole: 'parent' },
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
    // confirmedAt must be set: parent.service.listChildren only returns
    // confirmed links (a parent must accept the link in the real flow). The
    // demo link is pre-confirmed so the parent account sees its child.
    update: { confirmedAt: new Date() },
    create: {
      parentId: parent.id,
      studentId: studentIds[0],
      relationship: 'PADRE',
      confirmedAt: new Date(),
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

  // Link exercises to the canonical ARITH:SUB topic from the W1 backfill so that
  // student practice feeds into heatmap/BKT correctly. Falls back to the legacy
  // topic if the backfill hasn't run yet (shouldn't happen in normal seed order).
  const subTopicId =
    topicBySubdomainKey.get('ARITH:SUB')?.id ?? topicSubBorrow.id;

  for (const def of exerciseDefs) {
    await prisma.exercise.upsert({
      where: { id: def.id },
      update: {},
      create: {
        id: def.id,
        topicId: subTopicId,
        source: 'SYSTEM',
        content: { prompt: def.prompt, expectedAnswer: def.expectedAnswer },
        irtA: def.irtA,
        irtB: def.irtB,
        status: 'ACTIVE',
      },
    });
  }
  console.log(
    `✅ ${exerciseDefs.length} Exercises seeded under ARITH:SUB topic`,
  );

  // StudentTopicMastery — NOT seeded (W2 principle: mastery grows from real attempts).
  // Records are created by MasteryService.applyAttempt() as students submit work.

  // Attempts — NOT seeded (W2 principle: attempts come from real student interactions).
  // Use the local demo flow: student logs in → opens Practice → solves exercises.

  // TeacherAlerts — NOT seeded (W2 principle: alerts come from the ai-engine
  // hourly cron A9, not invented data). The AlertsInbox UI shows an empty state
  // until the first hourly run detects a real pattern.

  console.log('\n🎉 Seed v9 complete (W1+W2 — real data, no invented mastery/alerts)!');
  console.log(`   Admin:    admin@innova.demo`);
  console.log(`   Teacher:  teacher@innova.demo`);
  console.log(`   Students: student1–5@innova.demo`);
  console.log(`   Parent:   parent@innova.demo (linked to Diego Vega)`);
  console.log(`   Course: "${course.name}" (${course.id})`);
  console.log('\n📌 Demo Supabase UID mapping:');
  console.log(`   admin@innova.demo    → ${DEMO_SUPABASE_UIDS.admin}`);
  console.log(`   teacher@innova.demo  → ${DEMO_SUPABASE_UIDS.teacher}`);
  console.log(`   student1@innova.demo → ${DEMO_SUPABASE_UIDS.student1}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
