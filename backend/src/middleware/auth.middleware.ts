import type { NextFunction, Request, Response } from 'express';
import type { Types } from 'mongoose';
import {
  USER_STATUS,
  type PermissionKey,
  type RoleCode,
} from '../shared/index.js';
import { ApiError } from '../common/ApiError.js';
import { ACCESS_COOKIE_NAME, verifyAccessToken } from '../common/crypto.js';
import { PermissionModel } from '../models/Permission.model.js';
import { RoleModel } from '../models/Role.model.js';
import { UserModel } from '../models/User.model.js';

export interface AuthenticatedActor {
  userId: Types.ObjectId;
  employeeCode: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  roleId: Types.ObjectId;
  roleCode: RoleCode;
  roleName: string;
  permissions: Set<PermissionKey>;
  managerId: Types.ObjectId | null;
  territory?: string;
  department?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedActor;
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    let token: string | undefined = req.cookies?.[ACCESS_COOKIE_NAME];

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }

    if (!token) {
      throw ApiError.unauthorized('Authentication session cookie missing');
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      throw ApiError.unauthorized('Session expired or invalid token', 'TOKEN_EXPIRED');
    }

    if (decoded.type !== 'access') {
      throw ApiError.unauthorized('Invalid token type');
    }

    const user = await UserModel.findById(decoded.sub).lean();
    if (!user || user.deletedAt || user.status !== USER_STATUS.ACTIVE) {
      throw ApiError.unauthorized('User account is inactive or unavailable');
    }

    if (user.tokenVersion !== decoded.tv) {
      throw ApiError.unauthorized(
        'Session has been invalidated. Please sign in again.',
        'SESSION_REVOKED',
      );
    }

    const role = await RoleModel.findById(user.roleId).lean();
    if (!role) {
      throw ApiError.forbidden('Assigned security role no longer exists');
    }

    const permissionDocs = await PermissionModel.find(
      { _id: { $in: role.permissionIds } },
      { key: 1 },
    ).lean();

    const permissionSet = new Set<PermissionKey>(
      permissionDocs.map((p) => p.key as PermissionKey),
    );

    req.auth = {
      userId: user._id,
      employeeCode: user.employeeCode,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      roleId: role._id,
      roleCode: role.code,
      roleName: role.name,
      permissions: permissionSet,
      managerId: user.managerId ?? null,
      territory: user.territory,
      department: user.department,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function getAuthActor(req: Request): AuthenticatedActor {
  if (!req.auth) {
    throw ApiError.unauthorized();
  }
  return req.auth;
}
