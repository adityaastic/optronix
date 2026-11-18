import type { ClientSession, HydratedDocument } from 'mongoose';
import {
  LOCATION_PING_SOURCE,
  MEETING_EVENT_TYPE,
  MEETING_STATUS,
  MEETING_TYPE,
  VISIT_SESSION_STATUS,
  calculateDistanceMeters,
  calculateSessionDuration,
  calculateTotalCompletedVisitMinutes,
  canTransitionMeetingStatus,
  type CheckInMeetingInput,
  type CheckOutMeetingInput,
  type PauseVisitInput,
  type RescheduleMeetingInput,
  type ResumeVisitInput,
} from '../../shared/index.js';
import { ApiError } from '../../common/ApiError.js';
import { writeAuditLog } from '../../common/audit.service.js';
import { sha256Hex } from '../../common/crypto.js';
import { publishRealtimeEvent } from '../../common/realtime.service.js';
import { withTransaction } from '../../config/database.js';
import type { AuthenticatedActor } from '../../middleware/auth.middleware.js';
import { assertCanAccessUserScopedRecord } from '../../middleware/rbac.middleware.js';
import { CustomerModel } from '../../models/Customer.model.js';
import { MeetingEventModel } from '../../models/MeetingEvent.model.js';
import { MeetingModel, type IMeeting } from '../../models/Meeting.model.js';
import { MeetingScheduleModel } from '../../models/MeetingSchedule.model.js';
import { RepLocationPingModel } from '../../models/RepLocationPing.model.js';
import { SystemSettingModel } from '../../models/SystemSetting.model.js';
import { UserModel } from '../../models/User.model.js';
import {
  VisitSessionModel,
  type IVisitSession,
} from '../../models/VisitSession.model.js';
import { getMeetingDetails } from './meetings.service.js';

