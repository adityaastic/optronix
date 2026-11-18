import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { objectIdSchema } from '../../shared/index.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { registerSseClient } from '../../common/realtime.service.js';
import { paramId, sendSuccess } from '../../common/response.js';
import { authenticate, getAuthActor } from '../../middleware/auth.middleware.js';
import { validateParams } from '../../middleware/validate.middleware.js';
import { NotificationModel } from '../../models/Notification.model.js';

export const notificationsRouter: Router = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/stream', (req: Request, res: Response) => {
  const actor = getAuthActor(req);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ event: 'CONNECTED' })}\n\n`);

  const cleanup = registerSseClient({
    userId: String(actor.userId),
    roleCode: actor.roleCode,
    res,
  });

  req.on('close', cleanup);
});

notificationsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const docs = await NotificationModel.find({ recipientId: actor.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return sendSuccess(res, {
      notifications: docs.map((n) => ({
        id: String(n._id),
        type: n.type,
        title: n.title,
        message: n.message,
        entityType: n.entityType ?? null,
        entityId: n.entityId ?? null,
        isRead: n.isRead,
        readAt: n.readAt ?? null,
        createdAt: n.createdAt,
      })),
    });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    await NotificationModel.updateMany(
      { recipientId: actor.userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return sendSuccess(res, { updated: true });
  }),
);

notificationsRouter.post(
  '/:id/read',
  validateParams(z.object({ id: objectIdSchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    await NotificationModel.updateOne(
      { _id: paramId(req.params.id), recipientId: actor.userId },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return sendSuccess(res, { updated: true });
  }),
);
