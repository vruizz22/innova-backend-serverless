import { AllExceptionsFilter } from '@shared/exceptions/http-exception.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import {
  DomainException,
  ResourceNotFoundException,
  ValidationException,
} from '@shared/exceptions/domain.exception';

function buildMockHost(mockJson: jest.Mock) {
  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: mockJson,
  };
  const mockRequest = { method: 'GET', url: '/test', traceId: 'trace-123' };
  return {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: jest.fn().mockReturnValue(mockResponse),
      getRequest: jest.fn().mockReturnValue(mockRequest),
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockJson: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockJson = jest.fn();
    host = buildMockHost(mockJson);
  });

  it('handles HttpException with correct status', () => {
    filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), host);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('handles HttpException with object response', () => {
    filter.catch(
      new HttpException(
        { message: 'Bad input', error: 'VALIDATION' },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Bad input' }),
    );
  });

  it('handles ResourceNotFoundException as 404', () => {
    filter.catch(new ResourceNotFoundException('User', 'abc123'), host);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' }),
    );
  });

  it('handles ValidationException as 422', () => {
    filter.catch(new ValidationException('Invalid field'), host);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 422, code: 'VALIDATION_ERROR' }),
    );
  });

  it('handles generic DomainException as 400', () => {
    filter.catch(new DomainException('Domain error', 'CUSTOM_CODE'), host);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, code: 'CUSTOM_CODE' }),
    );
  });

  it('handles Prisma known error (code starting with P)', () => {
    const prismaErr = { code: 'P2002', message: 'Unique constraint violation' };
    filter.catch(prismaErr, host);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, code: 'P2002' }),
    );
  });

  it('handles unknown error as 500', () => {
    filter.catch(new Error('unknown crash'), host);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    );
  });

  it('includes traceId in response', () => {
    filter.catch(new Error('crash'), host);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: 'trace-123' }),
    );
  });
});