export async function checkInMeeting(
  actor: AuthenticatedActor,
  meetingId: string,
  input: CheckInMeetingInput,
  ipAddress?: string | null,
) {
  const meeting = await MeetingModel.findOne({
    _id: meetingId,
    isDeleted: false,
  });
  if (!meeting) {
    throw ApiError.notFound('Meeting record not found');
  }

  await assertCanAccessUserScopedRecord(
    actor,
    meeting.assignedRepId,
    meeting.coHostIds,
  );

  // Business Rule #4: Prevent duplicate check-ins
  const existingOpen = await VisitSessionModel.findOne({
    meetingId: meeting._id,
    status: { $in: [VISIT_SESSION_STATUS.ACTIVE, VISIT_SESSION_STATUS.PAUSED] },
  }).lean();

  if (meeting.activeVisitSessionId || existingOpen) {
    throw ApiError.conflict(
      'An active or paused visit session already exists for this meeting. Check out the current session before checking in again.',
      undefined,
      'DUPLICATE_CHECKIN',
    );
  }

  if (!canTransitionMeetingStatus(meeting.status, MEETING_STATUS.CHECKED_IN)) {
    throw ApiError.unprocessable(
      `Cannot check in when meeting status is "${meeting.status}".`,
      undefined,
      'INVALID_STATE_TRANSITION',
    );
  }

  const [customer, sysSettings] = await Promise.all([
    CustomerModel.findById(meeting.customerId).lean(),
    SystemSettingModel.findOne({ singletonKey: 'DEFAULT' }).lean(),
  ]);

  const checkInTime = input.timestamp ?? new Date();

  let distanceMeters: number | undefined;
  let withinGeofence = true;
  const targetLat =
    meeting.targetCoordinates?.latitude ??
    customer?.address.location?.coordinates?.[1];
  const targetLng =
    meeting.targetCoordinates?.longitude ??
    customer?.address.location?.coordinates?.[0];
  const allowedRadius =
    customer?.address.geofenceRadiusMeters ??
    sysSettings?.defaultGeofenceRadiusMeters ??
    100;

  if (typeof targetLat === 'number' && typeof targetLng === 'number') {
    distanceMeters = calculateDistanceMeters(
      input.coordinates.latitude,
      input.coordinates.longitude,
      targetLat,
      targetLng,
    );
    withinGeofence = distanceMeters <= allowedRadius;

    if (
      meeting.meetingType === MEETING_TYPE.IN_PERSON &&
      !withinGeofence &&
      sysSettings?.enforceGeofenceOnCheckIn !== false
    ) {
      if (
        sysSettings?.allowGeofenceOverrideWithReason === false ||
        !input.geofenceOverrideReason ||
        input.geofenceOverrideReason.trim().length < 5
      ) {
        throw ApiError.unprocessable(
          `Check-in coordinates are ${distanceMeters}m from site target (allowed geofence: ${allowedRadius}m). Provide a valid geofence override reason.`,
          { distanceMeters, allowedRadius },
          'GEOFENCE_OUT_OF_RANGE',
        );
      }
    }
  }

  await withTransaction(async (session) => {
    const nextSessionNumber = meeting.visitSessionCount + 1;
    const fromStatus = meeting.status;

    const [visitSession] = await VisitSessionModel.create(
      [
        {
          meetingId: meeting._id,
          repId: actor.userId,
          scheduleRevisionNumber: meeting.currentScheduleRevision,
          sessionNumber: nextSessionNumber,
          status: VISIT_SESSION_STATUS.ACTIVE,
          checkInAt: checkInTime,
          checkInTelemetry: {
            latitude: input.coordinates.latitude,
            longitude: input.coordinates.longitude,
            accuracyMeters: input.coordinates.accuracyMeters,
            distanceFromTargetMeters: distanceMeters,
            withinGeofence,
            geofenceOverrideReason: input.geofenceOverrideReason,
          },
          arrivalNotes: input.arrivalNotes,
        },
      ],
      session ? { session } : undefined,
    );

    if (!visitSession) {
      throw ApiError.internal('Failed to create visit session');
    }

    meeting.activeVisitSessionId = visitSession._id;
    meeting.visitSessionCount = nextSessionNumber;
    if (!meeting.firstCheckInAt) {
      meeting.firstCheckInAt = checkInTime;
    }
    // Transition Scheduled/Confirmed/Rescheduled/AwaitingOutcome -> CheckedIn -> InProgress
    meeting.status = MEETING_STATUS.IN_PROGRESS;
    await meeting.save(session ? { session } : undefined);

    await MeetingEventModel.create(
      [
        {
          meetingId: meeting._id,
          visitSessionId: visitSession._id,
          eventType: MEETING_EVENT_TYPE.CHECKED_IN,
          fromStatus,
          toStatus: MEETING_STATUS.CHECKED_IN,
          actorId: actor.userId,
          reason: input.geofenceOverrideReason ?? null,
          telemetry: {
            ipAddress: ipAddress ?? undefined,
            latitude: input.coordinates.latitude,
            longitude: input.coordinates.longitude,
            accuracyMeters: input.coordinates.accuracyMeters,
            sha256Hash: sha256Hex(
              `${meeting.meetingCode}:CHECKIN:${nextSessionNumber}:${checkInTime.toISOString()}`,
            ),
          },
          metadata: {
            sessionNumber: nextSessionNumber,
            distanceFromTargetMeters: distanceMeters ?? null,
            withinGeofence,
          },
        },
        {
          meetingId: meeting._id,
          visitSessionId: visitSession._id,
          eventType: MEETING_EVENT_TYPE.STARTED_PROGRESS,
          fromStatus: MEETING_STATUS.CHECKED_IN,
          toStatus: MEETING_STATUS.IN_PROGRESS,
          actorId: actor.userId,
          telemetry: {
            sha256Hash: sha256Hex(
              `${meeting.meetingCode}:IN_PROGRESS:${nextSessionNumber}:${checkInTime.toISOString()}`,
            ),
          },
        },
      ],
      session ? { session, ordered: true } : undefined,
    );

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'MEETING_CHECKED_IN',
      entityType: 'MEETING',
      entityId: meeting._id,
      afterSnapshot: {
        visitSessionNumber: nextSessionNumber,
        checkInAt: checkInTime.toISOString(),
        withinGeofence,
        distanceFromTargetMeters: distanceMeters ?? null,
      },
      reason: input.geofenceOverrideReason ?? null,
      ipAddress,
      session,
    });
  });

  await Promise.all([
    RepLocationPingModel.create({
      repId: actor.userId,
      meetingId: meeting._id,
      latitude: input.coordinates.latitude,
      longitude: input.coordinates.longitude,
      accuracyMeters: input.coordinates.accuracyMeters ?? 6,
      source: LOCATION_PING_SOURCE.CHECK_IN,
      recordedAt: checkInTime,
    }),
    UserModel.updateOne(
      { _id: actor.userId },
      {
        $set: {
          lastActiveAt: new Date(),
          lastKnownLocation: {
            latitude: input.coordinates.latitude,
            longitude: input.coordinates.longitude,
            accuracyMeters: input.coordinates.accuracyMeters ?? 6,
            source: LOCATION_PING_SOURCE.CHECK_IN,
            updatedAt: checkInTime,
          },
        },
      },
    ),
  ]).catch(() => undefined);

  publishRealtimeEvent({
    event: 'VISIT_ACTIVITY',
    actorId: String(actor.userId),
    entityId: String(meeting._id),
    title: `${actor.fullName} checked in to ${meeting.meetingCode}`,
  });

  return getMeetingDetails(actor, String(meeting._id));
}

