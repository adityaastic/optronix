import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../common/ApiError.js';
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from '../common/crypto.js';
import { env } from '../config/env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defense-in-depth CSRF Origin/Referer verification for cookie-authenticated
 * state-mutating requests (complements HttpOnly + SameSite=Lax cookies).
 */
export function csrfOriginGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const hasSessionCookie = Boolean(
    req.cookies?.[ACCESS_COOKIE_NAME] || req.cookies?.[REFRESH_COOKIE_NAME],
  );
  if (!hasSessionCookie) {
    next();
    return;
  }

  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      next(
        ApiError.forbidden(
          `Cross-origin state mutation blocked for origin: ${origin}`,
          'CSRF_ORIGIN_MISMATCH',
        ),
      );
      return;
    }
    next();
    return;
  }

  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!allowedOrigins.includes(refOrigin)) {
        next(
          ApiError.forbidden(
            `Cross-origin state mutation blocked for referer: ${refOrigin}`,
            'CSRF_ORIGIN_MISMATCH',
          ),
        );
        return;
      }
    } catch {
      next(
        ApiError.forbidden(
          'Malformed Referer header on authenticated mutation',
          'CSRF_ORIGIN_MISMATCH',
        ),
      );
      return;
    }
  }

  next();
}
