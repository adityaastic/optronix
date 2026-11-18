import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  addFollowUpCommentSchema,
  createFollowUpSchema,
  followUpListQuerySchema,
  objectIdSchema,
  reassignFollowUpSchema,
  updateFollowUpSchema,
  type FollowUpListQuery,
} from '../../shared/index.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { paramId, sendSuccess } from '../../common/response.js';
import { authenticate, getAuthActor } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.middleware.js';
import {
  addFollowUpComment,
  completeFollowUp,
  createFollowUp,
  getFollowUpDetails,
  listFollowUps,
  reassignFollowUp,
  updateFollowUp,
} from './followups.service.js';

const idParamSchema = z.object({ id: objectIdSchema });

export const followUpsRouter: Router = Router();

followUpsRouter.use(authenticate);

followUpsRouter.get(
  '/',
  requirePermissions(PERMISSIONS.FOLLOWUPS_READ),
  validateQuery(followUpListQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const result = await listFollowUps(
      actor,
      req.validatedQuery as FollowUpListQuery,
    );
    return sendSuccess(
      res,
      { followUps: result.items, stats: result.stats },
      200,
      result.pagination,
    );
  }),
);

followUpsRouter.post(
  '/',
  requirePermissions(PERMISSIONS.FOLLOWUPS_CREATE),
  validateBody(createFollowUpSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const followUp = await createFollowUp(actor, req.body, req.ip ?? null);
    return sendSuccess(res, { followUp }, 201);
  }),
);

followUpsRouter.get(
  '/:id',
  requirePermissions(PERMISSIONS.FOLLOWUPS_READ),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const followUp = await getFollowUpDetails(actor, paramId(req.params.id));
    return sendSuccess(res, { followUp });
  }),
);

followUpsRouter.patch(
  '/:id',
  requirePermissions(PERMISSIONS.FOLLOWUPS_UPDATE),
  validateParams(idParamSchema),
  validateBody(updateFollowUpSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const followUp = await updateFollowUp(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { followUp });
  }),
);

followUpsRouter.post(
  '/:id/complete',
  requirePermissions(PERMISSIONS.FOLLOWUPS_COMPLETE),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const followUp = await completeFollowUp(
      actor,
      paramId(req.params.id),
      req.ip ?? null,
    );
    return sendSuccess(res, { followUp });
  }),
);

followUpsRouter.post(
  '/:id/comments',
  requirePermissions(PERMISSIONS.FOLLOWUPS_UPDATE),
  validateParams(idParamSchema),
  validateBody(addFollowUpCommentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const followUp = await addFollowUpComment(
      actor,
      paramId(req.params.id),
      req.body.body,
    );
    return sendSuccess(res, { followUp });
  }),
);

followUpsRouter.post(
  '/:id/reassign',
  requirePermissions(PERMISSIONS.FOLLOWUPS_REASSIGN),
  validateParams(idParamSchema),
  validateBody(reassignFollowUpSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const followUp = await reassignFollowUp(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { followUp });
  }),
);