export async function pauseVisitSession(
  actor: AuthenticatedActor,
  meetingId: string,
  input: PauseVisitInput,
  ipAddress?: string | null,
) {
  const meeting = await MeetingModel.findOne({
    _id: meetingId,
    isDeleted: false,
  });
  if (!meeting) {
    throw ApiError.notFound('Meeting record not found');
  }

  await assertCanAccessUserScopedRecord(
    actor,
    meeting.assignedRepId,
    meeting.coHostIds,
  );

  const activeSession = await VisitSessionModel.findOne({
    meetingId: meeting._id,
    status: VISIT_SESSION_STATUS.ACTIVE,
  });

  if (!activeSession) {
    throw ApiError.unprocessable(
      'Cannot pause visit: there is no active visit session in progress.',
      undefined,
      'NO_ACTIVE_VISIT_SESSION',
    );
  }

  if (!canTransitionMeetingStatus(meeting.status, MEETING_STATUS.PAUSED)) {
    throw ApiError.unprocessable(
      `Invalid lifecycle transition from ${meeting.status} to PAUSED`,
      undefined,
      'INVALID_STATE_TRANSITION',
    );
  }

  const pauseTime = input.timestamp ?? new Date();
  if (pauseTime.getTime() < activeSession.checkInAt.getTime()) {
    throw ApiError.badRequest('Pause timestamp cannot precede session check-in time');
  }

  await withTransaction(async (session) => {
    const fromStatus = meeting.status;

    activeSession.pauseSegments.push({
      pausedAt: pauseTime,
      resumedAt: null,
      durationMinutes: 0,
      reason: input.reason,
    });
    activeSession.status = VISIT_SESSION_STATUS.PAUSED;
    await activeSession.save(session ? { session } : undefined);

    meeting.status = MEETING_STATUS.PAUSED;
    await meeting.save(session ? { session } : undefined);

    await MeetingEventModel.create(
      [
        {
          meetingId: meeting._id,
          visitSessionId: activeSession._id,
          eventType: MEETING_EVENT_TYPE.PAUSED,
          fromStatus,
          toStatus: MEETING_STATUS.PAUSED,
          actorId: actor.userId,
          reason: input.reason ?? null,
          telemetry: {
            ipAddress: ipAddress ?? undefined,
            sha256Hash: sha256Hex(
              `${meeting.meetingCode}:PAUSE:${pauseTime.toISOString()}`,
            ),
          },
        },
      ],
      session ? { session } : undefined,
    );

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'MEETING_VISIT_PAUSED',
      entityType: 'MEETING',
      entityId: meeting._id,
      reason: input.reason ?? null,
      ipAddress,
      session,
    });
  });

  return getMeetingDetails(actor, String(meeting._id));
}

