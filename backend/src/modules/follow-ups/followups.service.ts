import type { Types } from 'mongoose';
import {
  FOLLOW_UP_STATUS,
  ROLE_CODES,
  type CreateFollowUpInput,
  type FollowUpListQuery,
  type ReassignFollowUpInput,
  type UpdateFollowUpInput,
} from '../../shared/index.js';
import { ApiError } from '../../common/ApiError.js';
import { generateEntityCode, writeAuditLog } from '../../common/audit.service.js';
import { buildPaginationMeta } from '../../common/response.js';
import type { AuthenticatedActor } from '../../middleware/auth.middleware.js';
import {
  assertCanAccessUserScopedRecord,
  resolveAuthorizedUserScope,
} from '../../middleware/rbac.middleware.js';
import { CustomerModel } from '../../models/Customer.model.js';
import { FollowUpTaskModel } from '../../models/FollowUpTask.model.js';
import { MeetingModel } from '../../models/Meeting.model.js';
import { NotificationModel } from '../../models/Notification.model.js';
import { UserModel } from '../../models/User.model.js';

export async function createFollowUp(
  actor: AuthenticatedActor,
  input: CreateFollowUpInput,
  ipAddress?: string | null,
) {
  const customer = await CustomerModel.findById(input.customerId).lean();
  if (!customer || customer.isArchived) {
    throw ApiError.badRequest('Valid active customer account is required');
  }
  await assertCanAccessUserScopedRecord(actor, customer.assignedRepId);

  if (
    actor.roleCode === ROLE_CODES.SALES_EMPLOYEE &&
    String(input.ownerId) !== String(actor.userId)
  ) {
    throw ApiError.forbidden(
      'Sales Employees can only assign new follow-ups to themselves',
    );
  }
  await assertCanAccessUserScopedRecord(actor, input.ownerId);

  if (input.meetingId) {
    const meeting = await MeetingModel.findOne({
      _id: input.meetingId,
      isDeleted: false,
    }).lean();
    if (!meeting) {
      throw ApiError.badRequest('Related meeting not found');
    }
    if (String(meeting.customerId) !== String(customer._id)) {
      throw ApiError.badRequest(
        'Related meeting does not belong to the selected customer account',
      );
    }
    await assertCanAccessUserScopedRecord(
      actor,
      meeting.assignedRepId,
      meeting.coHostIds,
    );
  }

  const taskCode = generateEntityCode('FUP');
  const task = await FollowUpTaskModel.create({
    taskCode,
    title: input.title,
    description: input.description,
    customerId: customer._id,
    meetingId: input.meetingId ?? null,
    ownerId: input.ownerId,
    assignedById: actor.userId,
    dueDate: input.dueDate,
    priority: input.priority,
    status:
      input.dueDate.getTime() < Date.now()
        ? FOLLOW_UP_STATUS.OVERDUE
        : FOLLOW_UP_STATUS.PENDING,
  });

  if (String(input.ownerId) !== String(actor.userId)) {
    await NotificationModel.create({
      recipientId: input.ownerId,
      type: 'FOLLOWUP_ASSIGNED',
      title: `Follow-up Assigned (${taskCode})`,
      message: `${actor.fullName} assigned "${input.title}" to you.`,
      entityType: 'FOLLOWUP',
      entityId: String(task._id),
    });
  }

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'FOLLOWUP_CREATED',
    entityType: 'FOLLOWUP',
    entityId: task._id,
    afterSnapshot: {
      taskCode,
      title: input.title,
      ownerId: String(input.ownerId),
      dueDate: input.dueDate.toISOString(),
    },
    ipAddress,
  });

  return getFollowUpDetails(actor, String(task._id));
}

