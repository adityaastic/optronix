import { Router } from 'express';
import {
  acceptInvitationSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  verifyInvitationQuerySchema,
} from '../../shared/index.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authRateLimiter } from '../../middleware/rateLimit.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validate.middleware.js';
import {
  acceptInvitationController,
  changePasswordController,
  currentSessionController,
  forgotPasswordController,
  loginController,
  logoutController,
  refreshController,
  resetPasswordController,
  updateProfileController,
  updateProfileSchema,
  verifyInvitationController,
} from './auth.controller.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  authRateLimiter,
  validateBody(loginSchema),
  loginController,
);

authRouter.post('/refresh', authRateLimiter, refreshController);

authRouter.post('/logout', logoutController);

authRouter.get('/me', authenticate, currentSessionController);

authRouter.post(
  '/forgot-password',
  authRateLimiter,
  validateBody(forgotPasswordSchema),
  forgotPasswordController,
);

authRouter.post(
  '/reset-password',
  authRateLimiter,
  validateBody(resetPasswordSchema),
  resetPasswordController,
);

authRouter.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  changePasswordController,
);

authRouter.patch(
  '/profile',
  authenticate,
  validateBody(updateProfileSchema),
  updateProfileController,
);

authRouter.get(
  '/invite/verify',
  authRateLimiter,
  validateQuery(verifyInvitationQuerySchema),
  verifyInvitationController,
);

authRouter.post(
  '/invite/accept',
  authRateLimiter,
  validateBody(acceptInvitationSchema),
  acceptInvitationController,
);
