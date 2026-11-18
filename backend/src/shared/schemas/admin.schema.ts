import { z } from 'zod';
import { USER_STATUS } from '../constants/meeting-lifecycle.js';
import { ROLE_CODES } from '../constants/roles.js';
import { passwordPolicySchema } from './auth.schema.js';
import {
  objectIdSchema,
  optionalPhoneNumberSchema,
  paginationQuerySchema,
} from './common.schema.js';

export const createUserSchema = z.object({
  email: z.string().trim().email('Enter a valid work email').toLowerCase(),
  password: passwordPolicySchema,
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  phone: optionalPhoneNumberSchema,
  roleCode: z.enum([
    ROLE_CODES.SALES_EMPLOYEE,
    ROLE_CODES.SALES_MANAGER,
    ROLE_CODES.ADMIN,
  ]),
  managerId: objectIdSchema.optional().nullable(),
  territory: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  status: z
    .enum([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE, USER_STATUS.PENDING])
    .default(USER_STATUS.ACTIVE),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const inviteUserSchema = z.object({
  email: z.string().trim().email('Enter a valid work email').toLowerCase(),
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  phone: optionalPhoneNumberSchema,
  roleCode: z.enum([
    ROLE_CODES.SALES_EMPLOYEE,
    ROLE_CODES.SALES_MANAGER,
    ROLE_CODES.ADMIN,
  ]),
  managerId: objectIdSchema.optional().nullable(),
  territory: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = createUserSchema
  .omit({ password: true })
  .partial()
  .extend({
    password: passwordPolicySchema.optional(),
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const deactivateUserSchema = z.object({
  reason: z.string().trim().min(5, 'Deactivation reason is required').max(500),
  reassignMeetingsToUserId: objectIdSchema.optional(),
  reassignFollowUpsToUserId: objectIdSchema.optional(),
});

export type DeactivateUserInput = z.infer<typeof deactivateUserSchema>;

export const updateRolePermissionsSchema = z.object({
  permissionKeys: z.array(z.string().trim().min(3)).min(1),
  description: z.string().trim().max(500).optional(),
});

export type UpdateRolePermissionsInput = z.infer<
  typeof updateRolePermissionsSchema
>;

export const updateSystemSettingsSchema = z.object({
  organizationName: z.string().trim().min(2).max(160).optional(),
  defaultTimezone: z.string().trim().max(64).optional(),
  defaultCurrency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
  smtpSenderEmail: z
    .string()
    .trim()
    .max(160)
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: 'Enter a valid sender email address',
    })
    .optional(),
  defaultGeofenceRadiusMeters: z.number().int().min(25).max(5000).optional(),
  enforceGeofenceOnCheckIn: z.boolean().optional(),
  allowGeofenceOverrideWithReason: z.boolean().optional(),
  checkInBufferMinutes: z.number().int().min(0).max(240).optional(),
  minimumVisitDurationMinutes: z.number().int().min(0).max(480).optional(),
  requireManagerPinOnReopen: z.boolean().optional(),
  followUpReminderHoursBefore: z.number().int().min(1).max(168).optional(),
  enableSlaEscalationAlerts: z.boolean().optional(),
});

export type UpdateSystemSettingsInput = z.infer<
  typeof updateSystemSettingsSchema
>;

export const auditLogQuerySchema = paginationQuerySchema.extend({
  actorId: objectIdSchema.optional(),
  entityType: z.string().trim().max(64).optional(),
  entityId: objectIdSchema.optional(),
  action: z.string().trim().max(80).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
