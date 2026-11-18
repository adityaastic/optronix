import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';

export function validateBody<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    res.localsSetValidatedQuery(req, parsed.data);
    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
    }
  }
}

function resLocalsAttach(req: Request, data: unknown) {
  req.validatedQuery = data;
}

const res = {
  localsSetValidatedQuery: resLocalsAttach,
};

export function validateParams<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    req.params = parsed.data as Request['params'];
    next();
  };
}
