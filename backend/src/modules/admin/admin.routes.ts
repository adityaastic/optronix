import { Router, type Request, type Response } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  FOLLOW_UP_STATUS,
  MEETING_STATUS,
  PERMISSIONS,
  ROLE_CODES,
  USER_STATUS,
  auditLogQuerySchema,
  createUserSchema,
  deactivateUserSchema,
  inviteUserSchema,
  objectIdSchema,
  paginationQuerySchema,
  updateRolePermissionsSchema,
  updateSystemSettingsSchema,
  updateUserSchema,
  type AuditLogQuery,
  type CreateUserInput,
  type DeactivateUserInput,
  type InviteUserInput,
  type PaginationQuery,
  type UpdateRolePermissionsInput,
  type UpdateSystemSettingsInput,
  type UpdateUserInput,
} from '../../shared/index.js';
import { ApiError } from '../../common/ApiError.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import {
  generateEntityCode,
  verifyAuditChainIntegrity,
  writeAuditLog,
} from '../../common/audit.service.js';
import { sendInvitationEmail } from '../../common/email.service.js';
import { publishRealtimeEvent } from '../../common/realtime.service.js';
import {
  generateSecureToken,
  hashPassword,
  sha256Hex,
} from '../../common/crypto.js';
import {
  buildPaginationMeta,
  paramId,
  sendSuccess,
} from '../../common/response.js';
import { withTransaction } from '../../config/database.js';
import { authenticate, getAuthActor } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.middleware.js';
import { AuditLogModel } from '../../models/AuditLog.model.js';
import { CustomerModel } from '../../models/Customer.model.js';
import { FollowUpTaskModel } from '../../models/FollowUpTask.model.js';
import { MeetingModel } from '../../models/Meeting.model.js';
import { PermissionModel } from '../../models/Permission.model.js';
import { RoleModel } from '../../models/Role.model.js';
import { SystemSettingModel } from '../../models/SystemSetting.model.js';
import { UserModel } from '../../models/User.model.js';

const idParamSchema = z.object({ id: objectIdSchema });

const adminUserListQuerySchema = paginationQuerySchema.extend({
  roleCode: z
    .enum([
      ROLE_CODES.SALES_EMPLOYEE,
      ROLE_CODES.SALES_MANAGER,
      ROLE_CODES.ADMIN,
    ])
    .optional(),
  status: z
    .enum([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE, USER_STATUS.PENDING])
    .optional(),
});

export const adminRouter: Router = Router();
adminRouter.use(authenticate);

// 1. Platform Overview Stats (6-Card Row on Stitch Screen #12)
adminRouter.get(
  '/overview',
  requirePermissions(PERMISSIONS.USERS_MANAGE),
  asyncHandler(async (_req: Request, res: Response) => {
    const repRole = await RoleModel.findOne({
      code: ROLE_CODES.SALES_EMPLOYEE,
    }).lean();

    const [
      totalUsers,
      activeSalesReps,
      totalAccounts,
      loggedMeetings,
      completedMeetings,
      openFollowUpAlerts,
    ] = await Promise.all([
      UserModel.countDocuments({ deletedAt: null }),
      UserModel.countDocuments({
        deletedAt: null,
        status: USER_STATUS.ACTIVE,
        ...(repRole ? { roleId: repRole._id } : {}),
      }),
      CustomerModel.countDocuments({ isArchived: false }),
      MeetingModel.countDocuments({ isDeleted: false }),
      MeetingModel.countDocuments({
        isDeleted: false,
        status: MEETING_STATUS.COMPLETED,
      }),
      FollowUpTaskModel.countDocuments({
        isDeleted: false,
        status: FOLLOW_UP_STATUS.OVERDUE,
      }),
    ]);

    return sendSuccess(res, {
      stats: {
        totalUsers,
        activeSalesReps,
        totalAccounts,
        loggedMeetings,
        completionRatePercent:
          loggedMeetings > 0
            ? Math.round((completedMeetings / loggedMeetings) * 1000) / 10
            : 0,
        openFollowUpAlerts,
      },
    });
  }),
);