export async function resumeVisitSession(
  actor: AuthenticatedActor,
  meetingId: string,
  input: ResumeVisitInput,
  ipAddress?: string | null,
) {
  const meeting = await MeetingModel.findOne({
    _id: meetingId,
    isDeleted: false,
  });
  if (!meeting) {
    throw ApiError.notFound('Meeting record not found');
  }

  await assertCanAccessUserScopedRecord(
    actor,
    meeting.assignedRepId,
    meeting.coHostIds,
  );

  const pausedSession = await VisitSessionModel.findOne({
    meetingId: meeting._id,
    status: VISIT_SESSION_STATUS.PAUSED,
  });

  if (!pausedSession) {
    throw ApiError.unprocessable(
      'Cannot resume visit: there is no paused visit session.',
      undefined,
      'VISIT_NOT_PAUSED',
    );
  }

  if (!canTransitionMeetingStatus(meeting.status, MEETING_STATUS.IN_PROGRESS)) {
    throw ApiError.unprocessable(
      `Invalid lifecycle transition from ${meeting.status} to IN_PROGRESS`,
      undefined,
      'INVALID_STATE_TRANSITION',
    );
  }

  const resumeTime = input.timestamp ?? new Date();
  const openPause = [...pausedSession.pauseSegments]
    .reverse()
    .find((seg) => !seg.resumedAt);

  if (openPause && resumeTime.getTime() < new Date(openPause.pausedAt).getTime()) {
    throw ApiError.badRequest('Resume timestamp cannot precede pause timestamp');
  }

  await withTransaction(async (session) => {
    if (openPause) {
      openPause.resumedAt = resumeTime;
      openPause.durationMinutes = Math.max(
        0,
        Math.round(
          (resumeTime.getTime() - new Date(openPause.pausedAt).getTime()) /
            60000,
        ),
      );
    }

    pausedSession.status = VISIT_SESSION_STATUS.ACTIVE;
    await pausedSession.save(session ? { session } : undefined);

    const fromStatus = meeting.status;
    meeting.status = MEETING_STATUS.IN_PROGRESS;
    await meeting.save(session ? { session } : undefined);

    await MeetingEventModel.create(
      [
        {
          meetingId: meeting._id,
          visitSessionId: pausedSession._id,
          eventType: MEETING_EVENT_TYPE.RESUMED,
          fromStatus,
          toStatus: MEETING_STATUS.IN_PROGRESS,
          actorId: actor.userId,
          reason: input.notes ?? null,
          telemetry: {
            ipAddress: ipAddress ?? undefined,
            sha256Hash: sha256Hex(
              `${meeting.meetingCode}:RESUME:${resumeTime.toISOString()}`,
            ),
          },
        },
      ],
      session ? { session } : undefined,
    );

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'MEETING_VISIT_RESUMED',
      entityType: 'MEETING',
      entityId: meeting._id,
      reason: input.notes ?? null,
      ipAddress,
      session,
    });
  });

  return getMeetingDetails(actor, String(meeting._id));
}

