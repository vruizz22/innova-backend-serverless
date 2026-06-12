import { of } from 'rxjs';
import { LoggingInterceptor } from '@shared/http/logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
  });

  it('passes request through and logs it', (done) => {
    const mockRequest = { method: 'GET', url: '/test', traceId: 'trace-001' };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as Parameters<typeof interceptor.intercept>[0];

    const mockCallHandler = {
      handle: () => of({ data: 'response' }),
    };

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: (value) => {
        expect(value).toEqual({ data: 'response' });
        done();
      },
    });
  });

  it('works without traceId header', (done) => {
    const mockRequest = { method: 'POST', url: '/attempts' };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as Parameters<typeof interceptor.intercept>[0];

    const mockCallHandler = {
      handle: () => of(null),
    };

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: () => {
        done();
      },
    });
  });
});
