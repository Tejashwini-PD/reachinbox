import type { Request, RequestHandler } from 'express';
import { UnauthorizedError } from '../lib/errors';

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session?.userId) {
    next(new UnauthorizedError());
    return;
  }
  next();
};

export const optionalAuth: RequestHandler = (_req, _res, next) => {
  next();
};

export function getUserId(req: Request): string {
  const userId = req.session?.userId;
  if (!userId) throw new UnauthorizedError();
  return userId;
}