export async function listFollowUps(
  actor: AuthenticatedActor,
  query: FollowUpListQuery,
) {
  const scope = await resolveAuthorizedUserScope(actor);

  // Sync overdue status for past-due open tasks within scope
  const baseScopeFilter: Record<string, unknown> = { isDeleted: false };
  if (scope.allowedUserIds !== null) {
    baseScopeFilter.ownerId = { $in: scope.allowedUserIds };
  }

  await FollowUpTaskModel.updateMany(
    {
      ...baseScopeFilter,
      status: { $in: [FOLLOW_UP_STATUS.PENDING, FOLLOW_UP_STATUS.IN_PROGRESS] },
      dueDate: { $lt: new Date() },
    },
    { $set: { status: FOLLOW_UP_STATUS.OVERDUE } },
  );

  const filter: Record<string, unknown> = { ...baseScopeFilter };
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.customerId) filter.customerId = query.customerId;
  if (query.meetingId) filter.meetingId = query.meetingId;
  if (query.ownerId) {
    await assertCanAccessUserScopedRecord(actor, query.ownerId);
    filter.ownerId = query.ownerId;
  }
  if (query.dueBefore || query.dueAfter) {
    const dueRange: Record<string, Date> = {};
    if (query.dueAfter) dueRange.$gte = query.dueAfter;
    if (query.dueBefore) dueRange.$lte = query.dueBefore;
    filter.dueDate = dueRange;
  }
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [{ title: regex }, { taskCode: regex }, { description: regex }];
  }

  const skip = (query.page - 1) * query.limit;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [total, docs, totalScope, dueTodayScope, overdueScope, completedScope] =
    await Promise.all([
      FollowUpTaskModel.countDocuments(filter),
      FollowUpTaskModel.find(filter)
        .populate('customerId', 'companyName customerCode')
        .populate('meetingId', 'meetingCode title')
        .populate('ownerId', 'firstName lastName email employeeCode')
        .populate('comments.authorId', 'firstName lastName employeeCode')
        .sort({ dueDate: 1 })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      FollowUpTaskModel.countDocuments(baseScopeFilter),
      FollowUpTaskModel.countDocuments({
        ...baseScopeFilter,
        status: { $ne: FOLLOW_UP_STATUS.COMPLETED },
        dueDate: { $gte: startOfToday, $lte: endOfToday },
      }),
      FollowUpTaskModel.countDocuments({
        ...baseScopeFilter,
        status: FOLLOW_UP_STATUS.OVERDUE,
      }),
      FollowUpTaskModel.countDocuments({
        ...baseScopeFilter,
        status: FOLLOW_UP_STATUS.COMPLETED,
      }),
    ]);

  const items = docs.map((f) => {
    const cust = f.customerId as unknown as {
      _id: Types.ObjectId;
      companyName: string;
      customerCode: string;
    } | null;
    const mtg = f.meetingId as unknown as {
      _id: Types.ObjectId;
      meetingCode: string;
      title: string;
    } | null;
    const owner = f.ownerId as unknown as {
      _id: Types.ObjectId;
      firstName: string;
      lastName: string;
      email: string;
      employeeCode: string;
    } | null;

    return {
      id: String(f._id),
      taskCode: f.taskCode,
      title: f.title,
      description: f.description ?? null,
      dueDate: f.dueDate,
      priority: f.priority,
      status: f.status,
      completedAt: f.completedAt ?? null,
      customer: cust
        ? {
            id: String(cust._id),
            companyName: cust.companyName,
            customerCode: cust.customerCode,
          }
        : null,
      meeting: mtg
        ? {
            id: String(mtg._id),
            meetingCode: mtg.meetingCode,
            title: mtg.title,
          }
        : null,
      owner: owner
        ? {
            id: String(owner._id),
            fullName: `${owner.firstName} ${owner.lastName}`.trim(),
            email: owner.email,
            employeeCode: owner.employeeCode,
          }
        : null,
      comments: f.comments.map((c) => {
        const auth = c.authorId as unknown as {
          firstName: string;
          lastName: string;
        } | null;
        return {
          authorName: auth
            ? `${auth.firstName} ${auth.lastName}`.trim()
            : 'Operator',
          body: c.body,
          createdAt: c.createdAt,
        };
      }),
      createdAt: f.createdAt,
    };
  });

  return {
    items,
    stats: {
      total: totalScope,
      dueToday: dueTodayScope,
      overdue: overdueScope,
      completed: completedScope,
    },
    pagination: buildPaginationMeta(total, query.page, query.limit),
  };
}

export async function getFollowUpDetails(
  actor: AuthenticatedActor,
  followUpId: string,
) {
  const doc = await FollowUpTaskModel.findOne({
    _id: followUpId,
    isDeleted: false,
  })
    .populate('customerId', 'companyName customerCode')
    .populate('meetingId', 'meetingCode title')
    .populate('ownerId', 'firstName lastName email employeeCode')
    .populate('comments.authorId', 'firstName lastName employeeCode')
    .lean();

  if (!doc) {
    throw ApiError.notFound('Follow-up task not found');
  }

  const owner = doc.ownerId as unknown as {
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    email: string;
    employeeCode: string;
  };

  await assertCanAccessUserScopedRecord(actor, owner._id);

  const cust = doc.customerId as unknown as {
    _id: Types.ObjectId;
    companyName: string;
    customerCode: string;
  } | null;
  const mtg = doc.meetingId as unknown as {
    _id: Types.ObjectId;
    meetingCode: string;
    title: string;
  } | null;

  return {
    id: String(doc._id),
    taskCode: doc.taskCode,
    title: doc.title,
    description: doc.description ?? null,
    dueDate: doc.dueDate,
    priority: doc.priority,
    status: doc.status,
    completedAt: doc.completedAt ?? null,
    customer: cust
      ? {
          id: String(cust._id),
          companyName: cust.companyName,
          customerCode: cust.customerCode,
        }
      : null,
    meeting: mtg
      ? {
          id: String(mtg._id),
          meetingCode: mtg.meetingCode,
          title: mtg.title,
        }
      : null,
    owner: {
      id: String(owner._id),
      fullName: `${owner.firstName} ${owner.lastName}`.trim(),
      email: owner.email,
      employeeCode: owner.employeeCode,
    },
    comments: doc.comments.map((c) => {
      const auth = c.authorId as unknown as {
        firstName: string;
        lastName: string;
      } | null;
      return {
        authorName: auth
          ? `${auth.firstName} ${auth.lastName}`.trim()
          : 'Operator',
        body: c.body,
        createdAt: c.createdAt,
      };
    }),
    createdAt: doc.createdAt,
  };
}