async function closeActiveVisitSessionInternal(params: {
  meeting: HydratedDocument<IMeeting>;
  openSession: HydratedDocument<IVisitSession>;
  checkOutTime: Date;
  coordinates?: CheckOutMeetingInput['coordinates'];
  fieldNotes?: string;
  signatureDataUrl?: string;
  actor: AuthenticatedActor;
  ipAddress?: string | null;
  targetMeetingStatus:
    | typeof MEETING_STATUS.AWAITING_OUTCOME
    | typeof MEETING_STATUS.RESCHEDULED;
  session?: ClientSession;
}) {
  const {
    meeting,
    openSession,
    checkOutTime,
    coordinates,
    fieldNotes,
    signatureDataUrl,
    actor,
    ipAddress,
    targetMeetingStatus,
    session,
  } = params;

  if (checkOutTime.getTime() <= openSession.checkInAt.getTime()) {
    throw ApiError.badRequest('Check-out timestamp must be after check-in timestamp');
  }

  // Close any open pause segment at checkOutTime
  for (const seg of openSession.pauseSegments) {
    if (!seg.resumedAt) {
      seg.resumedAt = checkOutTime;
      seg.durationMinutes = Math.max(
        0,
        Math.round(
          (checkOutTime.getTime() - new Date(seg.pausedAt).getTime()) / 60000,
        ),
      );
    }
  }

  openSession.checkOutAt = checkOutTime;
  if (coordinates) {
    let distanceMeters: number | undefined;
    if (meeting.targetCoordinates) {
      distanceMeters = calculateDistanceMeters(
        coordinates.latitude,
        coordinates.longitude,
        meeting.targetCoordinates.latitude,
        meeting.targetCoordinates.longitude,
      );
    }
    openSession.checkOutTelemetry = {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      accuracyMeters: coordinates.accuracyMeters,
      distanceFromTargetMeters: distanceMeters,
      withinGeofence:
        distanceMeters !== undefined ? distanceMeters <= 150 : true,
    };
  }
  if (fieldNotes !== undefined) {
    openSession.fieldNotes = fieldNotes;
  }
  if (signatureDataUrl !== undefined) {
    openSession.signatureDataUrl = signatureDataUrl;
  }

  const breakdown = calculateSessionDuration(
    {
      status: VISIT_SESSION_STATUS.COMPLETED,
      checkInAt: openSession.checkInAt,
      checkOutAt: checkOutTime,
      pauseSegments: openSession.pauseSegments,
    },
    checkOutTime,
  );

  openSession.status = VISIT_SESSION_STATUS.COMPLETED;
  openSession.grossDurationMinutes = breakdown.grossDurationMinutes;
  openSession.pausedDurationMinutes = breakdown.pausedDurationMinutes;
  openSession.netDurationMinutes = breakdown.netDurationMinutes;
  openSession.integrityHash = sha256Hex(
    `${meeting.meetingCode}:S${openSession.sessionNumber}:${openSession.checkInAt.toISOString()}:${checkOutTime.toISOString()}:${breakdown.netDurationMinutes}`,
  );
  await openSession.save(session ? { session } : undefined);

  // Sum ONLY completed VisitSessions (never firstCheckInAt -> lastCheckOutAt!)
  const allSessionsQuery = VisitSessionModel.find({ meetingId: meeting._id });
  if (session) allSessionsQuery.session(session);
  const allSessions = await allSessionsQuery.lean();

  const totalActualMinutes = calculateTotalCompletedVisitMinutes(allSessions);
  const completedCount = allSessions.filter(
    (s) => s.status === VISIT_SESSION_STATUS.COMPLETED,
  ).length;

  const fromStatus = meeting.status;
  meeting.activeVisitSessionId = null;
  meeting.completedSessionCount = completedCount;
  meeting.totalActualDurationMinutes = totalActualMinutes;
  meeting.lastCheckOutAt = checkOutTime;
  meeting.status = targetMeetingStatus;
  await meeting.save(session ? { session } : undefined);

  await CustomerModel.updateOne(
    { _id: meeting.customerId },
    { $set: { lastMeetingAt: checkOutTime } },
    session ? { session } : undefined,
  );

  await MeetingEventModel.create(
    [
      {
        meetingId: meeting._id,
        visitSessionId: openSession._id,
        eventType: MEETING_EVENT_TYPE.CHECKED_OUT,
        fromStatus,
        toStatus: targetMeetingStatus,
        actorId: actor.userId,
        telemetry: {
          ipAddress: ipAddress ?? undefined,
          latitude: coordinates?.latitude,
          longitude: coordinates?.longitude,
          accuracyMeters: coordinates?.accuracyMeters,
          sha256Hash: openSession.integrityHash,
        },
        metadata: {
          sessionNumber: openSession.sessionNumber,
          sessionNetMinutes: breakdown.netDurationMinutes,
          totalActualDurationMinutes: totalActualMinutes,
        },
      },
    ],
    session ? { session } : undefined,
  );
}

