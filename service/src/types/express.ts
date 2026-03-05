import type { AbortController } from 'abort-controller';

export interface JwtPayload {
  id: number;
  role: string;
  username?: string;
  client?: number;
  [key: string]: any;
}

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
      requestId?: string;
      abortController?: AbortController;
    }
  }
}

export {};
