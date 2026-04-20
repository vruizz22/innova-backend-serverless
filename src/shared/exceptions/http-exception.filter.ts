import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  DomainException,
  ResourceNotFoundException,
  ValidationException,
} from './domain.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as Record<string, unknown> | string;
      message =
        typeof res === 'string'
          ? res
          : (res.message as string) || exception.message;
      code =
        typeof res === 'string'
          ? 'HTTP_ERROR'
          : (res.error as string) || 'HTTP_ERROR';
    } else if (exception instanceof DomainException) {
      status = HttpStatus.BAD_REQUEST;
      if (exception instanceof ResourceNotFoundException) {
        status = HttpStatus.NOT_FOUND;
      } else if (exception instanceof ValidationException) {
        status = HttpStatus.UNPROCESSABLE_ENTITY;
      }
      message = exception.message;
      code = exception.code;
    }

    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status} - Error: ${exception}`,
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      code,
      message,
    });
  }
}
