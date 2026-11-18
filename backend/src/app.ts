import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { ApiError } from './common/ApiError.js';
import { sendSuccess } from './common/response.js';
import { env } from './config/env.js';
import {
  errorHandler,
  notFoundHandler,
} from './middleware/error.middleware.js';
import { csrfOriginGuard } from './middleware/csrf.middleware.js';
import { apiRateLimiter } from './middleware/rateLimit.middleware.js';
import { sanitizeRequest } from './middleware/sanitize.middleware.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { attachmentsRouter } from './modules/attachments/attachments.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { followUpsRouter } from './modules/follow-ups/followups.routes.js';
import { managerRouter } from './modules/manager/manager.routes.js';
import { meetingsRouter } from './modules/meetings/meetings.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { trackingRouter } from './modules/tracking/tracking.routes.js';
import { usersLookupRouter } from './modules/users/users.lookup.routes.js';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(
          ApiError.forbidden(
            `Origin ${origin} not allowed by CORS`,
            'CSRF_ORIGIN_MISMATCH',
          ),
        );
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-Client-Platform',
      ],
    }),
  );

  app.use(cookieParser());
  app.use(csrfOriginGuard);
  app.use(express.json({ limit: '250kb' }));
  app.use(express.urlencoded({ extended: true, limit: '250kb' }));
  app.use(sanitizeRequest);
  app.use('/api', apiRateLimiter);

  app.get('/api/v1/health', (_req, res) => {
    return sendSuccess(res, {
      service: 'optronix-api',
      status: 'operational',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersLookupRouter);
  app.use('/api/v1/customers', customersRouter);
  app.use('/api/v1/meetings', meetingsRouter);
  app.use('/api/v1/follow-ups', followUpsRouter);
  app.use('/api/v1/manager', managerRouter);
  app.use('/api/v1/reports', reportsRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/attachments', attachmentsRouter);
  app.use('/api/v1/search', searchRouter);
  app.use('/api/v1/tracking', trackingRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
