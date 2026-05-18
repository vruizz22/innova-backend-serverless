import { PracticeService } from '@modules/practice/practice.service';

describe('PracticeService', () => {
  let service: PracticeService;

  beforeEach(() => {
    service = new PracticeService();
  });

  it('createAssignment returns an assignment view with provided fields', () => {
    const result = service.createAssignment(
      'student-1',
      ['item-1', 'item-2'],
      '2026-06-01',
    );
    expect(result.studentId).toBe('student-1');
    expect(result.itemIds).toEqual(['item-1', 'item-2']);
    expect(result.dueAt).toBe('2026-06-01');
    expect(result.id).toBeDefined();
  });

  it('generates a unique id for each assignment', () => {
    const a = service.createAssignment('s1', ['item-1']);
    const b = service.createAssignment('s1', ['item-1']);
    expect(a.id).not.toBe(b.id);
  });

  it('works without dueAt', () => {
    const result = service.createAssignment('student-2', ['item-3']);
    expect(result.dueAt).toBeUndefined();
  });

  it('works with empty item list', () => {
    const result = service.createAssignment('student-3', []);
    expect(result.itemIds).toEqual([]);
  });
});
