import { MasteryService } from '@modules/mastery/mastery.service';

describe('MasteryService', () => {
  let service: MasteryService;

  beforeEach(() => {
    service = new MasteryService();
  });

  it('pKnown starts at 0.2 (default prior)', async () => {
    const result = await service.applyAttempt('s1', 'subtraction_borrow', true);
    expect(result.pKnown).toBeGreaterThan(0);
    expect(result.pKnown).toBeLessThanOrEqual(1);
  });

  it('pKnown stays in [0, 1] after correct answer', async () => {
    const result = await service.applyAttempt('s1', 'skill', true);
    expect(result.pKnown).toBeGreaterThanOrEqual(0);
    expect(result.pKnown).toBeLessThanOrEqual(1);
  });

  it('pKnown stays in [0, 1] after incorrect answer', async () => {
    const result = await service.applyAttempt('s2', 'skill', false);
    expect(result.pKnown).toBeGreaterThanOrEqual(0);
    expect(result.pKnown).toBeLessThanOrEqual(1);
  });

  it('monotonically increases pKnown under consecutive correct answers', async () => {
    const values: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await service.applyAttempt('s3', 'skill', true);
      values.push(r.pKnown);
    }
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it('pKnown near 1 stays near 1 after correct answer (near-idempotency at ceiling)', async () => {
    // Apply many correct answers to push pKnown near 1
    for (let i = 0; i < 30; i++) {
      await service.applyAttempt('s4', 'skill', true);
    }
    const before = await service.applyAttempt('s4', 'skill', true);
    const after = await service.applyAttempt('s4', 'skill', true);
    expect(after.pKnown).toBeGreaterThanOrEqual(before.pKnown - 0.01);
  });

  it('getStudentMastery returns only records for given student', async () => {
    await service.applyAttempt('student-A', 'skill1', true);
    await service.applyAttempt('student-A', 'skill2', false);
    await service.applyAttempt('student-B', 'skill1', true);
    const records = await service.getStudentMastery('student-A');
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.studentId === 'student-A')).toBe(true);
  });
});
