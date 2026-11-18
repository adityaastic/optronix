import type { Request, Response } from 'express';
import { z } from 'zod';
import { optionalPhoneNumberSchema } from '../../shared/index.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  clearAuthCookies,
  setAuthCookies,
  verifyAccessToken,
} from '../../common/crypto.js';
import { sendSuccess } from '../../common/response.js';
import { getAuthActor } from '../../middleware/auth.middleware.js';
import { RoleModel } from '../../models/Role.model.js';
import { UserModel } from '../../models/User.model.js';
import {
  acceptInvitationAndActivate,
  buildSessionProfile,
  changeUserPassword,
  loginUser,
  logoutUser,
  refreshUserSession,
  requestPasswordReset,
  resetPasswordWithToken,
  updateOwnProfile,
  verifyInvitationToken,
} from './auth.service.js';

function extractClientMeta(req: Request) {
  return {
    ipAddress: req.ip ?? req.socket.remoteAddress ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

function isMobileClient(req: Request): boolean {
  return String(req.headers['x-client-platform'] ?? '').toLowerCase() === 'mobile';
}

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginUser(req.body, extractClientMeta(req));
  setAuthCookies(res, result.accessToken, result.refreshToken, result.remember);
  return sendSuccess(
    res,
    {
      user: result.user,
      ...(isMobileClient(req)
        ? {
            tokens: {
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
            },
          }
        : {}),
    },
    200,
  );
});

export const refreshController = asyncHandler(
  async (req: Request, res: Response) => {
    const mobileToken =
      isMobileClient(req) && typeof req.body?.refreshToken === 'string'
        ? req.body.refreshToken
        : undefined;
    const refreshCookie =
      (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined) ?? mobileToken;
    const result = await refreshUserSession(refreshCookie);
    setAuthCookies(res, result.accessToken, result.refreshToken, result.remember);
    return sendSuccess(
      res,
      {
        user: result.user,
        ...(isMobileClient(req)
          ? {
              tokens: {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
              },
            }
          : {}),
      },
      200,
    );
  },
);

export const logoutController = asyncHandler(
  async (req: Request, res: Response) => {
    // Best-effort resolve actor from access cookie if still valid
    let actor = req.auth;
    if (!actor) {
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined;
      const token =
        (req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined) ?? bearerToken;
      if (token) {
        try {
          const decoded = verifyAccessToken(token);
          const user = await UserModel.findById(decoded.sub).lean();
          const role = user ? await RoleModel.findById(user.roleId).lean() : null;
          if (user && role) {
            actor = {
              userId: user._id,
              employeeCode: user.employeeCode,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              fullName: `${user.firstName} ${user.lastName}`,
              roleId: role._id,
              roleCode: role.code,
              roleName: role.name,
              permissions: new Set(),
              managerId: user.managerId ?? null,
            };
          }
        } catch {
          // Ignore expired token on logout
        }
      }
    }

    await logoutUser(actor, extractClientMeta(req));
    clearAuthCookies(res);
    return sendSuccess(res, { message: 'Signed out successfully' }, 200);
  },
);

export const currentSessionController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const profile = await buildSessionProfile(actor.userId);
    return sendSuccess(res, { user: profile }, 200);
  },
);

export const forgotPasswordController = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await requestPasswordReset(req.body, extractClientMeta(req));
    return sendSuccess(res, result, 200);
  },
);

export const resetPasswordController = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await resetPasswordWithToken(req.body, extractClientMeta(req));
    clearAuthCookies(res);
    return sendSuccess(res, result, 200);
  },
);

export const changePasswordController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const result = await changeUserPassword(actor, req.body, extractClientMeta(req));
    setAuthCookies(res, result.accessToken, result.refreshToken, false);
    return sendSuccess(
      res,
      {
        message: result.message,
        ...(isMobileClient(req)
          ? {
              tokens: {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
              },
            }
          : {}),
      },
      200,
    );
  },
);

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: optionalPhoneNumberSchema,
  avatarUrl: z.string().trim().max(500).optional(),
});

export const updateProfileController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const profile = await updateOwnProfile(actor, req.body, extractClientMeta(req));
    return sendSuccess(res, { user: profile }, 200);
  },
);

export const verifyInvitationController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = req.validatedQuery as { token: string };
    const invitation = await verifyInvitationToken(query.token);
    return sendSuccess(res, { invitation }, 200);
  },
);

export const acceptInvitationController = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await acceptInvitationAndActivate(
      req.body,
      extractClientMeta(req),
    );
    setAuthCookies(res, result.accessToken, result.refreshToken, true);
    return sendSuccess(
      res,
      {
        user: result.user,
        redirectPath: result.redirectPath,
        ...(isMobileClient(req)
          ? {
              tokens: {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
              },
            }
          : {}),
      },
      200,
    );
  },
);
