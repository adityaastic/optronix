import { z } from 'zod';
import { optionalPhoneNumberSchema } from './common.schema';

export const loginSchema = z.object({
  email: z.string().trim().email('Valid corporate email is required').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  rememberWorkstation: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Valid corporate email is required').toLowerCase(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const passwordPolicySchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16, 'Valid reset token is required'),
    newPassword: passwordPolicySchema,
    confirmPassword: z.string(),
    invalidateRemoteSessions: z.boolean().optional().default(true),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordPolicySchema,
    confirmPassword: z.string(),
    invalidateRemoteSessions: z.boolean().optional().default(false),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const verifyInvitationQuerySchema = z.object({
  token: z.string().trim().min(24, 'Valid invitation token is required').max(256),
});

export type VerifyInvitationQuery = z.infer<typeof verifyInvitationQuerySchema>;

export const acceptInvitationSchema = z
  .object({
    token: z.string().trim().min(24, 'Valid invitation token is required').max(256),
    password: passwordPolicySchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    phone: optionalPhoneNumberSchema,
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  phone: optionalPhoneNumberSchema,
  avatarUrl: z.string().trim().max(500).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
