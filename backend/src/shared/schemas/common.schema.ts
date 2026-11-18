import { z } from 'zod';

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

export const phoneNumberSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[0-9()\-\s.]{7,28}$/,
    'Enter a valid phone number (7–28 digits, e.g. +91 98100 41900)',
  );

export const optionalPhoneNumberSchema = z
  .union([phoneNumberSchema, z.literal('')])
  .optional()
  .transform((v) => (v === '' ? undefined : v));

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sortBy: z.string().trim().max(64).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const gpsCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(1000000).optional(),
});

export type GpsCoordinatesInput = z.infer<typeof gpsCoordinatesSchema>;

export interface ApiSuccessResponse<T, M = Record<string, unknown>> {
  success: true;
  data: T;
  meta?: M;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T, M = Record<string, unknown>> =
  | ApiSuccessResponse<T, M>
  | ApiErrorResponse;
