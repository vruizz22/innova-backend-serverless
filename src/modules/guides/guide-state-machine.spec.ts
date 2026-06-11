import {
  assertTransition,
  canonicalSolutionSchema,
  canTransition,
  hasCheckpoint,
  INGESTABLE_STATUSES,
  InvalidGuideTransitionError,
  type CanonicalSolution,
} from './guide-state-machine';

describe('guide state machine', () => {
  describe('canTransition', () => {
    it('allows the happy path UPLOADED → … → PUBLISHED → ARCHIVED', () => {
      expect(canTransition('UPLOADED', 'EXTRACTING')).toBe(true);
      expect(canTransition('EXTRACTING', 'GENERATING_SOLUTIONS')).toBe(true);
      expect(canTransition('GENERATING_SOLUTIONS', 'REVIEW')).toBe(true);
      expect(canTransition('REVIEW', 'PUBLISHED')).toBe(true);
      expect(canTransition('PUBLISHED', 'ARCHIVED')).toBe(true);
    });

    it('allows retry edges from failure states', () => {
      expect(canTransition('EXTRACTION_FAILED', 'EXTRACTING')).toBe(true);
      expect(canTransition('GENERATION_FAILED', 'GENERATING_SOLUTIONS')).toBe(
        true,
      );
      expect(canTransition('REVIEW', 'GENERATING_SOLUTIONS')).toBe(true);
    });

    it('rejects skipping the human REVIEW gate (ADR-119)', () => {
      expect(canTransition('GENERATING_SOLUTIONS', 'PUBLISHED')).toBe(false);
      expect(canTransition('UPLOADED', 'PUBLISHED')).toBe(false);
      expect(canTransition('EXTRACTING', 'REVIEW')).toBe(false);
    });

    it('treats ARCHIVED as terminal', () => {
      expect(canTransition('ARCHIVED', 'PUBLISHED')).toBe(false);
      expect(canTransition('ARCHIVED', 'REVIEW')).toBe(false);
    });
  });

  describe('assertTransition', () => {
    it('throws InvalidGuideTransitionError on an illegal edge', () => {
      expect(() => assertTransition('UPLOADED', 'PUBLISHED')).toThrow(
        InvalidGuideTransitionError,
      );
    });

    it('does not throw on a legal edge', () => {
      expect(() => assertTransition('REVIEW', 'PUBLISHED')).not.toThrow();
    });
  });

  it('exposes the ingestable (retry) statuses', () => {
    expect(INGESTABLE_STATUSES).toEqual([
      'UPLOADED',
      'EXTRACTION_FAILED',
      'GENERATION_FAILED',
    ]);
  });
});

describe('canonical solution schema (ADR-118)', () => {
  const valid: CanonicalSolution = {
    final_answer: '27',
    points: 1.0,
    steps: [
      {
        idx: 1,
        latex: '53 - 26 = 53 - 20 - 6',
        explanation_es: 'Descomponemos el sustraendo.',
        rule: 'descomposicion',
        checkpoint: true,
        expected_error_tags: ['ARITH_SUB_BORROW_OMITTED_TENS_G3'],
      },
    ],
    alt_paths: [
      {
        label: 'algoritmo vertical',
        steps: [{ idx: 1, latex: '...', checkpoint: true }],
      },
    ],
  };

  it('accepts a well-formed canonical solution', () => {
    expect(canonicalSolutionSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an empty steps array', () => {
    const bad = { ...valid, steps: [] };
    expect(canonicalSolutionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a missing final_answer', () => {
    const bad: Record<string, unknown> = { ...valid };
    delete bad['final_answer'];
    expect(canonicalSolutionSchema.safeParse(bad).success).toBe(false);
  });

  it('requires checkpoint to be a boolean on every step', () => {
    const bad = {
      ...valid,
      steps: [{ idx: 1, latex: 'x', checkpoint: 'yes' }],
    };
    expect(canonicalSolutionSchema.safeParse(bad).success).toBe(false);
  });

  describe('hasCheckpoint', () => {
    it('is true when a main step is a checkpoint', () => {
      expect(hasCheckpoint(valid)).toBe(true);
    });

    it('is true when only an alt_path step is a checkpoint', () => {
      const solution: CanonicalSolution = {
        final_answer: '5',
        points: 1,
        steps: [{ idx: 1, latex: 'a', checkpoint: false }],
        alt_paths: [
          { label: 'alt', steps: [{ idx: 1, latex: 'b', checkpoint: true }] },
        ],
      };
      expect(hasCheckpoint(solution)).toBe(true);
    });

    it('is false when no step is a checkpoint', () => {
      const solution: CanonicalSolution = {
        final_answer: '5',
        points: 1,
        steps: [{ idx: 1, latex: 'a', checkpoint: false }],
      };
      expect(hasCheckpoint(solution)).toBe(false);
    });
  });
});
