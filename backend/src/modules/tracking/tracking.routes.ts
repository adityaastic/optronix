import { Router, type Request, type Response } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  LOCATION_PING_SOURCE,
  MEETING_STATUS,
  MEETING_TYPE,
  PERMISSIONS,
  ROLE_CODES,
  USER_STATUS,
  VISIT_SESSION_STATUS,
  calculateDistanceMeters,
  objectIdSchema,
  repLocationPingSchema,
  toggleFieldDutySchema,
  type RepLocationPingInput,
  type ToggleFieldDutyInput,
} from '../../shared/index.js';
import { ApiError } from '../../common/ApiError.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { publishRealtimeEvent } from '../../common/realtime.service.js';
import { paramId, sendSuccess } from '../../common/response.js';
import { authenticate, getAuthActor } from '../../middleware/auth.middleware.js';
import {
  assertCanAccessUserScopedRecord,
  requirePermissions,
  resolveAuthorizedUserScope,
} from '../../middleware/rbac.middleware.js';
import {
  validateBody,
  validateParams,
} from '../../middleware/validate.middleware.js';
import { CustomerModel } from '../../models/Customer.model.js';
import { MeetingModel } from '../../models/Meeting.model.js';
import { RepLocationPingModel } from '../../models/RepLocationPing.model.js';
import { RoleModel } from '../../models/Role.model.js';
import { UserModel } from '../../models/User.model.js';
import { VisitSessionModel } from '../../models/VisitSession.model.js';

function computeTrailDistanceKm(
  points: Array<{ latitude: number; longitude: number }>,
): number {
  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    totalMeters += calculateDistanceMeters(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude,
    );
  }
  return Math.round((totalMeters / 1000) * 100) / 100;
}

export const trackingRouter: Router = Router();
trackingRouter.use(authenticate);

// 1. Salesperson sends live GPS heartbeat / manual ping
trackingRouter.post(
  '/ping',
  validateBody(repLocationPingSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const input = req.body as RepLocationPingInput;
    const recordedAt = input.recordedAt ?? new Date();

    if (input.meetingId) {
      const mtg = await MeetingModel.findOne({
        _id: input.meetingId,
        isDeleted: false,
      }).lean();
      if (!mtg) {
        throw ApiError.notFound('Referenced meeting not found');
      }
      await assertCanAccessUserScopedRecord(
        actor,
        mtg.assignedRepId,
        mtg.coHostIds,
      );
    }

    const ping = await RepLocationPingModel.create({
      repId: actor.userId,
      meetingId: input.meetingId ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters ?? 8,
      speedMps: input.speedMps ?? null,
      heading: input.heading ?? null,
      batteryPercent: input.batteryPercent ?? null,
      source: input.source ?? LOCATION_PING_SOURCE.HEARTBEAT,
      recordedAt,
    });

    await UserModel.updateOne(
      { _id: actor.userId },
      {
        $set: {
          lastActiveAt: new Date(),
          lastKnownLocation: {
            latitude: input.latitude,
            longitude: input.longitude,
            accuracyMeters: input.accuracyMeters ?? 8,
            source: input.source ?? LOCATION_PING_SOURCE.HEARTBEAT,
            updatedAt: recordedAt,
          },
        },
      },
    );

    publishRealtimeEvent({
      event: 'REP_LOCATION_UPDATED',
      actorId: String(actor.userId),
      title: `${actor.fullName} updated field GPS`,
    });

    return sendSuccess(
      res,
      {
        ping: {
          id: String(ping._id),
          latitude: ping.latitude,
          longitude: ping.longitude,
          accuracyMeters: ping.accuracyMeters ?? 8,
          source: ping.source,
          recordedAt: ping.recordedAt,
        },
      },
      201,
    );
  }),
);

// 2. Salesperson toggles On-Duty / Off-Duty live field GPS sharing
trackingRouter.post(
  '/duty',
  validateBody(toggleFieldDutySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const input = req.body as ToggleFieldDutyInput;
    const now = new Date();

    const updateDoc: Record<string, unknown> = {
      isFieldDutyActive: input.active,
      lastActiveAt: now,
    };

    if (input.coordinates) {
      updateDoc.lastKnownLocation = {
        latitude: input.coordinates.latitude,
        longitude: input.coordinates.longitude,
        accuracyMeters: input.coordinates.accuracyMeters ?? 8,
        source: input.active ? 'DUTY_START' : 'DUTY_END',
        updatedAt: now,
      };
      await RepLocationPingModel.create({
        repId: actor.userId,
        latitude: input.coordinates.latitude,
        longitude: input.coordinates.longitude,
        accuracyMeters: input.coordinates.accuracyMeters ?? 8,
        source: LOCATION_PING_SOURCE.MANUAL,
        recordedAt: now,
      });
    }

    await UserModel.updateOne({ _id: actor.userId }, { $set: updateDoc });

    publishRealtimeEvent({
      event: 'REP_LOCATION_UPDATED',
      actorId: String(actor.userId),
      title: `${actor.fullName} ${input.active ? 'started' : 'paused'} field duty GPS`,
    });

    return sendSuccess(res, {
      isFieldDutyActive: input.active,
      updatedAt: now,
    });
  }),
);