// 2. User Directory & Provisioning
adminRouter.get(
  '/users',
  requirePermissions(PERMISSIONS.USERS_MANAGE),
  validateQuery(adminUserListQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as PaginationQuery & {
      roleCode?: string;
      status?: string;
    };

    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.status) filter.status = query.status;
    if (query.roleCode) {
      const roleDoc = await RoleModel.findOne({ code: query.roleCode }).lean();
      if (roleDoc) filter.roleId = roleDoc._id;
    }
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { employeeCode: regex },
        { territory: regex },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [total, docs] = await Promise.all([
      UserModel.countDocuments(filter),
      UserModel.find(filter)
        .populate('roleId', 'code name tier')
        .populate('managerId', 'firstName lastName employeeCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean(),
    ]);

    const users = docs.map((u) => {
      const role = u.roleId as unknown as {
        _id: Types.ObjectId;
        code: string;
        name: string;
        tier: number;
      } | null;
      const mgr = u.managerId as unknown as {
        _id: Types.ObjectId;
        firstName: string;
        lastName: string;
        employeeCode: string;
      } | null;

      return {
        id: String(u._id),
        employeeCode: u.employeeCode,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: `${u.firstName} ${u.lastName}`.trim(),
        phone: u.phone ?? null,
        territory: u.territory ?? null,
        department: u.department ?? null,
        status: u.status,
        role: role
          ? {
              id: String(role._id),
              code: role.code,
              name: role.name,
              tier: role.tier,
            }
          : null,
        manager: mgr
          ? {
              id: String(mgr._id),
              fullName: `${mgr.firstName} ${mgr.lastName}`.trim(),
              employeeCode: mgr.employeeCode,
            }
          : null,
        createdAt: u.createdAt,
        invitedAt: u.invitedAt ?? null,
        activatedAt: u.activatedAt ?? null,
        lastLoginAt: u.lastLoginAt ?? null,
      };
    });

    return sendSuccess(
      res,
      { users },
      200,
      buildPaginationMeta(total, query.page, query.limit),
    );
  }),
);

adminRouter.post(
  '/users',
  requirePermissions(PERMISSIONS.USERS_MANAGE),
  validateBody(createUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const input = req.body as CreateUserInput;

    const existing = await UserModel.findOne({
      email: input.email.toLowerCase(),
    }).lean();
    if (existing) {
      throw ApiError.conflict('A user with this corporate email already exists');
    }

    const role = await RoleModel.findOne({ code: input.roleCode }).lean();
    if (!role) {
      throw ApiError.badRequest('Specified role does not exist');
    }

    const employeeCode = generateEntityCode('OPT');
    const passwordHash = await hashPassword(input.password);

    const created = await UserModel.create({
      employeeCode,
      email: input.email.toLowerCase(),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      roleId: role._id,
      managerId: input.managerId ?? null,
      territory: input.territory,
      department: input.department,
      status: input.status,
    });

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'USER_PROVISIONED',
      entityType: 'USER',
      entityId: created._id,
      afterSnapshot: {
        employeeCode,
        email: created.email,
        roleCode: role.code,
      },
      ipAddress: req.ip ?? null,
    });

    return sendSuccess(
      res,
      {
        user: {
          id: String(created._id),
          employeeCode: created.employeeCode,
          email: created.email,
          fullName: `${created.firstName} ${created.lastName}`.trim(),
          roleCode: role.code,
          status: created.status,
        },
      },
      201,
    );
  }),
);

