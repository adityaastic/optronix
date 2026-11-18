import type { NextFunction, Request, Response } from 'express';

function sanitizeObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeObject);
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith('$') || k.includes('.')) {
        continue;
      }
      clean[k] = sanitizeObject(v);
    }
    return clean;
  }
  return value;
}

export function sanitizeRequest(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params) as Request['params'];
  }
  next();
}
