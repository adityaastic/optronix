import { z } from 'zod';
import { FOLLOW_UP_STATUS, PRIORITY_LEVEL } from '../constants/meeting-lifecycle.js';
import { objectIdSchema, paginationQuerySchema } from './common.schema.js';

export const createFollowUpSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(3000).optional(),
  customerId: objectIdSchema,
  meetingId: objectIdSchema.optional(),
  ownerId: objectIdSchema,
  dueDate: z.coerce.date(),
  priority: z
    .enum([
      PRIORITY_LEVEL.LOW,
      PRIORITY_LEVEL.MEDIUM,
      PRIORITY_LEVEL.HIGH,
      PRIORITY_LEVEL.CRITICAL,
    ])
    .default(PRIORITY_LEVEL.MEDIUM),
});

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

export const updateFollowUpSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(3000).optional(),
  dueDate: z.coerce.date().optional(),
  priority: z
    .enum([
      PRIORITY_LEVEL.LOW,
      PRIORITY_LEVEL.MEDIUM,
      PRIORITY_LEVEL.HIGH,
      PRIORITY_LEVEL.CRITICAL,
    ])
    .optional(),
  status: z
    .enum([
      FOLLOW_UP_STATUS.PENDING,
      FOLLOW_UP_STATUS.IN_PROGRESS,
      FOLLOW_UP_STATUS.OVERDUE,
      FOLLOW_UP_STATUS.COMPLETED,
      FOLLOW_UP_STATUS.CANCELLED,
    ])
    .optional(),
});

export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>;

export const addFollowUpCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const reassignFollowUpSchema = z.object({
  newOwnerId: objectIdSchema,
  reason: z.string().trim().min(3).max(500).optional(),
});

export type ReassignFollowUpInput = z.infer<typeof reassignFollowUpSchema>;

export const followUpListQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum([
      FOLLOW_UP_STATUS.PENDING,
      FOLLOW_UP_STATUS.IN_PROGRESS,
      FOLLOW_UP_STATUS.OVERDUE,
      FOLLOW_UP_STATUS.COMPLETED,
      FOLLOW_UP_STATUS.CANCELLED,
    ])
    .optional(),
  priority: z
    .enum([
      PRIORITY_LEVEL.LOW,
      PRIORITY_LEVEL.MEDIUM,
      PRIORITY_LEVEL.HIGH,
      PRIORITY_LEVEL.CRITICAL,
    ])
    .optional(),
  ownerId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  meetingId: objectIdSchema.optional(),
  dueBefore: z.coerce.date().optional(),
  dueAfter: z.coerce.date().optional(),
});

export type FollowUpListQuery = z.infer<typeof followUpListQuerySchema>;
