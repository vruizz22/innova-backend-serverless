import {
  DomainException,
  ResourceNotFoundException,
  ValidationException,
} from '@shared/exceptions/domain.exception';

describe('DomainException', () => {
  it('creates exception with message and default code', () => {
    const ex = new DomainException('test error');
    expect(ex.message).toBe('test error');
    expect(ex.code).toBe('DOMAIN_ERROR');
    expect(ex).toBeInstanceOf(Error);
  });

  it('creates exception with custom code', () => {
    const ex = new DomainException('test', 'CUSTOM_CODE');
    expect(ex.code).toBe('CUSTOM_CODE');
  });
});

describe('ResourceNotFoundException', () => {
  it('creates not found exception with resource and identifier', () => {
    const ex = new ResourceNotFoundException('User', '123');
    expect(ex.message).toContain('User');
    expect(ex.message).toContain('123');
    expect(ex.code).toBe('RESOURCE_NOT_FOUND');
    expect(ex).toBeInstanceOf(DomainException);
  });
});

describe('ValidationException', () => {
  it('creates validation exception', () => {
    const ex = new ValidationException('Invalid field');
    expect(ex.message).toBe('Invalid field');
    expect(ex.code).toBe('VALIDATION_ERROR');
    expect(ex).toBeInstanceOf(DomainException);
  });
});
