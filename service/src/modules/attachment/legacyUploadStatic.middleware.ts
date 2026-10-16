import { RequestHandler } from 'express';
import { posix } from 'path';

export const blockLegacyUploadStatic: RequestHandler = (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let pathname: string;
  try {
    pathname = posix.normalize(decodeURIComponent(req.path).replace(/\\/g, '/'));
  } catch {
    res.sendStatus(404);
    return;
  }
  if (/^\/(?:api\/|static\/)?file(?:\/|$)/i.test(pathname)) {
    res.sendStatus(404);
    return;
  }
  next();
};
