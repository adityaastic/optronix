import { VISIT_SESSION_STATUS, type VisitSessionStatus } from '../constants/meeting-lifecycle.js';

export interface PauseSegmentLike {
  pausedAt: Date | string;
  resumedAt?: Date | string | null;
}

export interface VisitSessionDurationInput {
  status: VisitSessionStatus;
  checkInAt: Date | string;
  checkOutAt?: Date | string | null;
  pauseSegments?: PauseSegmentLike[];
}

export interface SessionDurationBreakdown {
  grossDurationMinutes: number;
  pausedDurationMinutes: number;
  netDurationMinutes: number;
}

/**
 * Calculates gross, paused, and net active minutes for a single VisitSession.
 */
export function calculateSessionDuration(
  session: VisitSessionDurationInput,
  referenceNow: Date = new Date(),
): SessionDurationBreakdown {
  const startMs = new Date(session.checkInAt).getTime();
  const endMs = session.checkOutAt
    ? new Date(session.checkOutAt).getTime()
    : referenceNow.getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return {
      grossDurationMinutes: 0,
      pausedDurationMinutes: 0,
      netDurationMinutes: 0,
    };
  }

  const grossMs = endMs - startMs;

  let pausedMs = 0;
  for (const seg of session.pauseSegments ?? []) {
    const pStart = new Date(seg.pausedAt).getTime();
    const pEnd = seg.resumedAt
      ? new Date(seg.resumedAt).getTime()
      : endMs;
    if (!Number.isNaN(pStart) && !Number.isNaN(pEnd) && pEnd > pStart) {
      pausedMs += Math.min(pEnd, endMs) - Math.max(pStart, startMs);
    }
  }

  const netMs = Math.max(0, grossMs - pausedMs);

  const grossDurationMinutes = Math.round(grossMs / 60000);
  const pausedDurationMinutes = Math.round(pausedMs / 60000);
  const netDurationMinutes = Math.max(
    0,
    Math.round(netMs / 60000),
  );

  return {
    grossDurationMinutes,
    pausedDurationMinutes,
    netDurationMinutes,
  };
}

/**
 * Calculates total actual visit duration across multiple VisitSessions.
 * CRITICAL RULE: Must sum ONLY completed visit sessions (netDurationMinutes),
 * NEVER the elapsed wall-clock gap between first check-in and final check-out.
 */
export function calculateTotalCompletedVisitMinutes(
  sessions: ReadonlyArray<
    VisitSessionDurationInput & { netDurationMinutes?: number | null }
  >,
): number {
  return sessions.reduce((sum, session) => {
    if (session.status !== VISIT_SESSION_STATUS.COMPLETED) {
      return sum;
    }
    if (
      typeof session.netDurationMinutes === 'number' &&
      session.netDurationMinutes >= 0
    ) {
      return sum + session.netDurationMinutes;
    }
    return sum + calculateSessionDuration(session).netDurationMinutes;
  }, 0);
}

/**
 * Haversine distance in meters between two WGS84 coordinates.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
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

/**
 * Formats an elapsed duration in seconds into a tabular HH:MM:SS clock string.
 */
export function formatDurationClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hrs, mins, secs]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
