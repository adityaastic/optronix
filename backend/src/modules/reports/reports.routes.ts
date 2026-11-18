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
import { asyncHandler } from '../../common/asyncHandler.js';
import { sendSuccess } from '../../common/response.js';
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
import { validateQuery } from '../../middleware/validate.middleware.js';
import { FollowUpTaskModel } from '../../models/FollowUpTask.model.js';
import { MeetingModel } from '../../models/Meeting.model.js';
import { MeetingOutcomeModel } from '../../models/MeetingOutcome.model.js';
import { UserModel } from '../../models/User.model.js';
import { VisitSessionModel } from '../../models/VisitSession.model.js';

const reportsQuerySchema = z.object({
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  employeeId: objectIdSchema.optional(),
  territory: z.string().trim().max(120).optional(),
});

type ReportsQuery = z.infer<typeof reportsQuerySchema>;

export async function getComprehensiveAnalytics(
  actor: AuthenticatedActor,
  query: ReportsQuery,
) {
  const scope = await resolveAuthorizedUserScope(actor);

  const userFilter: Record<string, unknown> = {
    deletedAt: null,
    status: USER_STATUS.ACTIVE,
  };
  if (scope.allowedUserIds !== null) {
    userFilter._id = { $in: scope.allowedUserIds };
  }
  if (query.employeeId) {
    await assertCanAccessUserScopedRecord(actor, query.employeeId);
    userFilter._id = query.employeeId;
  }
  if (query.territory) {
    const escaped = query.territory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    userFilter.territory = new RegExp(escaped, 'i');
  }

  const scopedUsers = await UserModel.find(userFilter)
    .sort({ firstName: 1 })
    .lean();
  const scopedUserIds = scopedUsers.map((u) => u._id);

  const meetingFilter: Record<string, unknown> = {
    isDeleted: false,
    assignedRepId: { $in: scopedUserIds },
  };
  if (query.fromDate || query.toDate) {
    const dateRange: Record<string, Date> = {};
    if (query.fromDate) dateRange.$gte = query.fromDate;
    if (query.toDate) dateRange.$lte = query.toDate;
    meetingFilter.currentScheduledStart = dateRange;
  }

  const meetings = await MeetingModel.find(meetingFilter).lean();
  const meetingIds = meetings.map((m) => m._id);

  const [outcomes, sessions, followUps] = await Promise.all([
    MeetingOutcomeModel.find({ meetingId: { $in: meetingIds } }).lean(),
    VisitSessionModel.find({ meetingId: { $in: meetingIds } }).lean(),
    FollowUpTaskModel.find({
      isDeleted: false,
      ownerId: { $in: scopedUserIds },
    }).lean(),
  ]);

  const totalMeetings = meetings.length;
  const completedMeetings = meetings.filter(
    (m) => m.status === MEETING_STATUS.COMPLETED,
  );
  const completedWithDuration = completedMeetings.filter(
    (m) => m.totalActualDurationMinutes > 0,
  );
  const avgVisitDurationMinutes =
    completedWithDuration.length > 0
      ? Math.round(
          completedWithDuration.reduce(
            (sum, m) => sum + m.totalActualDurationMinutes,
            0,
          ) / completedWithDuration.length,
        )
      : 0;

  const completedFollowUps = followUps.filter(
    (f) => f.status === FOLLOW_UP_STATUS.COMPLETED,
  ).length;
  const followUpCompletionRatePercent =
    followUps.length > 0
      ? Math.round((completedFollowUps / followUps.length) * 1000) / 10
      : 0;

  // 1. Status Breakdown
  const statusMap: Record<string, number> = {};
  for (const m of meetings) {
    statusMap[m.status] = (statusMap[m.status] ?? 0) + 1;
  }
  const statusBreakdown = Object.entries(statusMap).map(([status, count]) => ({
    status,
    count,
    percentage:
      totalMeetings > 0 ? Math.round((count / totalMeetings) * 1000) / 10 : 0,
  }));

  // 2. Daily Timeline (Last 14 days or within range)
  const timelineMap = new Map<
    string,
    { date: string; scheduled: number; completed: number }
  >();
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    timelineMap.set(key, { date: key.slice(5), scheduled: 0, completed: 0 });
  }
  for (const m of meetings) {
    const key = new Date(m.currentScheduledStart).toISOString().slice(0, 10);
    const bucket = timelineMap.get(key) ?? {
      date: key.slice(5),
      scheduled: 0,
      completed: 0,
    };
    bucket.scheduled += 1;
    if (m.status === MEETING_STATUS.COMPLETED) {
      bucket.completed += 1;
    }
    timelineMap.set(key, bucket);
  }

  // 3. Outcome Analysis
  const outcomeStats = new Map<
    string,
    { count: number; estimatedPipelineValue: number }
  >();
  for (const o of outcomes) {
    const cur = outcomeStats.get(o.outcomeType) ?? {
      count: 0,
      estimatedPipelineValue: 0,
    };
    cur.count += 1;
    cur.estimatedPipelineValue += o.commercialSpecs?.estimatedValue ?? 0;
    outcomeStats.set(o.outcomeType, cur);
  }
  const outcomeAnalysis = Array.from(outcomeStats.entries()).map(
    ([outcomeType, val]) => ({
      outcomeType,
      count: val.count,
      percentage:
        outcomes.length > 0
          ? Math.round((val.count / outcomes.length) * 1000) / 10
          : 0,
      estimatedPipelineValue: val.estimatedPipelineValue,
    }),
  );

  // 4. Visit Analytics
  const geofenceCompliantCount = sessions.filter(
    (s) => s.checkInTelemetry?.withinGeofence !== false,
  ).length;
  const completedSessions = sessions.filter((s) => s.status === 'COMPLETED');
  const avgSessionMinutes =
    completedSessions.length > 0
      ? Math.round(
          completedSessions.reduce((acc, s) => acc + s.netDurationMinutes, 0) /
            completedSessions.length,
        )
      : 0;
  const multiSessionMeetingsCount = meetings.filter(
    (m) => m.visitSessionCount > 1,
  ).length;
  const pausedSessionsCount = sessions.filter(
    (s) => s.pauseSegments && s.pauseSegments.length > 0,
  ).length;

  // 5. Follow-up Analytics
  const priorityMap: Record<string, number> = {};
  for (const f of followUps) {
    priorityMap[f.priority] = (priorityMap[f.priority] ?? 0) + 1;
  }

  // 6. Employee Performance Table
  const employeePerformance = scopedUsers.map((u) => {
    const uid = String(u._id);
    const empMtgs = meetings.filter(
      (m) => String(m.assignedRepId as Types.ObjectId) === uid,
    );
    const empCompleted = empMtgs.filter(
      (m) => m.status === MEETING_STATUS.COMPLETED,
    );
    const empRescheduled = empMtgs.filter(
      (m) => m.currentScheduleRevision > 1,
    ).length;
    const empAvgDur =
      empCompleted.length > 0
        ? Math.round(
            empCompleted.reduce(
              (acc, m) => acc + m.totalActualDurationMinutes,
              0,
            ) / empCompleted.length,
          )
        : 0;
    const empFups = followUps.filter((f) => String(f.ownerId) === uid);
    const empFupsDone = empFups.filter(
      (f) => f.status === FOLLOW_UP_STATUS.COMPLETED,
    ).length;

    return {
      id: uid,
      employeeCode: u.employeeCode,
      fullName: `${u.firstName} ${u.lastName}`.trim(),
      territory: u.territory ?? 'Enterprise Territory',
      totalMeetings: empMtgs.length,
      completedMeetings: empCompleted.length,
      rescheduledMeetings: empRescheduled,
      avgDurationMinutes: empAvgDur,
      followUpsCreated: empFups.length,
      followUpsCompleted: empFupsDone,
      completionSlaPercent:
        empMtgs.length > 0
          ? Math.round((empCompleted.length / empMtgs.length) * 1000) / 10
          : 0,
    };
  });

  return {
    kpis: {
      totalMeetings,
      completedMeetings: completedMeetings.length,
      completionRatePercent:
        totalMeetings > 0
          ? Math.round((completedMeetings.length / totalMeetings) * 1000) / 10
          : 0,
      avgVisitDurationMinutes,
      followUpCompletionRatePercent,
    },
    meetingAnalytics: {
      timeline: Array.from(timelineMap.values()),
      statusBreakdown,
    },
    outcomeAnalysis,
    visitAnalytics: {
      totalSessions: sessions.length,
      geofenceComplianceRatePercent:
        sessions.length > 0
          ? Math.round((geofenceCompliantCount / sessions.length) * 1000) / 10
          : 100,
      avgSessionMinutes,
      multiSessionMeetingsCount,
      pausedSessionsCount,
    },
    followUpAnalytics: {
      total: followUps.length,
      completed: completedFollowUps,
      overdue: followUps.filter((f) => f.status === FOLLOW_UP_STATUS.OVERDUE)
        .length,
      pending: followUps.filter((f) => f.status === FOLLOW_UP_STATUS.PENDING)
        .length,
      inProgress: followUps.filter(
        (f) => f.status === FOLLOW_UP_STATUS.IN_PROGRESS,
      ).length,
      byPriority: priorityMap,
    },
    employeePerformance,
  };
}

export const reportsRouter: Router = Router();
reportsRouter.use(authenticate);

reportsRouter.get(
  '/analytics',
  requirePermissions(PERMISSIONS.REPORTS_PERSONAL),
  validateQuery(reportsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const data = await getComprehensiveAnalytics(
      actor,
      req.validatedQuery as ReportsQuery,
    );
    return sendSuccess(res, data);
  }),
);
