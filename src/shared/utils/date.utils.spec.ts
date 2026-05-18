import { DateUtils } from '@shared/utils/date.utils';

describe('DateUtils', () => {
  it('getUnixTimestamp returns a number close to Date.now()/1000', () => {
    const before = Math.floor(Date.now() / 1000);
    const ts = DateUtils.getUnixTimestamp();
    const after = Math.floor(Date.now() / 1000);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('addDays adds the correct number of days', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    const result = DateUtils.addDays(base, 5);
    expect(result.getUTCDate()).toBe(6);
    expect(result.getUTCMonth()).toBe(0); // January
  });

  it('addDays does not mutate the original date', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    DateUtils.addDays(base, 5);
    expect(base.getUTCDate()).toBe(1);
  });

  it('addDays handles negative days (subtraction)', () => {
    const base = new Date('2026-01-10T00:00:00Z');
    const result = DateUtils.addDays(base, -5);
    expect(result.getUTCDate()).toBe(5);
  });
});
