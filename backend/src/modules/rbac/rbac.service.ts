import type { HydratedDocument, Types } from 'mongoose';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_CODES,
  type PermissionKey,
  type RoleCode,
} from '../../shared/index.js';
import { PermissionModel } from '../../models/Permission.model.js';
import { RoleModel, type IRole } from '../../models/Role.model.js';
import { SystemSettingModel } from '../../models/SystemSetting.model.js';

const PERMISSION_METADATA: Record<
  PermissionKey,
  { module: string; description: string; isElevated?: boolean }
> = {
  [PERMISSIONS.CUSTOMERS_READ]: {
    module: 'customers',
    description: 'View assigned or authorized customer accounts and contacts',
  },
  [PERMISSIONS.CUSTOMERS_CREATE]: {
    module: 'customers',
    description: 'Create new customer accounts and primary contacts',
  },
  [PERMISSIONS.CUSTOMERS_UPDATE]: {
    module: 'customers',
    description: 'Edit customer account details and contacts',
  },
  [PERMISSIONS.CUSTOMERS_ARCHIVE]: {
    module: 'customers',
    description: 'Archive customer accounts with justification',
    isElevated: true,
  },
  [PERMISSIONS.CUSTOMERS_DELETE]: {
    module: 'customers',
    description: 'Permanently purge customer accounts',
    isElevated: true,
  },
  [PERMISSIONS.MEETINGS_READ]: {
    module: 'meetings',
    description: 'View authorized sales meetings and visit telemetry',
  },
  [PERMISSIONS.MEETINGS_CREATE]: {
    module: 'meetings',
    description: 'Schedule new customer meetings',
  },
  [PERMISSIONS.MEETINGS_UPDATE]: {
    module: 'meetings',
    description: 'Update eligible scheduled/confirmed meetings',
  },
  [PERMISSIONS.MEETINGS_CONFIRM]: {
    module: 'meetings',
    description: 'Confirm scheduled customer meetings',
  },
  [PERMISSIONS.MEETINGS_CHECKIN]: {
    module: 'meetings',
    description: 'Check in to meetings and start GPS visit sessions',
  },
  [PERMISSIONS.MEETINGS_CHECKOUT]: {
    module: 'meetings',
    description: 'Check out of active visit sessions',
  },
  [PERMISSIONS.MEETINGS_PAUSE_RESUME]: {
    module: 'meetings',
    description: 'Pause and resume active visit sessions',
  },
  [PERMISSIONS.MEETINGS_RESCHEDULE]: {
    module: 'meetings',
    description: 'Reschedule meetings while preserving schedule history',
  },
  [PERMISSIONS.MEETINGS_CANCEL]: {
    module: 'meetings',
    description: 'Cancel scheduled meetings with mandatory reason',
  },
  [PERMISSIONS.MEETINGS_RECORD_OUTCOME]: {
    module: 'meetings',
    description: 'Record meeting outcomes and complete meetings',
  },
  [PERMISSIONS.MEETINGS_REASSIGN]: {
    module: 'meetings',
    description: 'Reassign meetings to another sales representative',
    isElevated: true,
  },
  [PERMISSIONS.MEETINGS_REOPEN]: {
    module: 'meetings',
    description: 'Reopen completed meetings with mandatory audit reason',
    isElevated: true,
  },
  [PERMISSIONS.FOLLOWUPS_READ]: {
    module: 'followups',
    description: 'View authorized follow-up tasks',
  },
  [PERMISSIONS.FOLLOWUPS_CREATE]: {
    module: 'followups',
    description: 'Create follow-up tasks and deliverables',
  },
  [PERMISSIONS.FOLLOWUPS_UPDATE]: {
    module: 'followups',
    description: 'Update follow-up task status, priority, and notes',
  },
  [PERMISSIONS.FOLLOWUPS_COMPLETE]: {
    module: 'followups',
    description: 'Mark follow-up tasks as completed',
  },
  [PERMISSIONS.FOLLOWUPS_REASSIGN]: {
    module: 'followups',
    description: 'Reassign follow-up tasks across team members',
    isElevated: true,
  },
  [PERMISSIONS.TEAM_READ]: {
    module: 'team',
    description: 'View sales team directory, rep dossiers, and activity',
    isElevated: true,
  },
  [PERMISSIONS.TEAM_MONITOR]: {
    module: 'team',
    description: 'Monitor live check-in/check-out telemetry across team',
    isElevated: true,
  },
  [PERMISSIONS.REPORTS_PERSONAL]: {
    module: 'reports',
    description: 'Access personal meeting and visit analytics',
  },
  [PERMISSIONS.REPORTS_TEAM]: {
    module: 'reports',
    description: 'Access team performance and outcome analytics',
    isElevated: true,
  },
  [PERMISSIONS.REPORTS_ORG]: {
    module: 'reports',
    description: 'Access organization-wide analytics and compliance exports',
    isElevated: true,
  },
  [PERMISSIONS.USERS_MANAGE]: {
    module: 'admin',
    description: 'Provision, edit, and deactivate user accounts',
    isElevated: true,
  },
  [PERMISSIONS.ROLES_MANAGE]: {
    module: 'admin',
    description: 'Manage security roles and privilege assignments',
    isElevated: true,
  },
  [PERMISSIONS.PERMISSIONS_MANAGE]: {
    module: 'admin',
    description: 'Manage system permission catalog',
    isElevated: true,
  },
  [PERMISSIONS.AUDIT_READ]: {
    module: 'admin',
    description: 'Inspect immutable cryptographic audit logs',
    isElevated: true,
  },
  [PERMISSIONS.SETTINGS_MANAGE]: {
    module: 'admin',
    description: 'Configure geofencing, SLA, and organization settings',
    isElevated: true,
  },
};

