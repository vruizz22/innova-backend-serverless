export class DomainException extends Error {
  constructor(
    message: string,
    public readonly code: string = 'DOMAIN_ERROR',
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ResourceNotFoundException extends DomainException {
  constructor(resourceName: string, identifier: string) {
    super(
      `${resourceName} with identifier ${identifier} was not found`,
      'RESOURCE_NOT_FOUND',
    );
  }
}

export class ValidationException extends DomainException {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}
