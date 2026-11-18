import { z } from 'zod';

export const ROLE_CODES = {
  SALES_EMPLOYEE: 'SALES_EMPLOYEE',
  SALES_MANAGER: 'SALES_MANAGER',
  ADMIN: 'ADMIN',
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

export const PERMISSIONS = {
  CUSTOMERS_READ: 'customers:read',
  CUSTOMERS_CREATE: 'customers:create',
  CUSTOMERS_UPDATE: 'customers:update',
  CUSTOMERS_ARCHIVE: 'customers:archive',
  MEETINGS_READ: 'meetings:read',
  MEETINGS_CREATE: 'meetings:create',
  MEETINGS_UPDATE: 'meetings:update',
  MEETINGS_VISIT: 'meetings:visit',
  MEETINGS_OUTCOME: 'meetings:outcome',
  MEETINGS_REOPEN: 'meetings:reopen',
  MEETINGS_REASSIGN: 'meetings:reassign',
  FOLLOWUPS_READ: 'followups:read',
  FOLLOWUPS_CREATE: 'followups:create',
  FOLLOWUPS_UPDATE: 'followups:update',
  FOLLOWUPS_REASSIGN: 'followups:reassign',
  TEAM_READ: 'team:read',
  REPORTS_PERSONAL: 'reports:personal',
  REPORTS_TEAM: 'reports:team',
  REPORTS_ORG: 'reports:org',
  USERS_MANAGE: 'users:manage',
  ROLES_MANAGE: 'roles:manage',
  SETTINGS_MANAGE: 'settings:manage',
  AUDIT_READ: 'audit:read',
} as const;

export const MEETING_STATUS = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  IN_PROGRESS: 'IN_PROGRESS',
  PAUSED: 'PAUSED',
  AWAITING_OUTCOME: 'AWAITING_OUTCOME',
  COMPLETED: 'COMPLETED',
  RESCHEDULED: 'RESCHEDULED',
  CANCELLED: 'CANCELLED',
  REOPENED: 'REOPENED',
} as const;

export const VISIT_SESSION_STATUS = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  ABORTED: 'ABORTED',
} as const;

export const MEETING_TYPE = {
  IN_PERSON: 'IN_PERSON',
  VIRTUAL: 'VIRTUAL',
  PHONE: 'PHONE',
} as const;

export const OUTCOME_TYPE = {
  INTERESTED: 'INTERESTED',
  PROPOSAL_REQUESTED: 'PROPOSAL_REQUESTED',
  FOLLOW_UP_REQUIRED: 'FOLLOW_UP_REQUIRED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  UNABLE_TO_MEET: 'UNABLE_TO_MEET',
} as const;

export type OutcomeType = (typeof OUTCOME_TYPE)[keyof typeof OUTCOME_TYPE];

export const FOLLOW_UP_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  OVERDUE: 'OVERDUE',
} as const;

export const PRIORITY_LEVEL = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type PriorityLevel = (typeof PRIORITY_LEVEL)[keyof typeof PRIORITY_LEVEL];

export const PHONE_REGEX = /^\+?[0-9][0-9\s().-]{6,22}$/;

export const phoneNumberSchema = z
  .string()
  .trim()
  .min(7, 'Phone number is required')
  .max(24, 'Phone number is too long')
  .regex(PHONE_REGEX, 'Enter a valid phone number (e.g. +91 98100 00000)');

export const optionalPhoneSchema = z
  .string()
  .trim()
  .max(24)
  .refine((v) => v === '' || PHONE_REGEX.test(v), {
    message: 'Enter a valid phone number',
  })
  .optional();

export const passwordPolicySchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Z]/, 'Include at least one uppercase letter')
  .regex(/[a-z]/, 'Include at least one lowercase letter')
  .regex(/[0-9]/, 'Include at least one number')
  .regex(/[^A-Za-z0-9]/, 'Include at least one special character');

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid work email').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const acceptInviteSchema = z
  .object({
    token: z.string().trim().min(24, 'Enter a valid invitation token'),
    password: passwordPolicySchema,
    confirmPassword: z.string().min(1, 'Confirm your password'),
    phone: optionalPhoneSchema,
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const createCustomerFormSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name is required'),
  industry: z.string().trim().min(2, 'Industry is required'),
  tier: z.enum(['ENTERPRISE_T1', 'MID_MARKET', 'SMB', 'GOV']),
  street: z.string().trim().min(2, 'Street address is required'),
  city: z.string().trim().min(2, 'City is required'),
  geofenceRadiusMeters: z.coerce.number().int().min(25).max(5000),
  contactName: z.string().trim().min(2, 'Primary contact name is required'),
  contactEmail: z.string().trim().email('Valid contact email is required'),
  contactPhone: phoneNumberSchema,
  strategicNotes: z.string().trim().max(2000).optional(),
});

/**
 * Haversine distance in meters between two WGS84 coordinates.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function formatDurationClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
}

export function formatDateShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTimeShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTimeShort(iso?: string | null): string {
  if (!iso) return '—';
  return `${formatDateShort(iso)}, ${formatTimeShort(iso)}`;
}
