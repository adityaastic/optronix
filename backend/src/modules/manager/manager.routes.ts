import { Router, type Request, type Response } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  FOLLOW_UP_STATUS,
  MEETING_STATUS,
  PERMISSIONS,
  USER_STATUS,
  objectIdSchema,
} from '../../shared/index.js';
import { ApiError } from '../../common/ApiError.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { paramId, sendSuccess } from '../../common/response.js';
import {
  authenticate,
  getAuthActor,
  type AuthenticatedActor,
} from '../../middleware/auth.middleware.js';
import {
  assertCanAccessUserScopedRecord,
  requirePermissions,
  resolveAuthorizedUserScope,
} from '../../middleware/rbac.middleware.js';
import { validateParams } from '../../middleware/validate.middleware.js';
import { FollowUpTaskModel } from '../../models/FollowUpTask.model.js';
import { MeetingModel } from '../../models/Meeting.model.js';
import { MeetingOutcomeModel } from '../../models/MeetingOutcome.model.js';
import { UserModel } from '../../models/User.model.js';
import { VisitSessionModel } from '../../models/VisitSession.model.js';

export async function getTeamActivityDashboard(actor: AuthenticatedActor) {
  const scope = await resolveAuthorizedUserScope(actor);

  const userFilter: Record<string, unknown> = {
    deletedAt: null,
    status: USER_STATUS.ACTIVE,
  };
  if (scope.allowedUserIds !== null) {
    userFilter._id = { $in: scope.allowedUserIds };
  }

  const teamUsers = await UserModel.find(userFilter)
    .sort({ firstName: 1 })
    .lean();
  const teamUserIds = teamUsers.map((u) => u._id);

  const meetingScope = {
    isDeleted: false,
    assignedRepId: { $in: teamUserIds },
  };

  const [allMeetings, openFollowUps, overdueFollowUps] = await Promise.all([
    MeetingModel.find(meetingScope)
      .populate('customerId', 'companyName customerCode tier')
      .populate('assignedRepId', 'firstName lastName employeeCode territory')
      .populate('outcomeId', 'outcomeType summary commercialSpecs')
      .sort({ currentScheduledStart: -1 })
      .lean(),
    FollowUpTaskModel.find({
      isDeleted: false,
      ownerId: { $in: teamUserIds },
      status: { $ne: FOLLOW_UP_STATUS.COMPLETED },
    }).lean(),
    FollowUpTaskModel.countDocuments({
      isDeleted: false,
      ownerId: { $in: teamUserIds },
      $or: [
        { status: FOLLOW_UP_STATUS.OVERDUE },
        {
          status: {
            $in: [FOLLOW_UP_STATUS.PENDING, FOLLOW_UP_STATUS.IN_PROGRESS],
          },
          dueDate: { $lt: new Date() },
        },
      ],
    }),
  ]);

  const completedMeetings = allMeetings.filter(
    (m) => m.status === MEETING_STATUS.COMPLETED,
  );
  const activeVisitsNow = allMeetings.filter((m) =>
    [
      MEETING_STATUS.CHECKED_IN,
      MEETING_STATUS.IN_PROGRESS,
      MEETING_STATUS.PAUSED,
    ].includes(m.status as typeof MEETING_STATUS.IN_PROGRESS),
  ).length;

  const repExecution = teamUsers.map((u) => {
    const uid = String(u._id);
    const repMtgs = allMeetings.filter(
      (m) => String((m.assignedRepId as { _id: Types.ObjectId })._id) === uid,
    );
    const repDone = repMtgs.filter(
      (m) => m.status === MEETING_STATUS.COMPLETED,
    ).length;
    const repFups = openFollowUps.filter(
      (f) => String(f.ownerId) === uid,
    ).length;

    return {
      id: uid,
      employeeCode: u.employeeCode,
      fullName: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      territory: u.territory ?? 'Enterprise Territory',
      department: u.department ?? 'Field Sales',
      totalMeetings: repMtgs.length,
      completedMeetings: repDone,
      openFollowUps: repFups,
      completionRate:
        repMtgs.length > 0
          ? Math.round((repDone / repMtgs.length) * 1000) / 10
          : 0,
      lastActiveAt: u.lastActiveAt ?? u.lastLoginAt ?? u.createdAt,
    };
  });

  // Outcome distribution
  const outcomeDocs = await MeetingOutcomeModel.find({
    meetingId: { $in: allMeetings.map((m) => m._id) },
  }).lean();

  const outcomeCounts: Record<string, number> = {};
  for (const o of outcomeDocs) {
    outcomeCounts[o.outcomeType] = (outcomeCounts[o.outcomeType] ?? 0) + 1;
  }
  const outcomeDistribution = Object.entries(outcomeCounts).map(
    ([outcomeType, count]) => ({
      outcomeType,
      count,
      percentage:
        outcomeDocs.length > 0
          ? Math.round((count / outcomeDocs.length) * 1000) / 10
          : 0,
    }),
  );

  // 14-Day Velocity Trend
  const velocityTrend: Array<{
    date: string;
    scheduled: number;
    completed: number;
  }> = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const dayMtgs = allMeetings.filter((m) => {
      const t = new Date(m.currentScheduledStart).getTime();
      return t >= dayStart.getTime() && t <= dayEnd.getTime();
    });
    velocityTrend.push({
      date: dayStart.toISOString().slice(5, 10),
      scheduled: dayMtgs.length,
      completed: dayMtgs.filter((m) => m.status === MEETING_STATUS.COMPLETED)
        .length,
    });
  }

  const liveMonitoring = allMeetings.slice(0, 25).map((m) => {
    const cust = m.customerId as unknown as {
      _id: Types.ObjectId;
      companyName: string;
      customerCode: string;
      tier: string;
    } | null;
    const rep = m.assignedRepId as unknown as {
      _id: Types.ObjectId;
      firstName: string;
      lastName: string;
      employeeCode: string;
    } | null;
    const out = m.outcomeId as unknown as {
      outcomeType: string;
      summary: string;
    } | null;

    return {
      id: String(m._id),
      meetingCode: m.meetingCode,
      title: m.title,
      status: m.status,
      scheduledStart: m.currentScheduledStart,
      scheduledEnd: m.currentScheduledEnd,
      firstCheckInAt: m.firstCheckInAt ?? null,
      lastCheckOutAt: m.lastCheckOutAt ?? null,
      totalActualDurationMinutes: m.totalActualDurationMinutes,
      visitSessionCount: m.visitSessionCount,
      reopenCount: m.reopenCount,
      customer: cust
        ? {
            id: String(cust._id),
            companyName: cust.companyName,
            customerCode: cust.customerCode,
            tier: cust.tier,
          }
        : null,
      assignedRep: rep
        ? {
            id: String(rep._id),
            fullName: `${rep.firstName} ${rep.lastName}`.trim(),
            employeeCode: rep.employeeCode,
          }
        : null,
      outcome: out
        ? {
            outcomeType: out.outcomeType,
            summary: out.summary,
          }
        : null,
    };
  });

  return {
    kpis: {
      teamTotalMeetings: allMeetings.length,
      activeVisitsNow,
      teamCompletionRate:
        allMeetings.length > 0
          ? Math.round((completedMeetings.length / allMeetings.length) * 1000) /
            10
          : 0,
      overdueTeamFollowUps: overdueFollowUps,
    },
    repExecution,
    outcomeDistribution,
    velocityTrend,
    liveMonitoring,
  };
}