export async function checkOutMeeting(
  actor: AuthenticatedActor,
  meetingId: string,
  input: CheckOutMeetingInput,
  ipAddress?: string | null,
) {
  const meeting = await MeetingModel.findOne({
    _id: meetingId,
    isDeleted: false,
  });
  if (!meeting) {
    throw ApiError.notFound('Meeting record not found');
  }

  await assertCanAccessUserScopedRecord(
    actor,
    meeting.assignedRepId,
    meeting.coHostIds,
  );

  // Business Rule #3: Check-out cannot happen without an active check-in
  const openSession = await VisitSessionModel.findOne({
    meetingId: meeting._id,
    status: { $in: [VISIT_SESSION_STATUS.ACTIVE, VISIT_SESSION_STATUS.PAUSED] },
  });

  if (!openSession) {
    throw ApiError.unprocessable(
      'Check-out denied: there is no active visit session for this meeting.',
      undefined,
      'NO_ACTIVE_VISIT_SESSION',
    );
  }

  if (
    !canTransitionMeetingStatus(meeting.status, MEETING_STATUS.AWAITING_OUTCOME)
  ) {
    throw ApiError.unprocessable(
      `Invalid lifecycle transition from ${meeting.status} on check-out.`,
      undefined,
      'INVALID_STATE_TRANSITION',
    );
  }

  const checkOutTime = input.timestamp ?? new Date();

  await withTransaction(async (session) => {
    await closeActiveVisitSessionInternal({
      meeting,
      openSession,
      checkOutTime,
      coordinates: input.coordinates,
      fieldNotes: input.fieldNotes,
      signatureDataUrl: input.signatureDataUrl,
      actor,
      ipAddress,
      targetMeetingStatus: MEETING_STATUS.AWAITING_OUTCOME,
      session,
    });

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'MEETING_CHECKED_OUT',
      entityType: 'MEETING',
      entityId: meeting._id,
      afterSnapshot: {
        sessionNumber: openSession.sessionNumber,
        checkOutAt: checkOutTime.toISOString(),
        totalActualDurationMinutes: meeting.totalActualDurationMinutes,
      },
      ipAddress,
      session,
    });
  });

  if (input.coordinates) {
    await Promise.all([
      RepLocationPingModel.create({
        repId: actor.userId,
        meetingId: meeting._id,
        latitude: input.coordinates.latitude,
        longitude: input.coordinates.longitude,
        accuracyMeters: input.coordinates.accuracyMeters ?? 6,
        source: LOCATION_PING_SOURCE.CHECK_OUT,
        recordedAt: checkOutTime,
      }),
      UserModel.updateOne(
        { _id: actor.userId },
        {
          $set: {
            lastActiveAt: new Date(),
            lastKnownLocation: {
              latitude: input.coordinates.latitude,
              longitude: input.coordinates.longitude,
              accuracyMeters: input.coordinates.accuracyMeters ?? 6,
              source: LOCATION_PING_SOURCE.CHECK_OUT,
              updatedAt: checkOutTime,
            },
          },
        },
      ),
    ]).catch(() => undefined);
  }

  publishRealtimeEvent({
    event: 'VISIT_ACTIVITY',
    actorId: String(actor.userId),
    entityId: String(meeting._id),
    title: `${actor.fullName} checked out of ${meeting.meetingCode}`,
  });

  return getMeetingDetails(actor, String(meeting._id));
}

