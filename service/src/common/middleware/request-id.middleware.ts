import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    const requestId =
      (Array.isArray(incoming) ? incoming[0] : incoming)?.toString().trim() ||
      randomBytes(12).toString('hex');
    (req as any).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
