module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!main.ts',
    '!lambda.ts',
    '!**/*.module.ts',
    '!**/infrastructure/workers/**',
    // Generated code (rule-engine error-tag catalog) — not hand-written, not unit-testable.
    '!**/*.generated.ts',
    // Mongoose schemas — declarative document definitions, no branching logic.
    '!**/infrastructure/database/schemas/**',
  ],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: {
      statements: 75,
      lines: 75,
      functions: 75,
      branches: 60,
    },
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@adapters/(.*)$': '<rootDir>/adapters/$1',
    '^@infrastructure/(.*)$': '<rootDir>/infrastructure/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
};
