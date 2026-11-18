import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler.js';
import { sendSuccess } from '../../common/response.js';
import { authenticate, getAuthActor } from '../../middleware/auth.middleware.js';
import { resolveAuthorizedUserScope } from '../../middleware/rbac.middleware.js';
import { validateQuery } from '../../middleware/validate.middleware.js';
import { ContactModel } from '../../models/Contact.model.js';
import { CustomerModel } from '../../models/Customer.model.js';
import { FollowUpTaskModel } from '../../models/FollowUpTask.model.js';
import { MeetingModel } from '../../models/Meeting.model.js';

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
});

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const searchRouter: Router = Router();
searchRouter.use(authenticate);

searchRouter.get(
  '/',
  validateQuery(searchQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const { q } = req.validatedQuery as z.infer<typeof searchQuerySchema>;
    const rx = new RegExp(escapeRegex(q), 'i');

    const scope = await resolveAuthorizedUserScope(actor);
    const isGlobal = scope.scope === 'ALL' || !scope.allowedUserIds;
    const meetingScope = isGlobal
      ? {}
      : { assignedRepId: { $in: scope.allowedUserIds } };
    const customerScope = isGlobal
      ? {}
      : { assignedRepId: { $in: scope.allowedUserIds } };
    const followUpScope = isGlobal
      ? {}
      : { ownerId: { $in: scope.allowedUserIds } };

    const [meetings, customers, followUps] = await Promise.all([
      MeetingModel.find({
        isDeleted: false,
        ...meetingScope,
        $or: [{ title: rx }, { meetingCode: rx }, { locationText: rx }],
      })
        .populate('customerId', 'companyName')
        .sort({ currentScheduledStart: -1 })
        .limit(5)
        .lean(),
      CustomerModel.find({
        isArchived: false,
        ...customerScope,
        $or: [
          { companyName: rx },
          { customerCode: rx },
          { industry: rx },
          { 'address.city': rx },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      FollowUpTaskModel.find({
        isDeleted: false,
        ...followUpScope,
        $or: [{ title: rx }, { taskCode: rx }],
      })
        .populate('customerId', 'companyName')
        .sort({ dueDate: 1 })
        .limit(5)
        .lean(),
    ]);

    // Contacts scoped strictly to accessible customers
    let accessibleCustomerIds = customers.map((c) => c._id);
    if (!isGlobal && accessibleCustomerIds.length === 0) {
      const scopedCusts = await CustomerModel.find(
        { isArchived: false, ...customerScope },
        { _id: 1 },
      )
        .limit(200)
        .lean();
      accessibleCustomerIds = scopedCusts.map((c) => c._id);
    }

    const contacts = await ContactModel.find({
      ...(isGlobal ? {} : { customerId: { $in: accessibleCustomerIds } }),
      $or: [{ fullName: rx }, { email: rx }, { phone: rx }],
    })
      .populate('customerId', 'companyName')
      .limit(5)
      .lean();

    return sendSuccess(res, {
      meetings: meetings.map((m) => ({
        id: String(m._id),
        code: m.meetingCode,
        title: m.title,
        subtitle:
          (m.customerId as { companyName?: string } | null)?.companyName ??
          m.locationText,
        status: m.status,
        href: `/meetings/${String(m._id)}`,
      })),
      customers: customers.map((c) => ({
        id: String(c._id),
        code: c.customerCode,
        title: c.companyName,
        subtitle: `${c.industry} · ${c.address.city}`,
        status: c.status,
        href: `/customers?search=${encodeURIComponent(c.companyName)}`,
      })),
      contacts: contacts.map((ct) => ({
        id: String(ct._id),
        title: ct.fullName,
        subtitle: `${(ct.customerId as { companyName?: string } | null)?.companyName ?? 'Account'} · ${ct.email}`,
        href: `/customers?search=${encodeURIComponent((ct.customerId as { companyName?: string } | null)?.companyName ?? ct.fullName)}`,
      })),
      followUps: followUps.map((f) => ({
        id: String(f._id),
        code: f.taskCode,
        title: f.title,
        subtitle:
          (f.customerId as { companyName?: string } | null)?.companyName ??
          f.taskCode,
        status: f.status,
        href: `/follow-ups`,
      })),
    });
  }),
);
