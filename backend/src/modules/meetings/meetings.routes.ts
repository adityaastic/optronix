import { Router } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  cancelMeetingSchema,
  checkInMeetingSchema,
  checkOutMeetingSchema,
  createMeetingSchema,
  meetingListQuerySchema,
  objectIdSchema,
  pauseVisitSchema,
  reassignMeetingSchema,
  recordMeetingOutcomeSchema,
  reopenMeetingSchema,
  rescheduleMeetingSchema,
  resumeVisitSchema,
  updateMeetingSchema,
} from '../../shared/index.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.middleware.js';
import {
  cancelMeetingController,
  checkConflictsController,
  checkInMeetingController,
  checkOutMeetingController,
  completeMeetingController,
  confirmMeetingController,
  conflictCheckQuerySchema,
  createMeetingController,
  dashboardSummaryController,
  getMeetingDetailsController,
  listMeetingsController,
  pauseVisitController,
  reassignMeetingController,
  recordOutcomeController,
  reopenMeetingController,
  rescheduleMeetingController,
  resumeVisitController,
  updateMeetingController,
} from './meetings.controller.js';

const idParamSchema = z.object({ id: objectIdSchema });

export const meetingsRouter: Router = Router();

meetingsRouter.use(authenticate);

meetingsRouter.get(
  '/dashboard-summary',
  requirePermissions(PERMISSIONS.MEETINGS_READ),
  dashboardSummaryController,
);

meetingsRouter.get(
  '/conflicts',
  requirePermissions(PERMISSIONS.MEETINGS_READ),
  validateQuery(conflictCheckQuerySchema),
  checkConflictsController,
);

meetingsRouter.get(
  '/',
  requirePermissions(PERMISSIONS.MEETINGS_READ),
  validateQuery(meetingListQuerySchema),
  listMeetingsController,
);

meetingsRouter.post(
  '/',
  requirePermissions(PERMISSIONS.MEETINGS_CREATE),
  validateBody(createMeetingSchema),
  createMeetingController,
);

meetingsRouter.get(
  '/:id',
  requirePermissions(PERMISSIONS.MEETINGS_READ),
  validateParams(idParamSchema),
  getMeetingDetailsController,
);

meetingsRouter.patch(
  '/:id',
  requirePermissions(PERMISSIONS.MEETINGS_UPDATE),
  validateParams(idParamSchema),
  validateBody(updateMeetingSchema),
  updateMeetingController,
);

meetingsRouter.post(
  '/:id/confirm',
  requirePermissions(PERMISSIONS.MEETINGS_CONFIRM),
  validateParams(idParamSchema),
  confirmMeetingController,
);

meetingsRouter.post(
  '/:id/cancel',
  requirePermissions(PERMISSIONS.MEETINGS_CANCEL),
  validateParams(idParamSchema),
  validateBody(cancelMeetingSchema),
  cancelMeetingController,
);

meetingsRouter.post(
  '/:id/check-in',
  requirePermissions(PERMISSIONS.MEETINGS_CHECKIN),
  validateParams(idParamSchema),
  validateBody(checkInMeetingSchema),
  checkInMeetingController,
);

meetingsRouter.post(
  '/:id/pause',
  requirePermissions(PERMISSIONS.MEETINGS_PAUSE_RESUME),
  validateParams(idParamSchema),
  validateBody(pauseVisitSchema),
  pauseVisitController,
);

meetingsRouter.post(
  '/:id/resume',
  requirePermissions(PERMISSIONS.MEETINGS_PAUSE_RESUME),
  validateParams(idParamSchema),
  validateBody(resumeVisitSchema),
  resumeVisitController,
);

meetingsRouter.post(
  '/:id/check-out',
  requirePermissions(PERMISSIONS.MEETINGS_CHECKOUT),
  validateParams(idParamSchema),
  validateBody(checkOutMeetingSchema),
  checkOutMeetingController,
);

meetingsRouter.post(
  '/:id/reschedule',
  requirePermissions(PERMISSIONS.MEETINGS_RESCHEDULE),
  validateParams(idParamSchema),
  validateBody(rescheduleMeetingSchema),
  rescheduleMeetingController,
);

meetingsRouter.post(
  '/:id/outcome',
  requirePermissions(PERMISSIONS.MEETINGS_RECORD_OUTCOME),
  validateParams(idParamSchema),
  validateBody(recordMeetingOutcomeSchema),
  recordOutcomeController,
);

meetingsRouter.post(
  '/:id/complete',
  requirePermissions(PERMISSIONS.MEETINGS_RECORD_OUTCOME),
  validateParams(idParamSchema),
  completeMeetingController,
);

meetingsRouter.post(
  '/:id/reopen',
  requirePermissions(PERMISSIONS.MEETINGS_REOPEN),
  validateParams(idParamSchema),
  validateBody(reopenMeetingSchema),
  reopenMeetingController,
);

meetingsRouter.post(
  '/:id/reassign',
  requirePermissions(PERMISSIONS.MEETINGS_REASSIGN),
  validateParams(idParamSchema),
  validateBody(reassignMeetingSchema),
  reassignMeetingController,
);
