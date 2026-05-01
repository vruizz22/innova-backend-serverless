import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { MongooseError } from 'mongoose';
import { Request, Response } from 'express';
import {
  DomainException,
  ResourceNotFoundException,
  ValidationException,
} from '@shared/exceptions/domain.exception';

function isPrismaKnownError(
  exception: unknown,
): exception is { code: string; message: string } {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    typeof (exception as { code?: unknown }).code === 'string' &&
    (exception as { code: string }).code.startsWith('P')
  );
}

interface TraceRequest extends Request {
  traceId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<TraceRequest>();

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
    } else if (isPrismaKnownError(exception)) {
      status = HttpStatus.BAD_REQUEST;
      code = exception.code;
      message = 'Database request error';
    } else if (exception instanceof MongooseError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'MONGOOSE_ERROR';
      message = exception.message;
    }

    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status} - Error: ${exception instanceof Error ? exception.message : String(exception)}`,
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      traceId: request.traceId ?? null,
      code,
      message,
    });
  }
}
