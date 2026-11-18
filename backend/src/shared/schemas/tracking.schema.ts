import { z } from 'zod';
import { gpsCoordinatesSchema, objectIdSchema } from './common.schema.js';

export const LOCATION_PING_SOURCE = {
  HEARTBEAT: 'HEARTBEAT',
  CHECK_IN: 'CHECK_IN',
  CHECK_OUT: 'CHECK_OUT',
  MANUAL: 'MANUAL',
} as const;

export type LocationPingSource =
  (typeof LOCATION_PING_SOURCE)[keyof typeof LOCATION_PING_SOURCE];

export const repLocationPingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(1000000).optional(),
  speedMps: z.number().min(0).max(150).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  batteryPercent: z.number().min(0).max(100).nullable().optional(),
  meetingId: objectIdSchema.nullable().optional(),
  source: z
    .enum([
      LOCATION_PING_SOURCE.HEARTBEAT,
      LOCATION_PING_SOURCE.CHECK_IN,
      LOCATION_PING_SOURCE.CHECK_OUT,
      LOCATION_PING_SOURCE.MANUAL,
    ])
    .optional()
    .default(LOCATION_PING_SOURCE.HEARTBEAT),
  recordedAt: z.coerce.date().optional(),
});

export type RepLocationPingInput = z.infer<typeof repLocationPingSchema>;

export const toggleFieldDutySchema = z.object({
  active: z.boolean(),
  coordinates: gpsCoordinatesSchema.optional(),
});

export type ToggleFieldDutyInput = z.infer<typeof toggleFieldDutySchema>;