export async function getEmployeeActivityDossier(
  actor: AuthenticatedActor,
  repId: string,
) {
  await assertCanAccessUserScopedRecord(actor, repId);

  const rep = await UserModel.findOne({ _id: repId, deletedAt: null }).lean();
  if (!rep) {
    throw ApiError.notFound('Employee not found');
  }

  const [meetings, latestSession, openTasks] = await Promise.all([
    MeetingModel.find({ assignedRepId: rep._id, isDeleted: false })
      .populate('customerId', 'companyName customerCode')
      .sort({ currentScheduledStart: -1 })
      .limit(8)
      .lean(),
    VisitSessionModel.findOne({ repId: rep._id })
      .sort({ checkInAt: -1 })
      .lean(),
    FollowUpTaskModel.find({
      ownerId: rep._id,
      isDeleted: false,
      status: { $ne: FOLLOW_UP_STATUS.COMPLETED },
    })
      .populate('customerId', 'companyName')
      .sort({ dueDate: 1 })
      .limit(5)
      .lean(),
  ]);

  return {
    rep: {
      id: String(rep._id),
      employeeCode: rep.employeeCode,
      fullName: `${rep.firstName} ${rep.lastName}`.trim(),
      email: rep.email,
      territory: rep.territory ?? null,
      department: rep.department ?? null,
    },
    recentMeetings: meetings.map((m) => {
      const cust = m.customerId as unknown as { companyName: string } | null;
      return {
        id: String(m._id),
        meetingCode: m.meetingCode,
        title: m.title,
        customerName: cust?.companyName ?? 'Account',
        status: m.status,
        scheduledStart: m.currentScheduledStart,
        totalActualDurationMinutes: m.totalActualDurationMinutes,
      };
    }),
    latestTelemetry: latestSession
      ? {
          sessionNumber: latestSession.sessionNumber,
          status: latestSession.status,
          checkInAt: latestSession.checkInAt,
          coordinates: latestSession.checkInTelemetry,
        }
      : null,
    pendingFollowUps: openTasks.map((f) => {
      const cust = f.customerId as unknown as { companyName: string } | null;
      return {
        id: String(f._id),
        taskCode: f.taskCode,
        title: f.title,
        customerName: cust?.companyName ?? 'Account',
        dueDate: f.dueDate,
        priority: f.priority,
        status: f.status,
      };
    }),
  };
}

export const managerRouter: Router = Router();
managerRouter.use(authenticate);

managerRouter.get(
  '/team-activity',
  requirePermissions(PERMISSIONS.TEAM_READ),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const data = await getTeamActivityDashboard(actor);
    return sendSuccess(res, data);
  }),
);

managerRouter.get(
  '/employees/:id',
  requirePermissions(PERMISSIONS.TEAM_READ),
  validateParams(z.object({ id: objectIdSchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const dossier = await getEmployeeActivityDossier(
      actor,
      paramId(req.params.id),
    );
    return sendSuccess(res, dossier);
  }),
);