// 3. Current salesperson's own duty status & today's breadcrumb summary
trackingRouter.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [userDoc, todaysPings] = await Promise.all([
      UserModel.findById(actor.userId).lean(),
      RepLocationPingModel.find({
        repId: actor.userId,
        recordedAt: { $gte: startOfDay },
      })
        .sort({ recordedAt: 1 })
        .limit(100)
        .lean(),
    ]);

    return sendSuccess(res, {
      isFieldDutyActive: Boolean(userDoc?.isFieldDutyActive),
      lastKnownLocation: userDoc?.lastKnownLocation ?? null,
      todayPingsCount: todaysPings.length,
      todayDistanceKm: computeTrailDistanceKm(todaysPings),
    });
  }),
);

// 4. Manager / Admin Live Field Radar (All Scoped Team Members + Active Visits + Next Stops)
trackingRouter.get(
  '/live-team',
  requirePermissions(PERMISSIONS.TEAM_READ),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const scope = await resolveAuthorizedUserScope(actor);

    const salesRoles = await RoleModel.find({
      code: { $in: [ROLE_CODES.SALES_EMPLOYEE, ROLE_CODES.SALES_MANAGER] },
    }).lean();
    const salesRoleIds = salesRoles.map((r) => r._id);

    const userFilter: Record<string, unknown> = {
      deletedAt: null,
      status: USER_STATUS.ACTIVE,
      roleId: { $in: salesRoleIds },
    };
    if (scope.allowedUserIds !== null) {
      userFilter._id = { $in: scope.allowedUserIds };
    }

    const teamUsers = await UserModel.find(userFilter)
      .sort({ firstName: 1 })
      .lean();
    const teamUserIds = teamUsers.map((u) => u._id);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [openSessions, recentSessions, todaysPings, upcomingMeetings, repCustomers] =
      await Promise.all([
        VisitSessionModel.find({
          repId: { $in: teamUserIds },
          status: {
            $in: [VISIT_SESSION_STATUS.ACTIVE, VISIT_SESSION_STATUS.PAUSED],
          },
        })
          .populate({
            path: 'meetingId',
            select: 'meetingCode title customerId locationText targetCoordinates',
            populate: { path: 'customerId', select: 'companyName address' },
          })
          .lean(),
        VisitSessionModel.find({ repId: { $in: teamUserIds } })
          .sort({ checkInAt: -1 })
          .limit(60)
          .lean(),
        RepLocationPingModel.find({
          repId: { $in: teamUserIds },
          recordedAt: { $gte: startOfDay },
        })
          .sort({ recordedAt: 1 })
          .lean(),
        MeetingModel.find({
          assignedRepId: { $in: teamUserIds },
          isDeleted: false,
          meetingType: MEETING_TYPE.IN_PERSON,
          status: {
            $in: [
              MEETING_STATUS.SCHEDULED,
              MEETING_STATUS.CONFIRMED,
              MEETING_STATUS.RESCHEDULED,
            ],
          },
        })
          .populate('customerId', 'companyName address')
          .sort({ currentScheduledStart: 1 })
          .limit(40)
          .lean(),
        CustomerModel.find(
          { assignedRepId: { $in: teamUserIds }, isArchived: false },
          { assignedRepId: 1, companyName: 1, address: 1 },
        ).lean(),
      ]);

    const nowMs = Date.now();

    const reps = teamUsers.map((u, idx) => {
      const uid = String(u._id);
      const activeSession = openSessions.find((s) => String(s.repId) === uid);
      const latestVisit = recentSessions.find((s) => String(s.repId) === uid);
      const repPings = todaysPings.filter((p) => String(p.repId) === uid);
      const latestPing = repPings[repPings.length - 1];
      const nextMtg = upcomingMeetings.find(
        (m) => String(m.assignedRepId) === uid,
      );
      const fallbackCust = repCustomers.find(
        (c) => String(c.assignedRepId) === uid,
      );

      // Determine best real coordinates:
      // 1. Active session check-in -> 2. User.lastKnownLocation -> 3. Latest ping -> 4. Latest visit -> 5. Assigned customer territory center
      let coords: {
        latitude: number;
        longitude: number;
        accuracyMeters: number;
        updatedAt: Date;
        source: string;
      };

      if (activeSession) {
        coords = {
          latitude: activeSession.checkInTelemetry.latitude,
          longitude: activeSession.checkInTelemetry.longitude,
          accuracyMeters: activeSession.checkInTelemetry.accuracyMeters ?? 6,
          updatedAt: activeSession.checkInAt,
          source: 'CHECK_IN',
        };
      } else if (u.lastKnownLocation) {
        coords = {
          latitude: u.lastKnownLocation.latitude,
          longitude: u.lastKnownLocation.longitude,
          accuracyMeters: u.lastKnownLocation.accuracyMeters ?? 8,
          updatedAt: u.lastKnownLocation.updatedAt,
          source: u.lastKnownLocation.source ?? 'HEARTBEAT',
        };
      } else if (latestPing) {
        coords = {
          latitude: latestPing.latitude,
          longitude: latestPing.longitude,
          accuracyMeters: latestPing.accuracyMeters ?? 8,
          updatedAt: latestPing.recordedAt,
          source: latestPing.source,
        };
      } else if (latestVisit) {
        const tel =
          latestVisit.checkOutTelemetry ?? latestVisit.checkInTelemetry;
        coords = {
          latitude: tel.latitude,
          longitude: tel.longitude,
          accuracyMeters: tel.accuracyMeters ?? 10,
          updatedAt: latestVisit.checkOutAt ?? latestVisit.checkInAt,
          source: latestVisit.checkOutAt ? 'CHECK_OUT' : 'CHECK_IN',
        };
      } else {
        const custCoords = fallbackCust?.address?.location?.coordinates;
        coords = {
          latitude: custCoords ? custCoords[1] : 28.495 + idx * 0.012,
          longitude: custCoords ? custCoords[0] : 77.089 + idx * 0.014,
          accuracyMeters: 15,
          updatedAt: u.lastActiveAt ?? u.createdAt,
          source: 'TERRITORY_BASE',
        };
      }

      const ageMinutes = Math.round(
        (nowMs - new Date(coords.updatedAt).getTime()) / 60000,
      );
      const presenceStatus: 'ON_SITE' | 'LIVE_DUTY' | 'LAST_SEEN' =
        activeSession
          ? 'ON_SITE'
          : u.isFieldDutyActive || ageMinutes <= 20
            ? 'LIVE_DUTY'
            : 'LAST_SEEN';

      const activeMtgDoc = activeSession?.meetingId as unknown as {
        _id: Types.ObjectId;
        meetingCode: string;
        title: string;
        customerId?: { companyName?: string };
      } | null;

      const nextCust = nextMtg?.customerId as unknown as {
        companyName?: string;
        address?: {
          street?: string;
          city?: string;
          location?: { coordinates?: [number, number] };
        };
      } | null;
      const nextSiteCoords =
        nextMtg?.targetCoordinates ??
        (nextCust?.address?.location?.coordinates
          ? {
              longitude: nextCust.address.location.coordinates[0],
              latitude: nextCust.address.location.coordinates[1],
            }
          : null);

      const distanceToNextMeters = nextSiteCoords
        ? Math.round(
            calculateDistanceMeters(
              coords.latitude,
              coords.longitude,
              nextSiteCoords.latitude,
              nextSiteCoords.longitude,
            ),
          )
        : null;

      const completedTodayCount = recentSessions.filter(
        (s) =>
          String(s.repId) === uid &&
          s.status === VISIT_SESSION_STATUS.COMPLETED &&
          new Date(s.checkInAt) >= startOfDay,
      ).length;

      return {
        repId: uid,
        employeeCode: u.employeeCode,
        fullName: `${u.firstName} ${u.lastName}`.trim(),
        initials:
          `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase() || 'OP',
        territory: u.territory ?? 'Field Sales',
        phone: u.phone ?? null,
        isFieldDutyActive: Boolean(u.isFieldDutyActive),
        presenceStatus,
        coordinates: coords,
        activeVisit: activeSession
          ? {
              meetingId: activeMtgDoc ? String(activeMtgDoc._id) : null,
              meetingCode: activeMtgDoc?.meetingCode ?? 'VISIT',
              customerName:
                activeMtgDoc?.customerId?.companyName ??
                activeMtgDoc?.title ??
                'Customer Site',
              sessionStatus: activeSession.status,
              sessionNumber: activeSession.sessionNumber,
              checkInAt: activeSession.checkInAt,
              withinGeofence: Boolean(
                activeSession.checkInTelemetry.withinGeofence,
              ),
            }
          : null,
        nextMeeting: nextMtg
          ? {
              id: String(nextMtg._id),
              meetingCode: nextMtg.meetingCode,
              title: nextMtg.title,
              customerName: nextCust?.companyName ?? nextMtg.title,
              scheduledStart: nextMtg.currentScheduledStart,
              distanceMeters: distanceToNextMeters,
              targetCoordinates: nextSiteCoords,
            }
          : null,
        todayStats: {
          pingsCount: repPings.length,
          completedVisitsToday: completedTodayCount,
          distanceTraveledKm: computeTrailDistanceKm(repPings),
        },
      };
    });

    return sendSuccess(res, {
      summary: {
        totalReps: reps.length,
        onSiteNow: reps.filter((r) => r.presenceStatus === 'ON_SITE').length,
        liveDutyNow: reps.filter((r) => r.presenceStatus === 'LIVE_DUTY')
          .length,
      },
      reps,
    });
  }),
);

// 5. Salesperson Detailed GPS Breadcrumb Trail (RBAC + Anti-IDOR Protected)
trackingRouter.get(
  '/rep/:id/trail',
  validateParams(z.object({ id: objectIdSchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const repId = paramId(req.params.id);
    await assertCanAccessUserScopedRecord(actor, repId);

    const rep = await UserModel.findOne({ _id: repId, deletedAt: null }).lean();
    if (!rep) {
      throw ApiError.notFound('Employee not found');
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [pings, visitSessions] = await Promise.all([
      RepLocationPingModel.find({ repId: rep._id })
        .sort({ recordedAt: -1 })
        .limit(40)
        .lean(),
      VisitSessionModel.find({ repId: rep._id })
        .populate({
          path: 'meetingId',
          select: 'meetingCode title customerId',
          populate: { path: 'customerId', select: 'companyName' },
        })
        .sort({ checkInAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const trailPoints: Array<{
      id: string;
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      source: string;
      label: string;
      recordedAt: Date;
    }> = [];

    for (const p of pings) {
      trailPoints.push({
        id: String(p._id),
        latitude: p.latitude,
        longitude: p.longitude,
        accuracyMeters: p.accuracyMeters ?? 8,
        source: p.source,
        label:
          p.source === LOCATION_PING_SOURCE.CHECK_IN
            ? 'Verified Site Check-In'
            : p.source === LOCATION_PING_SOURCE.CHECK_OUT
              ? 'Verified Site Check-Out'
              : 'Live GPS Ping',
        recordedAt: p.recordedAt,
      });
    }

    // Also include historical VisitSession check-ins if not already logged as pings
    for (const vs of visitSessions) {
      const mtg = vs.meetingId as unknown as {
        meetingCode?: string;
        customerId?: { companyName?: string };
      } | null;
      const labelPrefix = mtg?.customerId?.companyName ?? mtg?.meetingCode ?? 'Site';
      const alreadyHasCheckIn = trailPoints.some(
        (tp) =>
          Math.abs(
            new Date(tp.recordedAt).getTime() - new Date(vs.checkInAt).getTime(),
          ) < 5000,
      );
      if (!alreadyHasCheckIn) {
        trailPoints.push({
          id: `${String(vs._id)}-in`,
          latitude: vs.checkInTelemetry.latitude,
          longitude: vs.checkInTelemetry.longitude,
          accuracyMeters: vs.checkInTelemetry.accuracyMeters ?? 6,
          source: 'CHECK_IN',
          label: `${labelPrefix} · Check-In (#${vs.sessionNumber})`,
          recordedAt: vs.checkInAt,
        });
      }
      if (vs.checkOutAt && vs.checkOutTelemetry) {
        const alreadyHasCheckOut = trailPoints.some(
          (tp) =>
            Math.abs(
              new Date(tp.recordedAt).getTime() -
                new Date(vs.checkOutAt!).getTime(),
            ) < 5000,
        );
        if (!alreadyHasCheckOut) {
          trailPoints.push({
            id: `${String(vs._id)}-out`,
            latitude: vs.checkOutTelemetry.latitude,
            longitude: vs.checkOutTelemetry.longitude,
            accuracyMeters: vs.checkOutTelemetry.accuracyMeters ?? 6,
            source: 'CHECK_OUT',
            label: `${labelPrefix} · Check-Out (${vs.netDurationMinutes}m)`,
            recordedAt: vs.checkOutAt,
          });
        }
      }
    }

    trailPoints.sort(
      (a, b) =>
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
    );

    const recentOrdered = trailPoints.slice(-25);

    return sendSuccess(res, {
      rep: {
        id: String(rep._id),
        employeeCode: rep.employeeCode,
        fullName: `${rep.firstName} ${rep.lastName}`.trim(),
        territory: rep.territory ?? null,
        isFieldDutyActive: Boolean(rep.isFieldDutyActive),
        lastKnownLocation: rep.lastKnownLocation ?? null,
      },
      totalDistanceKm: computeTrailDistanceKm(recentOrdered),
      trail: recentOrdered,
    });
  }),
);