export async function ensureSystemRbacAndSettings() {
  const permKeyToId = new Map<PermissionKey, import('mongoose').Types.ObjectId>();

  for (const key of Object.values(PERMISSIONS)) {
    const meta = PERMISSION_METADATA[key];
    const doc = await PermissionModel.findOneAndUpdate(
      { key },
      {
        $set: {
          module: meta.module,
          description: meta.description,
          isElevated: Boolean(meta.isElevated),
        },
      },
      { upsert: true, new: true },
    );
    permKeyToId.set(key, doc._id);
  }

  const roleConfigs = [
    {
      code: ROLE_CODES.SALES_EMPLOYEE,
      name: 'Sales Employee',
      description:
        'Field sales representative managing assigned accounts, visits, outcomes, and personal follow-ups.',
      tier: 1,
    },
    {
      code: ROLE_CODES.SALES_MANAGER,
      name: 'Sales Manager',
      description:
        'Regional sales manager overseeing team visits, reassignments, follow-ups, and governed meeting reopenings.',
      tier: 2,
    },
    {
      code: ROLE_CODES.ADMIN,
      name: 'Administrator',
      description:
        'Enterprise administrator with full governance over users, roles, permissions, settings, and audit ledgers.',
      tier: 3,
    },
  ] as const;

  const rolesByCode = new Map<RoleCode, HydratedDocument<IRole>>();

  for (const cfg of roleConfigs) {
    const permIds = DEFAULT_ROLE_PERMISSIONS[cfg.code]
      .map((k) => permKeyToId.get(k))
      .filter((id): id is Types.ObjectId => Boolean(id));

    const roleDoc = await RoleModel.findOneAndUpdate(
      { code: cfg.code },
      {
        $setOnInsert: {
          code: cfg.code,
          isSystem: true,
          permissionIds: permIds,
        },
        $set: {
          name: cfg.name,
          description: cfg.description,
          tier: cfg.tier,
        },
      },
      { upsert: true, new: true },
    );

    if (!roleDoc) {
      throw new Error(`Failed to upsert system role ${cfg.code}`);
    }

    // Ensure system roles always retain at least their default permission set on fresh bootstrap
    if (!roleDoc.permissionIds || roleDoc.permissionIds.length === 0) {
      roleDoc.permissionIds = permIds;
      await roleDoc.save();
    }

    rolesByCode.set(cfg.code, roleDoc);
  }

  await SystemSettingModel.findOneAndUpdate(
    { singletonKey: 'DEFAULT' },
    { $setOnInsert: { singletonKey: 'DEFAULT' } },
    { upsert: true, new: true },
  );

  return { permKeyToId, rolesByCode };
}
