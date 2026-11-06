import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../lib/errors';

function zodDetails(error: import('zod').ZodError): unknown {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(new ValidationError('Request body validation failed', zodDetails(parsed.error)));
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      next(new ValidationError('Query validation failed', zodDetails(parsed.error)));
      return;
    }
    res.locals.query = parsed.data;
    next();
  };
}

export function validateParams(schema: ZodTypeAny): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      next(new ValidationError('Path parameter validation failed', zodDetails(parsed.error)));
      return;
    }
    res.locals.params = parsed.data;
    next();
  };
}
