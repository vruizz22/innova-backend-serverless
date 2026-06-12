/**
 * Scaffolds a RuleEngineStrategy + spec + golden test for a given subdomain code.
 *
 * Usage: pnpm tsx scripts/scaffold-strategy.ts --subdomain=ARITH_ADD
 *
 * Creates:
 *   src/modules/attempts/rule-engine/strategies/<code>.strategy.ts
 *   src/modules/attempts/rule-engine/strategies/<code>.strategy.spec.ts
 *   src/modules/attempts/rule-engine/golden-tests/<code>.golden.json
 */
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const subdomainArg = args.find((a) => a.startsWith('--subdomain='));

if (!subdomainArg) {
  console.error(
    'Usage: pnpm tsx scripts/scaffold-strategy.ts --subdomain=<DOMAIN_SUB>',
  );
  process.exit(1);
}

const subdomainCode = subdomainArg.split('=')[1].toUpperCase();
const parts = subdomainCode.split('_');
if (parts.length < 2) {
  console.error(
    'Subdomain code must be in format DOMAIN_SUBDOMAIN (e.g. ARITH_ADD)',
  );
  process.exit(1);
}

const className =
  parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('') + 'Strategy';

const fileName = subdomainCode.toLowerCase().replace(/_/g, '-');

const STRATEGIES_DIR = path.join(
  __dirname,
  '../src/modules/attempts/rule-engine/strategies',
);
const GOLDEN_DIR = path.join(
  __dirname,
  '../src/modules/attempts/rule-engine/golden-tests',
);

fs.mkdirSync(STRATEGIES_DIR, { recursive: true });
fs.mkdirSync(GOLDEN_DIR, { recursive: true });

const strategyPath = path.join(STRATEGIES_DIR, `${fileName}.strategy.ts`);
const specPath = path.join(STRATEGIES_DIR, `${fileName}.strategy.spec.ts`);
const goldenPath = path.join(GOLDEN_DIR, `${fileName}.golden.json`);

if (fs.existsSync(strategyPath)) {
  console.error(`❌ ${strategyPath} already exists — aborting.`);
  process.exit(1);
}

// Strategy implementation skeleton
const strategyContent = `import { type ErrorClassification } from '@shared/domain/error-classification';
import { type NormalizedAttempt } from '@shared/domain/normalized-attempt';
import { type RuleEngineStrategy } from '../strategy.interface';

export class ${className} implements RuleEngineStrategy {
  readonly subdomainCode = '${subdomainCode}';

  classify(attempt: NormalizedAttempt): ErrorClassification {
    const steps = attempt.steps.map((s) => s.contentLatex);
    void steps; // TODO: implement classification logic

    // Return UNCLASSIFIED to escalate to LLM classifier
    return { errorTagCode: 'UNCLASSIFIED', confidence: 0 };
  }
}
`;

// Spec skeleton
const specContent = `import { ${className} } from './${fileName}.strategy';

const strategy = new ${className}();

describe('${className}', () => {
  it('has correct subdomainCode', () => {
    expect(strategy.subdomainCode).toBe('${subdomainCode}');
  });

  it('returns UNCLASSIFIED for unknown attempt pattern', () => {
    const result = strategy.classify({
      attemptId: 'test-id',
      topicCode: 'PLACEHOLDER',
      steps: [{ stepIndex: 0, contentLatex: '0', durationMs: 500 }],
      finalAnswer: '0',
    });
    expect(result.errorTagCode).toBeDefined();
  });

  // TODO: add golden-set driven tests reading from ${fileName}.golden.json
});
`;

// Golden test skeleton
const goldenContent = JSON.stringify(
  {
    subdomain: subdomainCode,
    description: `Golden test set for ${subdomainCode} — fill in real attempt fixtures`,
    version: '1.0',
    cases: [
      {
        id: 'ex-001',
        description: 'TODO: describe the expected error',
        attempt: {
          topicCode: 'PLACEHOLDER',
          steps: [{ stepIndex: 0, contentLatex: '0' }],
          finalAnswer: '0',
        },
        expected_error_tag: 'UNCLASSIFIED',
        expected_confidence_min: 0.0,
        source: 'synthetic',
      },
    ],
  },
  null,
  2,
);

fs.writeFileSync(strategyPath, strategyContent, 'utf8');
fs.writeFileSync(specPath, specContent, 'utf8');
fs.writeFileSync(goldenPath, goldenContent, 'utf8');

console.log(`✅ Scaffolded strategy for ${subdomainCode}:`);
console.log(`   ${strategyPath}`);
console.log(`   ${specPath}`);
console.log(`   ${goldenPath}`);
console.log(`\nNext: implement classify() in ${fileName}.strategy.ts`);
console.log(`      Register in src/modules/attempts/rule-engine/factory.ts`);
