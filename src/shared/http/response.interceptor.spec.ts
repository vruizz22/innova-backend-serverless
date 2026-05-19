import { of } from 'rxjs';
import { ResponseInterceptor } from '@shared/http/response.interceptor';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
  });

  it('wraps response in envelope with statusCode, data, timestamp, path', (done) => {
    const mockRequest = { path: '/test', traceId: 'trace-001' };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as Parameters<typeof interceptor.intercept>[0];

    const mockCallHandler = {
      handle: () => of({ id: 'user-001' }),
    };

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: (value) => {
        const response = value as Record<string, unknown>;
        expect(response['statusCode']).toBe(200);
        expect(response['data']).toEqual({ id: 'user-001' });
        expect(typeof response['timestamp']).toBe('string');
        expect(response['path']).toBe('/test');
        expect(response['traceId']).toBe('trace-001');
        done();
      },
    });
  });

  it('traceId is null when not present on request', (done) => {
    const mockRequest = { path: '/health' };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as Parameters<typeof interceptor.intercept>[0];

    const mockCallHandler = {
      handle: () => of('ok'),
    };

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: (value) => {
        const response = value as Record<string, unknown>;
        expect(response['traceId']).toBeNull();
        done();
      },
    });
  });
});
