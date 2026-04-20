import { FslsmProfile } from './fslsm-profile.entity';

describe('FslsmProfile Domain Entity', () => {
  it('should create a valid FSLSM profile', () => {
    const profile = new FslsmProfile('uuid-123', 'user-456', 5, -3, 11, -11);

    expect(profile.id).toBe('uuid-123');
    expect(profile.userId).toBe('user-456');
    expect(profile.active).toBe(5);
    expect(profile.sensing).toBe(-3);
  });

  it('should format correctly using the static create method', () => {
    const props = {
      userId: 'user-789',
      active: 3,
      sensing: 5,
      visual: -1,
      sequential: 9,
    };
    const profile = FslsmProfile.create(props);

    expect(profile.userId).toBe('user-789');
    expect(profile.active).toBe(3);
    expect(profile.id).toBe(''); // Based on current setup until DB generation
  });

  it('should throw error when a dimension is out of bounds (+11)', () => {
    expect(() => new FslsmProfile('uuid', 'user-id', 13, 0, 0, 0)).toThrow(
      'FSLSM dimensions must be numbers between -11 and +11.',
    );
  });

  it('should throw error when a dimension is out of bounds (-11)', () => {
    expect(() => new FslsmProfile('uuid', 'user-id', -12, 0, 0, 0)).toThrow(
      'FSLSM dimensions must be numbers between -11 and +11.',
    );
  });
});
