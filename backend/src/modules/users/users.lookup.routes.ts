import { Router, type Request, type Response } from 'express';
import { USER_STATUS } from '../../shared/index.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { sendSuccess } from '../../common/response.js';
import { authenticate, getAuthActor } from '../../middleware/auth.middleware.js';
import { resolveAuthorizedUserScope } from '../../middleware/rbac.middleware.js';
import { RoleModel } from '../../models/Role.model.js';
import { UserModel } from '../../models/User.model.js';

export const usersLookupRouter: Router = Router();

usersLookupRouter.get(
  '/assignable',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const scope = await resolveAuthorizedUserScope(actor);

    const filter: Record<string, unknown> = {
      deletedAt: null,
      status: USER_STATUS.ACTIVE,
    };
    if (scope.allowedUserIds !== null) {
      filter._id = { $in: scope.allowedUserIds };
    }

    const users = await UserModel.find(filter)
      .sort({ firstName: 1, lastName: 1 })
      .lean();
    const roleIds = [...new Set(users.map((u) => String(u.roleId)))];
    const roles = await RoleModel.find({ _id: { $in: roleIds } }).lean();
    const roleMap = new Map(roles.map((r) => [String(r._id), r]));

    const items = users.map((u) => {
      const r = roleMap.get(String(u.roleId));
      return {
        id: String(u._id),
        employeeCode: u.employeeCode,
        fullName: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        territory: u.territory ?? null,
        department: u.department ?? null,
        roleCode: r?.code ?? 'SALES_EMPLOYEE',
        roleName: r?.name ?? 'Sales Employee',
      };
    });

    return sendSuccess(res, { users: items });
  }),
);
