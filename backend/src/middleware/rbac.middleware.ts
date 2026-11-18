import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Types } from 'mongoose';
import {
  ROLE_CODES,
  type PermissionKey,
  type RoleCode,
} from '../shared/index.js';
import { ApiError } from '../common/ApiError.js';
import { UserModel } from '../models/User.model.js';
import { getAuthActor, type AuthenticatedActor } from './auth.middleware.js';

export function requireRoles(...allowedRoles: RoleCode[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const actor = getAuthActor(req);
    if (!allowedRoles.includes(actor.roleCode)) {
      next(
        ApiError.forbidden(
          `Role ${actor.roleCode} is not authorized for this resource`,
        ),
      );
      return;
    }
    next();
  };
}

export function requirePermissions(
  ...requiredPermissions: PermissionKey[]
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const actor = getAuthActor(req);
    for (const perm of requiredPermissions) {
      if (!actor.permissions.has(perm)) {
        next(
          ApiError.forbidden(
            `Missing required permission: ${perm}`,
            'INSUFFICIENT_PERMISSIONS',
          ),
        );
        return;
      }
    }
    next();
  };
}

export type AccessScopeResult =
  | { scope: 'ALL'; allowedUserIds: null }
  | { scope: 'TEAM' | 'SELF'; allowedUserIds: Types.ObjectId[] };

/**
 * Resolves the object-level authorization scope for a user:
 * - ADMIN: Full organization visibility
 * - SALES_MANAGER: Self + all direct reports (`managerId === actor.userId`)
 * - SALES_EMPLOYEE: Strictly self (`actor.userId`)
 */
export async function resolveAuthorizedUserScope(
  actor: AuthenticatedActor,
): Promise<AccessScopeResult> {
  if (actor.roleCode === ROLE_CODES.ADMIN) {
    return { scope: 'ALL', allowedUserIds: null };
  }

  if (actor.roleCode === ROLE_CODES.SALES_MANAGER) {
    const teamMembers = await UserModel.find(
      { managerId: actor.userId, deletedAt: null },
      { _id: 1 },
    ).lean();

    const ids: Types.ObjectId[] = [
      actor.userId,
      ...teamMembers.map((m) => m._id),
    ];
    return { scope: 'TEAM', allowedUserIds: ids };
  }

  return { scope: 'SELF', allowedUserIds: [actor.userId] };
}

/**
 * Centralized anti-IDOR guard ensuring employees cannot access unauthorized
 * employee records and managers only access authorized team records.
 */
export async function assertCanAccessUserScopedRecord(
  actor: AuthenticatedActor,
  ownerId: Types.ObjectId | string,
  coHostIds: ReadonlyArray<Types.ObjectId | string> = [],
): Promise<void> {
  if (actor.roleCode === ROLE_CODES.ADMIN) {
    return;
  }

  const targetOwnerStr = String(ownerId);
  const actorIdStr = String(actor.userId);

  if (targetOwnerStr === actorIdStr) {
    return;
  }

  if (coHostIds.some((id) => String(id) === actorIdStr)) {
    return;
  }

  if (actor.roleCode === ROLE_CODES.SALES_MANAGER) {
    const scope = await resolveAuthorizedUserScope(actor);
    const allowedSet = new Set(scope.allowedUserIds?.map((id) => String(id)));
    if (allowedSet.has(targetOwnerStr)) {
      return;
    }
    throw ApiError.forbidden(
      'Sales Manager cannot access records outside their authorized team',
      'TEAM_SCOPE_VIOLATION',
    );
  }

  throw ApiError.forbidden(
    'Sales Employee cannot access another employee’s record',
    'OWNERSHIP_VIOLATION',
  );
}
