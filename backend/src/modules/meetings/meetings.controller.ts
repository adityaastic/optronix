import type { Request, Response } from 'express';
import { z } from 'zod';
import { objectIdSchema, type MeetingListQuery } from '../../shared/index.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { paramId, sendSuccess } from '../../common/response.js';
import { getAuthActor } from '../../middleware/auth.middleware.js';
import { assertCanAccessUserScopedRecord } from '../../middleware/rbac.middleware.js';
import {
  cancelMeeting,
  confirmMeeting,
  createMeeting,
  findOverlappingMeetings,
  getMeetingDetails,
  getOverviewDashboard,
  listMeetings,
  updateMeeting,
} from './meetings.service.js';
import {
  checkInMeeting,
  checkOutMeeting,
  pauseVisitSession,
  rescheduleMeeting,
  resumeVisitSession,
} from './lifecycle.service.js';
import {
  completeMeetingExplicit,
  reassignMeeting,
  recordMeetingOutcome,
  reopenCompletedMeeting,
} from '../outcomes/outcomes.service.js';

export const dashboardSummaryController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const dashboard = await getOverviewDashboard(actor);
    return sendSuccess(res, dashboard);
  },
);

export const conflictCheckQuerySchema = z.object({
  repId: objectIdSchema.optional(),
  start: z.coerce.date(),
  end: z.coerce.date(),
  excludeMeetingId: objectIdSchema.optional(),
});

export const checkConflictsController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const query = req.validatedQuery as z.infer<typeof conflictCheckQuerySchema>;
    const targetRepId = query.repId ?? String(actor.userId);
    await assertCanAccessUserScopedRecord(actor, targetRepId);
    const conflicts = await findOverlappingMeetings(
      targetRepId,
      query.start,
      query.end,
      query.excludeMeetingId,
    );
    return sendSuccess(res, { conflicts });
  },
);

export const createMeetingController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const result = await createMeeting(actor, req.body, req.ip ?? null);
    return sendSuccess(res, result, 201);
  },
);

export const listMeetingsController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const query = req.validatedQuery as MeetingListQuery;
    const result = await listMeetings(actor, query);
    return sendSuccess(
      res,
      { meetings: result.items, stats: result.stats },
      200,
      result.pagination,
    );
  },
);

export const getMeetingDetailsController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await getMeetingDetails(actor, paramId(req.params.id));
    return sendSuccess(res, { meeting });
  },
);

export const updateMeetingController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await updateMeeting(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { meeting });
  },
);

export const confirmMeetingController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await confirmMeeting(actor, paramId(req.params.id), req.ip ?? null);
    return sendSuccess(res, { meeting });
  },
);

export const cancelMeetingController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await cancelMeeting(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { meeting });
  },
);

export const checkInMeetingController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await checkInMeeting(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { meeting });
  },
);

export const pauseVisitController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await pauseVisitSession(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { meeting });
  },
);

export const resumeVisitController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await resumeVisitSession(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { meeting });
  },
);

export const checkOutMeetingController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await checkOutMeeting(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { meeting });
  },
);

export const rescheduleMeetingController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await rescheduleMeeting(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { meeting });
  },
);

export const recordOutcomeController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await recordMeetingOutcome(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { meeting });
  },
);

export const completeMeetingController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await completeMeetingExplicit(
      actor,
      paramId(req.params.id),
      req.ip ?? null,
    );
    return sendSuccess(res, { meeting });
  },
);

export const reopenMeetingController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await reopenCompletedMeeting(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { meeting });
  },
);

export const reassignMeetingController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const meeting = await reassignMeeting(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { meeting });
  },
);