// Secure Invitation-Based Onboarding (Single-Use, Time-Limited, Hashed Token)
adminRouter.post(
  '/users/invite',
  requirePermissions(PERMISSIONS.USERS_MANAGE),
  validateBody(inviteUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const input = req.body as InviteUserInput;

    const existing = await UserModel.findOne({
      email: input.email.toLowerCase(),
    }).lean();
    if (existing) {
      throw ApiError.conflict(
        'A user with this work email already exists in the directory',
      );
    }

    const role = await RoleModel.findOne({ code: input.roleCode }).lean();
    if (!role) {
      throw ApiError.badRequest('Specified role does not exist');
    }

    const employeeCode = generateEntityCode('OPT');
    // Unmatchable random secret hash until user sets password via invitation link
    const lockedPlaceholderHash = await hashPassword(generateSecureToken(48));
    const rawToken = generateSecureToken(32);
    const invitationTokenHash = sha256Hex(rawToken);
    const now = new Date();
    const invitationExpiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const created = await UserModel.create({
      employeeCode,
      email: input.email.toLowerCase(),
      passwordHash: lockedPlaceholderHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      roleId: role._id,
      managerId: input.managerId ?? null,
      territory: input.territory,
      department: input.department,
      status: USER_STATUS.PENDING,
      invitationTokenHash,
      invitationExpiresAt,
      invitedBy: actor.userId,
      invitedAt: now,
    });

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'USER_INVITED',
      entityType: 'USER',
      entityId: created._id,
      afterSnapshot: {
        employeeCode,
        email: created.email,
        roleCode: role.code,
        status: USER_STATUS.PENDING,
        expiresAt: invitationExpiresAt.toISOString(),
      },
      ipAddress: req.ip ?? null,
    });

    const invitePath = `/invite?token=${encodeURIComponent(rawToken)}`;
    const fullName = `${created.firstName} ${created.lastName}`.trim();
    const emailDelivery = await sendInvitationEmail({
      to: created.email,
      fullName,
      roleName: role.name,
      invitePath,
      expiresAt: invitationExpiresAt,
    });

    return sendSuccess(
      res,
      {
        user: {
          id: String(created._id),
          employeeCode: created.employeeCode,
          email: created.email,
          fullName,
          roleCode: role.code,
          status: created.status,
          invitedAt: now,
          expiresAt: invitationExpiresAt,
        },
        invitePath,
        emailDelivery,
      },
      201,
    );
  }),
);

adminRouter.post(
  '/users/:id/resend-invite',
  requirePermissions(PERMISSIONS.USERS_MANAGE),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const userId = paramId(req.params.id);

    const user = await UserModel.findOne({ _id: userId, deletedAt: null });
    if (!user) {
      throw ApiError.notFound('User account not found');
    }
    if (user.status !== USER_STATUS.PENDING) {
      throw ApiError.unprocessable(
        'Only accounts in PENDING status can receive a new activation link',
      );
    }

    const rawToken = generateSecureToken(32);
    const now = new Date();
    const invitationExpiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    user.invitationTokenHash = sha256Hex(rawToken);
    user.invitationExpiresAt = invitationExpiresAt;
    user.invitedBy = actor.userId;
    user.invitedAt = now;
    await user.save();

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'USER_INVITE_RESENT',
      entityType: 'USER',
      entityId: user._id,
      afterSnapshot: {
        email: user.email,
        expiresAt: invitationExpiresAt.toISOString(),
      },
      ipAddress: req.ip ?? null,
    });

    const invitePath = `/invite?token=${encodeURIComponent(rawToken)}`;
    const roleDoc = await RoleModel.findById(user.roleId).lean();
    const emailDelivery = await sendInvitationEmail({
      to: user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      roleName: roleDoc?.name ?? 'Team Member',
      invitePath,
      expiresAt: invitationExpiresAt,
    });

    return sendSuccess(res, {
      invitePath,
      expiresAt: invitationExpiresAt,
      emailDelivery,
    });
  }),
);

adminRouter.patch(
  '/users/:id',
  requirePermissions(PERMISSIONS.USERS_MANAGE),
  validateParams(idParamSchema),
  validateBody(updateUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const userId = paramId(req.params.id);
    const input = req.body as UpdateUserInput;

    const user = await UserModel.findOne({ _id: userId, deletedAt: null });
    if (!user) {
      throw ApiError.notFound('User account not found');
    }

    if (input.firstName !== undefined) user.firstName = input.firstName;
    if (input.lastName !== undefined) user.lastName = input.lastName;
    if (input.phone !== undefined) user.phone = input.phone;
    if (input.territory !== undefined) user.territory = input.territory;
    if (input.department !== undefined) user.department = input.department;
    if (input.managerId !== undefined) {
      user.managerId = (input.managerId as unknown as Types.ObjectId) ?? null;
    }
    if (input.roleCode !== undefined) {
      const role = await RoleModel.findOne({ code: input.roleCode }).lean();
      if (!role) throw ApiError.badRequest('Invalid role code');
      user.roleId = role._id;
      user.tokenVersion += 1;
    }
    if (input.status !== undefined) {
      user.status = input.status;
      if (input.status !== USER_STATUS.ACTIVE) {
        user.tokenVersion += 1;
      }
    }
    if (input.password) {
      user.passwordHash = await hashPassword(input.password);
      user.tokenVersion += 1;
    }

    await user.save();

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: user._id,
      ipAddress: req.ip ?? null,
    });

    return sendSuccess(res, {
      user: {
        id: String(user._id),
        employeeCode: user.employeeCode,
        email: user.email,
        status: user.status,
      },
    });
  }),
);

