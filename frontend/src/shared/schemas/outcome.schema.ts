import { z } from 'zod';
import { OUTCOME_TYPE, PRIORITY_LEVEL } from '../constants/meeting-lifecycle';
import { objectIdSchema } from './common.schema';

export const inlineFollowUpTaskSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  ownerId: objectIdSchema,
  dueDate: z.coerce.date(),
  priority: z
    .enum([
      PRIORITY_LEVEL.LOW,
      PRIORITY_LEVEL.MEDIUM,
      PRIORITY_LEVEL.HIGH,
      PRIORITY_LEVEL.CRITICAL,
    ])
    .default(PRIORITY_LEVEL.HIGH),
});

export type InlineFollowUpTaskInput = z.infer<typeof inlineFollowUpTaskSchema>;

export const commercialSpecsSchema = z.object({
  estimatedValue: z.number().min(0).optional(),
  currency: z.string().trim().max(8).default('USD'),
  targetCloseDate: z.coerce.date().optional(),
  productsDiscussed: z.array(z.string().trim().max(100)).max(20).optional().default([]),
});

export const recordMeetingOutcomeSchema = z
  .object({
    outcomeType: z.enum([
      OUTCOME_TYPE.INTERESTED,
      OUTCOME_TYPE.PROPOSAL_REQUESTED,
      OUTCOME_TYPE.FOLLOW_UP_REQUIRED,
      OUTCOME_TYPE.NOT_INTERESTED,
      OUTCOME_TYPE.UNABLE_TO_MEET,
    ]),
    summary: z.string().trim().min(5, 'Meeting summary is required').max(4000),
    minutes: z.string().trim().max(10000).optional(),
    clientFeedback: z.string().trim().max(3000).optional(),
    commercialSpecs: commercialSpecsSchema.optional(),
    disqualificationReason: z.string().trim().max(1000).optional(),
    competitorNotes: z.string().trim().max(2000).optional(),
    followUpTasks: z.array(inlineFollowUpTaskSchema).max(15).optional().default([]),
    completeAndLock: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    // Business Rule #6: Follow-up Required demands an owner and due date
    if (
      data.outcomeType === OUTCOME_TYPE.FOLLOW_UP_REQUIRED &&
      (!data.followUpTasks || data.followUpTasks.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Outcome "Follow-up Required" requires at least one follow-up task with an assigned owner and due date.',
        path: ['followUpTasks'],
      });
    }
  });

export type RecordMeetingOutcomeInput = z.infer<typeof recordMeetingOutcomeSchema>;
