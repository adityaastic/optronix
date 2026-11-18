import {
  FOLLOW_UP_STATUS,
  ROLE_CODES,
  USER_STATUS,
  type AcceptInvitationInput,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type PermissionKey,
  type ResetPasswordInput,
} from '../../shared/index.js';
import { ApiError } from '../../common/ApiError.js';
import { writeAuditLog } from '../../common/audit.service.js';
import {
  generateSecureToken,
  hashPassword,
  sha256Hex,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from '../../common/crypto.js';
import { env } from '../../config/env.js';
import { sendPasswordResetEmail } from '../../common/email.service.js';
import type { AuthenticatedActor } from '../../middleware/auth.middleware.js';
import { CustomerModel } from '../../models/Customer.model.js';
import { FollowUpTaskModel } from '../../models/FollowUpTask.model.js';
import { MeetingModel } from '../../models/Meeting.model.js';
import { NotificationModel } from '../../models/Notification.model.js';
import { PermissionModel } from '../../models/Permission.model.js';
import { RoleModel } from '../../models/Role.model.js';
import { SystemSettingModel } from '../../models/SystemSetting.model.js';
import { UserModel } from '../../models/User.model.js';

export interface RequestClientMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function buildSessionProfile(userId: string | import('mongoose').Types.ObjectId) {
  const user = await UserModel.findById(userId).lean();
  if (!user || user.deletedAt) {
    throw ApiError.notFound('User not found');
  }
  const role = await RoleModel.findById(user.roleId).lean();
  if (!role) {
    throw ApiError.forbidden('User role missing');
  }
  const permissions = await PermissionModel.find(
    { _id: { $in: role.permissionIds } },
    { key: 1 },
  ).lean();

  // Resolve live RBAC-scoped counts for Stitch sidebar badges
  let allowedIds: import('mongoose').Types.ObjectId[] | null = null;
  if (role.code === ROLE_CODES.SALES_EMPLOYEE) {
    allowedIds = [user._id];
  } else if (role.code === ROLE_CODES.SALES_MANAGER) {
    const teamMembers = await UserModel.find(
      { managerId: user._id, deletedAt: null },
      { _id: 1 },
    ).lean();
    allowedIds = [user._id, ...teamMembers.map((m) => m._id)];
  }

  const [
    unreadNotificationsCount,
    meetingsCount,
    customersCount,
    followUpsCount,
    sysSettings,
  ] = await Promise.all([
    NotificationModel.countDocuments({
      recipientId: user._id,
      isRead: false,
    }),
    MeetingModel.countDocuments({
      isDeleted: false,
      ...(allowedIds
        ? {
            $or: [
              { assignedRepId: { $in: allowedIds } },
              { coHostIds: { $in: allowedIds } },
            ],
          }
        : {}),
    }),
    CustomerModel.countDocuments({
      isArchived: false,
      ...(allowedIds ? { assignedRepId: { $in: allowedIds } } : {}),
    }),
    FollowUpTaskModel.countDocuments({
      isDeleted: false,
      status: { $ne: FOLLOW_UP_STATUS.COMPLETED },
      ...(allowedIds ? { ownerId: { $in: allowedIds } } : {}),
    }),
    SystemSettingModel.findOne({ singletonKey: 'DEFAULT' }).lean(),
  ]);

  return {
    id: String(user._id),
    employeeCode: user.employeeCode,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    territory: user.territory ?? null,
    department: user.department ?? null,
    status: user.status,
    managerId: user.managerId ? String(user.managerId) : null,
    role: {
      id: String(role._id),
      code: role.code,
      name: role.name,
      tier: role.tier,
    },
    permissions: permissions.map((p) => p.key as PermissionKey),
    unreadNotificationsCount,
    sidebarCounts: {
      meetings: meetingsCount,
      customers: customersCount,
      followUps: followUpsCount,
    },
    tenantSettings: {
      organizationName: sysSettings?.organizationName ?? 'Optronix',
      defaultTimezone: sysSettings?.defaultTimezone ?? 'Asia/Kolkata',
      defaultCurrency: sysSettings?.defaultCurrency ?? 'INR',
      defaultGeofenceRadiusMeters:
        sysSettings?.defaultGeofenceRadiusMeters ?? 100,
    },
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

export async function loginUser(input: LoginInput, meta: RequestClientMeta) {
  const user = await UserModel.findOne({
    email: input.email.toLowerCase(),
    deletedAt: null,
  }).select('+passwordHash');

  if (!user) {
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (user.status === USER_STATUS.PENDING) {
    throw ApiError.forbidden(
      'Your account invitation is pending activation. Use your invitation link to set your initial password.',
      'ACCOUNT_PENDING_ACTIVATION',
    );
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden(
      'Your workstation account is inactive. Contact an administrator.',
      'ACCOUNT_INACTIVE',
    );
  }

  const passwordValid = await verifyPassword(input.password, user.passwordHash);
  if (!passwordValid) {
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const role = await RoleModel.findById(user.roleId).lean();
  if (!role) {
    throw ApiError.forbidden('Assigned security role is invalid');
  }

  const now = new Date();
  user.lastLoginAt = now;
  user.lastActiveAt = now;
  await user.save();

  const accessToken = signAccessToken({
    sub: String(user._id),
    role: role.code,
    tv: user.tokenVersion,
  });

  const refreshToken = signRefreshToken({
    sub: String(user._id),
    tv: user.tokenVersion,
    remember: Boolean(input.rememberWorkstation),
  });

  await writeAuditLog({
    actorId: user._id,
    actorRole: role.code,
    action: 'AUTH_LOGIN',
    entityType: 'USER',
    entityId: user._id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  const profile = await buildSessionProfile(user._id);

  return {
    accessToken,
    refreshToken,
    remember: Boolean(input.rememberWorkstation),
    user: profile,
  };
}

export async function refreshUserSession(refreshTokenCookie: string | undefined) {
  if (!refreshTokenCookie) {
    throw ApiError.unauthorized('Refresh token missing', 'REFRESH_MISSING');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshTokenCookie);
  } catch {
    throw ApiError.unauthorized('Refresh token expired or invalid', 'REFRESH_INVALID');
  }

  if (decoded.type !== 'refresh') {
    throw ApiError.unauthorized('Invalid token type');
  }

  const user = await UserModel.findById(decoded.sub);
  if (!user || user.deletedAt || user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.unauthorized('User account is inactive or unavailable');
  }

  if (user.tokenVersion !== decoded.tv) {
    throw ApiError.unauthorized('Session has been revoked', 'SESSION_REVOKED');
  }

  const role = await RoleModel.findById(user.roleId).lean();
  if (!role) {
    throw ApiError.forbidden('Assigned security role is invalid');
  }

  user.lastActiveAt = new Date();
  await user.save();

  const accessToken = signAccessToken({
    sub: String(user._id),
    role: role.code,
    tv: user.tokenVersion,
  });

  const refreshToken = signRefreshToken({
    sub: String(user._id),
    tv: user.tokenVersion,
    remember: decoded.remember,
  });

  const profile = await buildSessionProfile(user._id);

  return {
    accessToken,
    refreshToken,
    remember: decoded.remember,
    user: profile,
  };
}

export async function logoutUser(
  actor: AuthenticatedActor | undefined,
  meta: RequestClientMeta,
) {
  if (actor) {
    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'AUTH_LOGOUT',
      entityType: 'USER',
      entityId: actor.userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }
}

export async function requestPasswordReset(
  input: ForgotPasswordInput,
  meta: RequestClientMeta,
) {
  const user = await UserModel.findOne({
    email: input.email.toLowerCase(),
    deletedAt: null,
    status: USER_STATUS.ACTIVE,
  }).select('+passwordResetTokenHash +passwordResetExpiresAt');

  let rawToken: string | undefined;
  let emailPreviewUrl: string | null = null;

  if (user) {
    rawToken = generateSecureToken(32);
    user.passwordResetTokenHash = sha256Hex(rawToken);
    user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    await writeAuditLog({
      actorId: user._id,
      actorRole: null,
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      entityType: 'USER',
      entityId: user._id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const mailRes = await sendPasswordResetEmail({
      to: user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      rawToken,
    });
    emailPreviewUrl = mailRes.previewUrl ?? null;
  }

  return {
    message:
      'If an active corporate account matches that email, a password reset link has been dispatched.',
    ...(env.NODE_ENV !== 'production' && rawToken
      ? { debugResetToken: rawToken, emailPreviewUrl }
      : {}),
  };
}

export async function resetPasswordWithToken(
  input: ResetPasswordInput,
  meta: RequestClientMeta,
) {
  const tokenHash = sha256Hex(input.token);

  const user = await UserModel.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
    deletedAt: null,
    status: USER_STATUS.ACTIVE,
  }).select('+passwordHash +passwordResetTokenHash +passwordResetExpiresAt');

  if (!user) {
    throw ApiError.badRequest(
      'Password reset token is invalid or has expired.',
      undefined,
      'INVALID_RESET_TOKEN',
    );
  }

  user.passwordHash = await hashPassword(input.newPassword);
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  if (input.invalidateRemoteSessions !== false) {
    user.tokenVersion += 1;
  }
  await user.save();

  await writeAuditLog({
    actorId: user._id,
    actorRole: null,
    action: 'AUTH_PASSWORD_RESET_COMPLETED',
    entityType: 'USER',
    entityId: user._id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    message: 'Security credentials updated successfully. You may now sign in.',
  };
}

export async function changeUserPassword(
  actor: AuthenticatedActor,
  input: ChangePasswordInput,
  meta: RequestClientMeta,
) {
  const user = await UserModel.findById(actor.userId).select('+passwordHash');
  if (!user || user.deletedAt) {
    throw ApiError.notFound('User account not found');
  }

  const validCurrent = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );
  if (!validCurrent) {
    throw ApiError.badRequest(
      'Current password is incorrect',
      undefined,
      'INVALID_CURRENT_PASSWORD',
    );
  }

  user.passwordHash = await hashPassword(input.newPassword);
  if (input.invalidateRemoteSessions) {
    user.tokenVersion += 1;
  }
  await user.save();

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'AUTH_PASSWORD_CHANGED',
    entityType: 'USER',
    entityId: actor.userId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  const accessToken = signAccessToken({
    sub: String(user._id),
    role: actor.roleCode,
    tv: user.tokenVersion,
  });

  const refreshToken = signRefreshToken({
    sub: String(user._id),
    tv: user.tokenVersion,
    remember: false,
  });

  return {
    accessToken,
    refreshToken,
    message: 'Password updated successfully.',
  };
}

export async function updateOwnProfile(
  actor: AuthenticatedActor,
  patch: { firstName?: string; lastName?: string; phone?: string; avatarUrl?: string },
  meta: RequestClientMeta,
) {
  const user = await UserModel.findById(actor.userId);
  if (!user || user.deletedAt) {
    throw ApiError.notFound('User account not found');
  }

  if (patch.firstName !== undefined) user.firstName = patch.firstName.trim();
  if (patch.lastName !== undefined) user.lastName = patch.lastName.trim();
  if (patch.phone !== undefined) user.phone = patch.phone.trim();
  if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl.trim();
  await user.save();

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'USER_PROFILE_UPDATED',
    entityType: 'USER',
    entityId: actor.userId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return buildSessionProfile(user._id);
}

export async function verifyInvitationToken(rawToken: string) {
  const tokenHash = sha256Hex(rawToken.trim());

  const user = await UserModel.findOne({
    invitationTokenHash: tokenHash,
    invitationExpiresAt: { $gt: new Date() },
    status: USER_STATUS.PENDING,
    deletedAt: null,
  })
    .select('+invitationExpiresAt')
    .lean();

  if (!user) {
    throw ApiError.badRequest(
      'This invitation link is invalid, expired, or has already been activated.',
      undefined,
      'INVALID_INVITATION_TOKEN',
    );
  }

  const role = await RoleModel.findById(user.roleId).lean();
  if (!role) {
    throw ApiError.forbidden('Assigned role does not exist');
  }

  return {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    employeeCode: user.employeeCode,
    territory: user.territory ?? null,
    department: user.department ?? null,
    role: {
      code: role.code,
      name: role.name,
    },
    expiresAt: user.invitationExpiresAt ?? null,
  };
}

export async function acceptInvitationAndActivate(
  input: AcceptInvitationInput,
  meta: RequestClientMeta,
) {
  const tokenHash = sha256Hex(input.token.trim());

  const user = await UserModel.findOne({
    invitationTokenHash: tokenHash,
    invitationExpiresAt: { $gt: new Date() },
    status: USER_STATUS.PENDING,
    deletedAt: null,
  }).select('+passwordHash +invitationTokenHash +invitationExpiresAt');

  if (!user) {
    throw ApiError.badRequest(
      'This invitation link is invalid, expired, or has already been activated.',
      undefined,
      'INVALID_INVITATION_TOKEN',
    );
  }

  const role = await RoleModel.findById(user.roleId).lean();
  if (!role) {
    throw ApiError.forbidden('Assigned role does not exist');
  }

  const now = new Date();
  user.passwordHash = await hashPassword(input.password);
  if (input.phone !== undefined) {
    user.phone = input.phone;
  }
  user.status = USER_STATUS.ACTIVE;
  user.activatedAt = now;
  user.lastLoginAt = now;
  user.lastActiveAt = now;
  // Single-use invalidation: clear invitation token hash & expiry immediately
  user.invitationTokenHash = null;
  user.invitationExpiresAt = null;
  user.tokenVersion += 1;
  await user.save();

  await writeAuditLog({
    actorId: user._id,
    actorRole: role.code,
    action: 'USER_INVITATION_ACCEPTED',
    entityType: 'USER',
    entityId: user._id,
    afterSnapshot: {
      employeeCode: user.employeeCode,
      email: user.email,
      roleCode: role.code,
      status: USER_STATUS.ACTIVE,
      activatedAt: now.toISOString(),
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  const accessToken = signAccessToken({
    sub: String(user._id),
    role: role.code,
    tv: user.tokenVersion,
  });

  const refreshToken = signRefreshToken({
    sub: String(user._id),
    tv: user.tokenVersion,
    remember: true,
  });

  const profile = await buildSessionProfile(user._id);
  const redirectPath =
    role.code === ROLE_CODES.ADMIN
      ? '/admin/settings'
      : role.code === ROLE_CODES.SALES_MANAGER
        ? '/team-activity'
        : '/dashboard';

  return {
    accessToken,
    refreshToken,
    user: profile,
    redirectPath,
  };
}