export async function rescheduleMeeting(
  actor: AuthenticatedActor,
  meetingId: string,
  input: RescheduleMeetingInput,
  ipAddress?: string | null,
) {
  const meeting = await MeetingModel.findOne({
    _id: meetingId,
    isDeleted: false,
  });
  if (!meeting) {
    throw ApiError.notFound('Meeting record not found');
  }

  await assertCanAccessUserScopedRecord(
    actor,
    meeting.assignedRepId,
    meeting.coHostIds,
  );

  if (!canTransitionMeetingStatus(meeting.status, MEETING_STATUS.RESCHEDULED)) {
    throw ApiError.unprocessable(
      `Cannot reschedule meeting in "${meeting.status}" state.`,
      undefined,
      'INVALID_STATE_TRANSITION',
    );
  }

  const openSession = await VisitSessionModel.findOne({
    meetingId: meeting._id,
    status: { $in: [VISIT_SESSION_STATUS.ACTIVE, VISIT_SESSION_STATUS.PAUSED] },
  });

  if (openSession && input.checkOutActiveSession === false) {
    throw ApiError.unprocessable(
      'Active visit session must be checked out when rescheduling the remaining meeting.',
      undefined,
      'ACTIVE_SESSION_MUST_CLOSE',
    );
  }

  await withTransaction(async (session) => {
    const previousStatus = meeting.status;
    const previousScheduleSnapshot = {
      revision: meeting.currentScheduleRevision,
      scheduledStart: meeting.currentScheduledStart.toISOString(),
      scheduledEnd: meeting.currentScheduledEnd.toISOString(),
    };

    // If rescheduling mid-visit (e.g. 10:40 AM continuation to 3:00 PM), close Session #1 cleanly first!
    if (openSession) {
      const checkOutTime = input.checkOutTimestamp ?? new Date();
      await closeActiveVisitSessionInternal({
        meeting,
        openSession,
        checkOutTime,
        coordinates: input.checkOutCoordinates,
        actor,
        ipAddress,
        targetMeetingStatus: MEETING_STATUS.RESCHEDULED,
        session,
      });
    }

    // Business Rule #8: Never overwrite originalScheduledStart/End; append immutable MeetingSchedule revision
    const nextRevision = meeting.currentScheduleRevision + 1;

    const [newSchedule] = await MeetingScheduleModel.create(
      [
        {
          meetingId: meeting._id,
          revisionNumber: nextRevision,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          timezone: input.timezone,
          isOriginal: false,
          previousScheduleId: meeting.currentScheduleId ?? null,
          changedBy: actor.userId,
          changeReason: input.reason,
        },
      ],
      session ? { session } : undefined,
    );

    if (!newSchedule) {
      throw ApiError.internal('Failed to create schedule revision');
    }

    meeting.currentScheduledStart = input.scheduledStart;
    meeting.currentScheduledEnd = input.scheduledEnd;
    meeting.timezone = input.timezone;
    meeting.currentScheduleRevision = nextRevision;
    meeting.currentScheduleId = newSchedule._id;
    meeting.status = MEETING_STATUS.RESCHEDULED;
    await meeting.save(session ? { session } : undefined);

    await MeetingEventModel.create(
      [
        {
          meetingId: meeting._id,
          eventType: MEETING_EVENT_TYPE.RESCHEDULED,
          fromStatus: previousStatus,
          toStatus: MEETING_STATUS.RESCHEDULED,
          actorId: actor.userId,
          reason: input.reason,
          telemetry: {
            ipAddress: ipAddress ?? undefined,
            sha256Hash: sha256Hex(
              `${meeting.meetingCode}:RESCHEDULE:REV${nextRevision}:${input.scheduledStart.toISOString()}`,
            ),
          },
          metadata: {
            revisionNumber: nextRevision,
            previousScheduledStart: previousScheduleSnapshot.scheduledStart,
            previousScheduledEnd: previousScheduleSnapshot.scheduledEnd,
            revisedScheduledStart: input.scheduledStart.toISOString(),
            revisedScheduledEnd: input.scheduledEnd.toISOString(),
          },
        },
      ],
      session ? { session } : undefined,
    );

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'MEETING_RESCHEDULED',
      entityType: 'MEETING',
      entityId: meeting._id,
      beforeSnapshot: previousScheduleSnapshot,
      afterSnapshot: {
        revision: nextRevision,
        scheduledStart: input.scheduledStart.toISOString(),
        scheduledEnd: input.scheduledEnd.toISOString(),
      },
      reason: input.reason,
      ipAddress,
      session,
    });
  });

  return getMeetingDetails(actor, String(meeting._id));
}
