import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ path: string; traceId?: string }>();

    return next.handle().pipe(
      map((data) => ({
        statusCode: 200,
        data,
        timestamp: new Date().toISOString(),
        path: request.path,
        traceId: request.traceId ?? null,
      })),
    );
  }
}