export async function updateFollowUp(
  actor: AuthenticatedActor,
  followUpId: string,
  input: UpdateFollowUpInput,
  ipAddress?: string | null,
) {
  const task = await FollowUpTaskModel.findOne({
    _id: followUpId,
    isDeleted: false,
  });
  if (!task) {
    throw ApiError.notFound('Follow-up task not found');
  }

  await assertCanAccessUserScopedRecord(actor, task.ownerId);

  if (input.title !== undefined) task.title = input.title;
  if (input.description !== undefined) task.description = input.description;
  if (input.dueDate !== undefined) task.dueDate = input.dueDate;
  if (input.priority !== undefined) task.priority = input.priority;
  if (input.status !== undefined) {
    task.status = input.status;
    if (input.status === FOLLOW_UP_STATUS.COMPLETED) {
      task.completedAt = new Date();
      task.completedBy = actor.userId;
    }
  }

  await task.save();

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'FOLLOWUP_UPDATED',
    entityType: 'FOLLOWUP',
    entityId: task._id,
    ipAddress,
  });

  return getFollowUpDetails(actor, String(task._id));
}

export async function completeFollowUp(
  actor: AuthenticatedActor,
  followUpId: string,
  ipAddress?: string | null,
) {
  const task = await FollowUpTaskModel.findOne({
    _id: followUpId,
    isDeleted: false,
  });
  if (!task) {
    throw ApiError.notFound('Follow-up task not found');
  }

  await assertCanAccessUserScopedRecord(actor, task.ownerId);

  task.status = FOLLOW_UP_STATUS.COMPLETED;
  task.completedAt = new Date();
  task.completedBy = actor.userId;
  await task.save();

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'FOLLOWUP_COMPLETED',
    entityType: 'FOLLOWUP',
    entityId: task._id,
    ipAddress,
  });

  return getFollowUpDetails(actor, String(task._id));
}

export async function addFollowUpComment(
  actor: AuthenticatedActor,
  followUpId: string,
  body: string,
) {
  const task = await FollowUpTaskModel.findOne({
    _id: followUpId,
    isDeleted: false,
  });
  if (!task) {
    throw ApiError.notFound('Follow-up task not found');
  }

  await assertCanAccessUserScopedRecord(actor, task.ownerId);

  task.comments.push({
    authorId: actor.userId,
    body,
    createdAt: new Date(),
  });
  await task.save();

  return getFollowUpDetails(actor, String(task._id));
}

export async function reassignFollowUp(
  actor: AuthenticatedActor,
  followUpId: string,
  input: ReassignFollowUpInput,
  ipAddress?: string | null,
) {
  const task = await FollowUpTaskModel.findOne({
    _id: followUpId,
    isDeleted: false,
  });
  if (!task) {
    throw ApiError.notFound('Follow-up task not found');
  }

  await assertCanAccessUserScopedRecord(actor, task.ownerId);
  await assertCanAccessUserScopedRecord(actor, input.newOwnerId);

  const newOwner = await UserModel.findOne({
    _id: input.newOwnerId,
    deletedAt: null,
  }).lean();
  if (!newOwner) {
    throw ApiError.badRequest('Target owner does not exist');
  }

  const prevOwnerId = String(task.ownerId);
  task.ownerId = newOwner._id;
  await task.save();

  await NotificationModel.create({
    recipientId: newOwner._id,
    type: 'FOLLOWUP_ASSIGNED',
    title: `Follow-up Reassigned (${task.taskCode})`,
    message: `${actor.fullName} reassigned "${task.title}" to you.`,
    entityType: 'FOLLOWUP',
    entityId: String(task._id),
  });

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'FOLLOWUP_REASSIGNED',
    entityType: 'FOLLOWUP',
    entityId: task._id,
    beforeSnapshot: { ownerId: prevOwnerId },
    afterSnapshot: { ownerId: String(newOwner._id) },
    reason: input.reason ?? null,
    ipAddress,
  });

  return getFollowUpDetails(actor, String(task._id));
}
