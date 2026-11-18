import { z } from 'zod';
import { CUSTOMER_STATUS, CUSTOMER_TIER } from '../constants/meeting-lifecycle';
import {
  gpsCoordinatesSchema,
  objectIdSchema,
  paginationQuerySchema,
  phoneNumberSchema,
} from './common.schema';

export const contactInputSchema = z.object({
  fullName: z.string().trim().min(2, 'Contact name is required').max(120),
  designation: z.string().trim().max(120).optional(),
  email: z.string().trim().email('Enter a valid email address').toLowerCase(),
  phone: phoneNumberSchema,
  department: z.string().trim().max(100).optional(),
  isPrimary: z.boolean().optional().default(false),
  notes: z.string().trim().max(1000).optional(),
});

export type ContactInput = z.infer<typeof contactInputSchema>;

export const customerAddressSchema = z.object({
  street: z.string().trim().min(2).max(240),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(24).optional(),
  country: z.string().trim().max(80).default('India'),
  coordinates: gpsCoordinatesSchema.optional(),
  geofenceRadiusMeters: z.number().int().min(25).max(5000).default(100),
});

export const createCustomerSchema = z.object({
  companyName: z.string().trim().min(2).max(180),
  website: z.string().trim().max(200).optional(),
  industry: z.string().trim().min(2).max(100),
  tier: z
    .enum([
      CUSTOMER_TIER.ENTERPRISE_T1,
      CUSTOMER_TIER.MID_MARKET,
      CUSTOMER_TIER.SMB,
      CUSTOMER_TIER.GOV,
    ])
    .default(CUSTOMER_TIER.ENTERPRISE_T1),
  annualRevenue: z.number().min(0).optional(),
  status: z
    .enum([
      CUSTOMER_STATUS.ACTIVE,
      CUSTOMER_STATUS.PROSPECT,
      CUSTOMER_STATUS.AT_RISK,
    ])
    .default(CUSTOMER_STATUS.ACTIVE),
  address: customerAddressSchema,
  assignedRepId: objectIdSchema.optional(),
  primaryContact: contactInputSchema,
  strategicNotes: z.string().trim().max(3000).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema
  .omit({ primaryContact: true })
  .partial()
  .extend({
    primaryContact: contactInputSchema.partial().optional(),
  });

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const archiveCustomerSchema = z.object({
  reason: z.string().trim().min(5, 'Archive justification is required').max(500),
});

export type ArchiveCustomerInput = z.infer<typeof archiveCustomerSchema>;

export const customerListQuerySchema = paginationQuerySchema.extend({
  industry: z.string().trim().optional(),
  tier: z
    .enum([
      CUSTOMER_TIER.ENTERPRISE_T1,
      CUSTOMER_TIER.MID_MARKET,
      CUSTOMER_TIER.SMB,
      CUSTOMER_TIER.GOV,
    ])
    .optional(),
  status: z
    .enum([
      CUSTOMER_STATUS.ACTIVE,
      CUSTOMER_STATUS.PROSPECT,
      CUSTOMER_STATUS.AT_RISK,
      CUSTOMER_STATUS.ARCHIVED,
    ])
    .optional(),
  assignedRepId: objectIdSchema.optional(),
  includeArchived: z.coerce.boolean().optional().default(false),
});

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
