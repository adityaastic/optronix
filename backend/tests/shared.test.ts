import { describe, expect, it } from 'vitest';
import {
  MEETING_STATUS,
  OUTCOME_TYPE,
  VISIT_SESSION_STATUS,
  calculateDistanceMeters,
  calculateSessionDuration,
  calculateTotalCompletedVisitMinutes,
  canTransitionMeetingStatus,
  recordMeetingOutcomeSchema,
} from '../src/shared/index.js';

describe('Domain lifecycle math & validation schemas', () => {
  it('calculates split-visit scenario (10:02-10:40 + 15:10-16:00) as 88 minutes, not 358 minutes', () => {
    const session1 = {
      status: VISIT_SESSION_STATUS.COMPLETED,
      checkInAt: '2026-11-18T10:02:00+05:30',
      checkOutAt: '2026-11-18T10:40:00+05:30',
    };
    const session2 = {
      status: VISIT_SESSION_STATUS.COMPLETED,
      checkInAt: '2026-11-18T15:10:00+05:30',
      checkOutAt: '2026-11-18T16:00:00+05:30',
    };

    expect(calculateSessionDuration(session1).netDurationMinutes).toBe(38);
    expect(calculateSessionDuration(session2).netDurationMinutes).toBe(50);
    expect(calculateTotalCompletedVisitMinutes([session1, session2])).toBe(88);
  });

  it('subtracts paused segments from net session duration', () => {
    const breakdown = calculateSessionDuration({
      status: VISIT_SESSION_STATUS.COMPLETED,
      checkInAt: '2026-11-18T10:00:00Z',
      checkOutAt: '2026-11-18T11:00:00Z',
      pauseSegments: [
        {
          pausedAt: '2026-11-18T10:15:00Z',
          resumedAt: '2026-11-18T10:30:00Z',
        },
      ],
    });
    expect(breakdown.grossDurationMinutes).toBe(60);
    expect(breakdown.pausedDurationMinutes).toBe(15);
    expect(breakdown.netDurationMinutes).toBe(45);
  });

  it('enforces state machine transitions and rejects arbitrary jumps', () => {
    expect(
      canTransitionMeetingStatus(MEETING_STATUS.SCHEDULED, MEETING_STATUS.CONFIRMED),
    ).toBe(true);
    expect(
      canTransitionMeetingStatus(MEETING_STATUS.SCHEDULED, MEETING_STATUS.COMPLETED),
    ).toBe(false);
    expect(
      canTransitionMeetingStatus(MEETING_STATUS.COMPLETED, MEETING_STATUS.REOPENED),
    ).toBe(true);
    expect(
      canTransitionMeetingStatus(MEETING_STATUS.COMPLETED, MEETING_STATUS.IN_PROGRESS),
    ).toBe(false);
  });

  it('rejects FOLLOW_UP_REQUIRED outcome when owner and due date are missing', () => {
    const invalid = recordMeetingOutcomeSchema.safeParse({
      outcomeType: OUTCOME_TYPE.FOLLOW_UP_REQUIRED,
      summary: 'Customer asked for revised security architecture deck next week.',
      followUpTasks: [],
    });
    expect(invalid.success).toBe(false);

    const valid = recordMeetingOutcomeSchema.safeParse({
      outcomeType: OUTCOME_TYPE.FOLLOW_UP_REQUIRED,
      summary: 'Customer asked for revised security architecture deck next week.',
      followUpTasks: [
        {
          title: 'Send revised security deck',
          ownerId: '655000000000000000000001',
          dueDate: '2026-11-25T12:00:00.000Z',
          priority: 'HIGH',
        },
      ],
    });
    expect(valid.success).toBe(true);
  });

  it('computes Haversine geofence distance accurately', () => {
    const dist = calculateDistanceMeters(28.628, 77.3649, 28.62815, 77.36495);
    expect(dist).toBeGreaterThan(10);
    expect(dist).toBeLessThan(25);
  });
});
