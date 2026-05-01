import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

interface TraceRequest extends Request {
  traceId?: string;
}

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: TraceRequest, res: Response, next: NextFunction): void {
    const existingTraceId = req.header('x-trace-id');
    const traceId =
      existingTraceId && existingTraceId.length > 0
        ? existingTraceId
        : randomUUID();

    req.traceId = traceId;
    res.setHeader('x-trace-id', traceId);
    next();
  }
}