// Deactivate Employee & Reallocate Territory (Matches Stitch Screen #17 Modal 4)
adminRouter.post(
  '/users/:id/deactivate',
  requirePermissions(PERMISSIONS.USERS_MANAGE),
  validateParams(idParamSchema),
  validateBody(deactivateUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const userId = paramId(req.params.id);
    const input = req.body as DeactivateUserInput;

    if (String(actor.userId) === userId) {
      throw ApiError.unprocessable('You cannot deactivate your own active Admin account');
    }

    const user = await UserModel.findOne({ _id: userId, deletedAt: null });
    if (!user) {
      throw ApiError.notFound('User account not found');
    }

    await withTransaction(async (session) => {
      user.status = USER_STATUS.INACTIVE;
      user.tokenVersion += 1;
      user.deactivatedAt = new Date();
      user.deactivationReason = input.reason;
      await user.save(session ? { session } : undefined);

      if (input.reassignMeetingsToUserId) {
        await MeetingModel.updateMany(
          {
            assignedRepId: user._id,
            isDeleted: false,
            status: { $nin: [MEETING_STATUS.COMPLETED, MEETING_STATUS.CANCELLED] },
          },
          { $set: { assignedRepId: input.reassignMeetingsToUserId } },
          session ? { session } : undefined,
        );
      }

      if (input.reassignFollowUpsToUserId) {
        await FollowUpTaskModel.updateMany(
          {
            ownerId: user._id,
            isDeleted: false,
            status: { $ne: FOLLOW_UP_STATUS.COMPLETED },
          },
          { $set: { ownerId: input.reassignFollowUpsToUserId } },
          session ? { session } : undefined,
        );
      }

      await writeAuditLog({
        actorId: actor.userId,
        actorRole: actor.roleCode,
        action: 'USER_DEACTIVATED',
        entityType: 'USER',
        entityId: user._id,
        reason: input.reason,
        afterSnapshot: {
          status: USER_STATUS.INACTIVE,
          reassignedMeetingsTo: input.reassignMeetingsToUserId ?? null,
          reassignedFollowUpsTo: input.reassignFollowUpsToUserId ?? null,
        },
        ipAddress: req.ip ?? null,
        session,
      });
    });

    return sendSuccess(res, {
      user: {
        id: String(user._id),
        status: USER_STATUS.INACTIVE,
      },
    });
  }),
);

// 3. Roles & Permissions Management
adminRouter.get(
  '/roles',
  requirePermissions(PERMISSIONS.ROLES_MANAGE),
  asyncHandler(async (_req: Request, res: Response) => {
    const [roles, permissions] = await Promise.all([
      RoleModel.find().sort({ tier: 1 }).lean(),
      PermissionModel.find().sort({ module: 1, key: 1 }).lean(),
    ]);

    const permMap = new Map(permissions.map((p) => [String(p._id), p.key]));

    return sendSuccess(res, {
      roles: roles.map((r) => ({
        id: String(r._id),
        code: r.code,
        name: r.name,
        description: r.description,
        tier: r.tier,
        isSystem: r.isSystem,
        permissionKeys: r.permissionIds
          .map((pid) => permMap.get(String(pid)))
          .filter((k): k is string => Boolean(k)),
      })),
      permissions: permissions.map((p) => ({
        id: String(p._id),
        key: p.key,
        module: p.module,
        description: p.description,
        isElevated: p.isElevated,
      })),
    });
  }),
);

