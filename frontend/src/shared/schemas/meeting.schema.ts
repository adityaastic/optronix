import { z } from 'zod';
import {
  MEETING_STATUS,
  MEETING_TYPE,
  OUTCOME_TYPE,
  PRIORITY_LEVEL,
} from '../constants/meeting-lifecycle';
import { gpsCoordinatesSchema, objectIdSchema, paginationQuerySchema } from './common.schema';

export const createMeetingSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    purpose: z.string().trim().min(2).max(120),
    customerId: objectIdSchema,
    contactId: objectIdSchema.optional(),
    assignedRepId: objectIdSchema.optional(),
    coHostIds: z.array(objectIdSchema).max(10).optional().default([]),
    meetingType: z
      .enum([MEETING_TYPE.IN_PERSON, MEETING_TYPE.VIRTUAL, MEETING_TYPE.PHONE])
      .default(MEETING_TYPE.IN_PERSON),
    priority: z
      .enum([
        PRIORITY_LEVEL.LOW,
        PRIORITY_LEVEL.MEDIUM,
        PRIORITY_LEVEL.HIGH,
        PRIORITY_LEVEL.CRITICAL,
      ])
      .default(PRIORITY_LEVEL.MEDIUM),
    scheduledStart: z.coerce.date(),
    scheduledEnd: z.coerce.date(),
    timezone: z.string().trim().max(64).default('Asia/Kolkata'),
    locationText: z.string().trim().min(2).max(300),
    targetCoordinates: gpsCoordinatesSchema.optional(),
    agenda: z.string().trim().max(4000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(15).optional().default([]),
  })
  .refine((d) => d.scheduledEnd.getTime() > d.scheduledStart.getTime(), {
    message: 'Scheduled end time must be after scheduled start time',
    path: ['scheduledEnd'],
  });

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;

export const updateMeetingSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  purpose: z.string().trim().min(2).max(120).optional(),
  contactId: objectIdSchema.optional(),
  coHostIds: z.array(objectIdSchema).max(10).optional(),
  meetingType: z
    .enum([MEETING_TYPE.IN_PERSON, MEETING_TYPE.VIRTUAL, MEETING_TYPE.PHONE])
    .optional(),
  priority: z
    .enum([
      PRIORITY_LEVEL.LOW,
      PRIORITY_LEVEL.MEDIUM,
      PRIORITY_LEVEL.HIGH,
      PRIORITY_LEVEL.CRITICAL,
    ])
    .optional(),
  locationText: z.string().trim().min(2).max(300).optional(),
  targetCoordinates: gpsCoordinatesSchema.optional(),
  agenda: z.string().trim().max(4000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
});

export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;

export const checkInMeetingSchema = z.object({
  coordinates: gpsCoordinatesSchema,
  timestamp: z.coerce.date().optional(),
  arrivalNotes: z.string().trim().max(2000).optional(),
  geofenceOverrideReason: z.string().trim().max(500).optional(),
});

export type CheckInMeetingInput = z.infer<typeof checkInMeetingSchema>;

export const pauseVisitSchema = z.object({
  reason: z.string().trim().min(2).max(500).optional(),
  timestamp: z.coerce.date().optional(),
});

export type PauseVisitInput = z.infer<typeof pauseVisitSchema>;

export const resumeVisitSchema = z.object({
  notes: z.string().trim().max(500).optional(),
  timestamp: z.coerce.date().optional(),
});

export type ResumeVisitInput = z.infer<typeof resumeVisitSchema>;

export const checkOutMeetingSchema = z.object({
  coordinates: gpsCoordinatesSchema.optional(),
  timestamp: z.coerce.date().optional(),
  fieldNotes: z.string().trim().max(4000).optional(),
  signatureDataUrl: z
    .string()
    .max(150000)
    .regex(
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/,
      'Signature must be a valid base64 PNG/JPEG/WEBP data URL',
    )
    .optional(),
});

export type CheckOutMeetingInput = z.infer<typeof checkOutMeetingSchema>;

export const rescheduleMeetingSchema = z
  .object({
    scheduledStart: z.coerce.date(),
    scheduledEnd: z.coerce.date(),
    timezone: z.string().trim().max(64).default('Asia/Kolkata'),
    reason: z.string().trim().min(5, 'Reschedule reason is required').max(1000),
    checkOutActiveSession: z.boolean().optional().default(true),
    checkOutCoordinates: gpsCoordinatesSchema.optional(),
    checkOutTimestamp: z.coerce.date().optional(),
  })
  .refine((d) => d.scheduledEnd.getTime() > d.scheduledStart.getTime(), {
    message: 'Revised end time must be after revised start time',
    path: ['scheduledEnd'],
  });

export type RescheduleMeetingInput = z.infer<typeof rescheduleMeetingSchema>;

export const cancelMeetingSchema = z.object({
  reason: z.string().trim().min(5, 'Cancellation reason is required').max(1000),
  notifyCustomer: z.boolean().optional().default(true),
});

export type CancelMeetingInput = z.infer<typeof cancelMeetingSchema>;

export const reopenMeetingSchema = z.object({
  reason: z.string().trim().min(5, 'Mandatory reopen reason is required').max(1000),
  explanation: z.string().trim().max(2000).optional(),
  notifyAssignedRep: z.boolean().optional().default(true),
  managerPin: z.string().trim().min(4).max(12).optional(),
});

export type ReopenMeetingInput = z.infer<typeof reopenMeetingSchema>;

export const reassignMeetingSchema = z.object({
  newAssignedRepId: objectIdSchema,
  reason: z.string().trim().min(3, 'Reassignment reason is required').max(500),
});

export type ReassignMeetingInput = z.infer<typeof reassignMeetingSchema>;

export const meetingListQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum([
      MEETING_STATUS.SCHEDULED,
      MEETING_STATUS.CONFIRMED,
      MEETING_STATUS.CHECKED_IN,
      MEETING_STATUS.IN_PROGRESS,
      MEETING_STATUS.PAUSED,
      MEETING_STATUS.AWAITING_OUTCOME,
      MEETING_STATUS.RESCHEDULED,
      MEETING_STATUS.COMPLETED,
      MEETING_STATUS.REOPENED,
      MEETING_STATUS.CANCELLED,
    ])
    .optional(),
  outcomeType: z
    .enum([
      OUTCOME_TYPE.INTERESTED,
      OUTCOME_TYPE.PROPOSAL_REQUESTED,
      OUTCOME_TYPE.FOLLOW_UP_REQUIRED,
      OUTCOME_TYPE.NOT_INTERESTED,
      OUTCOME_TYPE.UNABLE_TO_MEET,
    ])
    .optional(),
  assignedRepId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

export type MeetingListQuery = z.infer<typeof meetingListQuerySchema>;
