import { TraceIdMiddleware } from '@shared/http/trace-id.middleware';
import { Request, Response } from 'express';

interface TraceRequest extends Request {
  traceId?: string;
}

function buildMocks() {
  const req = {} as TraceRequest;
  const res = { setHeader: jest.fn() } as unknown as Response;
  const next = jest.fn();
  return { req, res, next };
}

describe('TraceIdMiddleware', () => {
  let middleware: TraceIdMiddleware;

  beforeEach(() => {
    middleware = new TraceIdMiddleware();
  });

  it('generates a UUID traceId when x-trace-id header is absent', () => {
    const { req, res, next } = buildMocks();
    req.header = jest.fn().mockReturnValue(undefined);

    middleware.use(req, res, next);

    expect(req.traceId).toBeDefined();
    expect(typeof req.traceId).toBe('string');
    expect(req.traceId!.length).toBeGreaterThan(0);
    expect(res.setHeader).toHaveBeenCalledWith('x-trace-id', req.traceId);
    expect(next).toHaveBeenCalled();
  });

  it('reuses existing x-trace-id header when present', () => {
    const { req, res, next } = buildMocks();
    req.header = jest.fn().mockReturnValue('existing-trace-id');

    middleware.use(req, res, next);

    expect(req.traceId).toBe('existing-trace-id');
    expect(res.setHeader).toHaveBeenCalledWith(
      'x-trace-id',
      'existing-trace-id',
    );
    expect(next).toHaveBeenCalled();
  });

  it('generates a new UUID when x-trace-id header is empty string', () => {
    const { req, res, next } = buildMocks();
    req.header = jest.fn().mockReturnValue('');

    middleware.use(req, res, next);

    expect(req.traceId).toBeDefined();
    expect(req.traceId).not.toBe('');
  });
});