adminRouter.patch(
  '/roles/:id',
  requirePermissions(PERMISSIONS.ROLES_MANAGE),
  validateParams(idParamSchema),
  validateBody(updateRolePermissionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const roleId = paramId(req.params.id);
    const input = req.body as UpdateRolePermissionsInput;

    const role = await RoleModel.findById(roleId);
    if (!role) {
      throw ApiError.notFound('Role not found');
    }

    const permDocs = await PermissionModel.find({
      key: { $in: input.permissionKeys },
    }).lean();

    role.permissionIds = permDocs.map((p) => p._id);
    if (input.description !== undefined) {
      role.description = input.description;
    }
    await role.save();

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'ROLE_PERMISSIONS_UPDATED',
      entityType: 'ROLE',
      entityId: role._id,
      afterSnapshot: {
        roleCode: role.code,
        permissionCount: role.permissionIds.length,
      },
      ipAddress: req.ip ?? null,
    });

    return sendSuccess(res, {
      role: {
        id: String(role._id),
        code: role.code,
        permissionKeys: permDocs.map((p) => p.key),
      },
    });
  }),
);

// 4. Cryptographic Audit Logs
adminRouter.get(
  '/audit-logs',
  requirePermissions(PERMISSIONS.AUDIT_READ),
  validateQuery(auditLogQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as AuditLogQuery;

    const filter: Record<string, unknown> = {};
    if (query.actorId) filter.actorId = query.actorId;
    if (query.entityType) filter.entityType = query.entityType.toUpperCase();
    if (query.entityId) filter.entityId = query.entityId;
    if (query.action) filter.action = query.action.toUpperCase();
    if (query.fromDate || query.toDate) {
      const range: Record<string, Date> = {};
      if (query.fromDate) range.$gte = query.fromDate;
      if (query.toDate) range.$lte = query.toDate;
      filter.createdAt = range;
    }
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ auditCode: regex }, { action: regex }, { reason: regex }];
    }

    const skip = (query.page - 1) * query.limit;
    const [total, docs, chainIntegrity] = await Promise.all([
      AuditLogModel.countDocuments(filter),
      AuditLogModel.find(filter)
        .populate('actorId', 'firstName lastName email employeeCode')
        .sort({ _id: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      verifyAuditChainIntegrity(),
    ]);

    const auditLogs = docs.map((a) => {
      const act = a.actorId as unknown as {
        firstName: string;
        lastName: string;
        email: string;
        employeeCode: string;
      } | null;

      return {
        id: String(a._id),
        auditCode: a.auditCode,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId ?? null,
        actorRole: a.actorRole ?? 'SYSTEM',
        actorName: act
          ? `${act.firstName} ${act.lastName} (${act.employeeCode})`
          : 'System / Unauthenticated',
        reason: a.reason ?? null,
        ipAddress: a.ipAddress ?? null,
        previousHash: a.previousHash ?? 'GENESIS',
        integrityHash: a.integrityHash,
        createdAt: a.createdAt,
      };
    });

    return sendSuccess(
      res,
      { auditLogs, chainIntegrity },
      200,
      buildPaginationMeta(total, query.page, query.limit),
    );
  }),
);

// 5. System & Geofence Governance Settings
adminRouter.get(
  '/settings',
  requirePermissions(PERMISSIONS.SETTINGS_MANAGE),
  asyncHandler(async (_req: Request, res: Response) => {
    const settings = await SystemSettingModel.findOneAndUpdate(
      { singletonKey: 'DEFAULT' },
      { $setOnInsert: { singletonKey: 'DEFAULT' } },
      { upsert: true, new: true },
    ).lean();
    return sendSuccess(res, { settings });
  }),
);

adminRouter.patch(
  '/settings',
  requirePermissions(PERMISSIONS.SETTINGS_MANAGE),
  validateBody(updateSystemSettingsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const patch = req.body as UpdateSystemSettingsInput;

    const updated = await SystemSettingModel.findOneAndUpdate(
      { singletonKey: 'DEFAULT' },
      {
        $set: {
          ...patch,
          updatedBy: actor.userId,
        },
      },
      { upsert: true, new: true },
    ).lean();

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'SETTINGS_UPDATED',
      entityType: 'SYSTEM_SETTING',
      entityId: String(updated?._id),
      afterSnapshot: patch as Record<string, unknown>,
      ipAddress: req.ip ?? null,
    });

    publishRealtimeEvent({
      event: 'SETTINGS_UPDATED',
      actorId: String(actor.userId),
      title: 'Organization settings updated',
    });

    return sendSuccess(res, { settings: updated });
  }),
);
