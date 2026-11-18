import type { Types } from 'mongoose';
import {
  EDITABLE_MEETING_STATUSES,
  FOLLOW_UP_STATUS,
  MEETING_EVENT_TYPE,
  MEETING_STATUS,
  MEETING_TYPE,
  OUTCOME_TYPE,
  ROLE_CODES,
  calculateDistanceMeters,
  canTransitionMeetingStatus,
  type CancelMeetingInput,
  type CreateMeetingInput,
  type MeetingListQuery,
  type UpdateMeetingInput,
} from '../../shared/index.js';
import { ApiError } from '../../common/ApiError.js';
import { generateEntityCode, writeAuditLog } from '../../common/audit.service.js';
import { sha256Hex } from '../../common/crypto.js';
import { buildPaginationMeta } from '../../common/response.js';
import { withTransaction } from '../../config/database.js';
import type { AuthenticatedActor } from '../../middleware/auth.middleware.js';
import {
  assertCanAccessUserScopedRecord,
  resolveAuthorizedUserScope,
} from '../../middleware/rbac.middleware.js';
import { AttachmentModel } from '../../models/Attachment.model.js';
import { ContactModel } from '../../models/Contact.model.js';
import { CustomerModel } from '../../models/Customer.model.js';
import { FollowUpTaskModel } from '../../models/FollowUpTask.model.js';
import { MeetingEventModel } from '../../models/MeetingEvent.model.js';
import { MeetingModel } from '../../models/Meeting.model.js';
import { MeetingOutcomeModel } from '../../models/MeetingOutcome.model.js';
import { MeetingScheduleModel } from '../../models/MeetingSchedule.model.js';
import { NotificationModel } from '../../models/Notification.model.js';
import { UserModel } from '../../models/User.model.js';
import { VisitSessionModel } from '../../models/VisitSession.model.js';

export async function findOverlappingMeetings(
  repId: Types.ObjectId | string,
  start: Date,
  end: Date,
  excludeMeetingId?: Types.ObjectId | string,
) {
  const filter: Record<string, unknown> = {
    assignedRepId: repId,
    isDeleted: false,
    status: { $nin: [MEETING_STATUS.CANCELLED] },
    currentScheduledStart: { $lt: end },
    currentScheduledEnd: { $gt: start },
  };
  if (excludeMeetingId) {
    filter._id = { $ne: excludeMeetingId };
  }

  const overlaps = await MeetingModel.find(filter)
    .populate('customerId', 'companyName customerCode')
    .sort({ currentScheduledStart: 1 })
    .lean();

  return overlaps.map((m) => {
    const cust = m.customerId as unknown as {
      companyName: string;
      customerCode: string;
    } | null;
    return {
      id: String(m._id),
      meetingCode: m.meetingCode,
      title: m.title,
      status: m.status,
      customerName: cust?.companyName ?? 'Unknown Account',
      scheduledStart: m.currentScheduledStart,
      scheduledEnd: m.currentScheduledEnd,
    };
  });
}

export async function createMeeting(
  actor: AuthenticatedActor,
  input: CreateMeetingInput,
  ipAddress?: string | null,
) {
  const customer = await CustomerModel.findById(input.customerId).lean();
  if (!customer || customer.isArchived) {
    throw ApiError.badRequest('Valid active customer account is required');
  }

  let assignedRepId: Types.ObjectId = actor.userId;
  if (input.assignedRepId && String(input.assignedRepId) !== String(actor.userId)) {
    if (actor.roleCode === ROLE_CODES.SALES_EMPLOYEE) {
      throw ApiError.forbidden(
        'Sales Employees can only schedule meetings assigned to themselves',
      );
    }
    await assertCanAccessUserScopedRecord(actor, input.assignedRepId);
    const repDoc = await UserModel.findOne({
      _id: input.assignedRepId,
      deletedAt: null,
    }).lean();
    if (!repDoc) {
      throw ApiError.badRequest('Assigned sales representative not found');
    }
    assignedRepId = repDoc._id;
  } else {
    // Ensure Sales Employee can access the target customer
    await assertCanAccessUserScopedRecord(actor, customer.assignedRepId);
  }

  let contactId: Types.ObjectId | null = customer.primaryContactId ?? null;
  if (input.contactId) {
    const contact = await ContactModel.findOne({
      _id: input.contactId,
      customerId: customer._id,
      deletedAt: null,
    }).lean();
    if (!contact) {
      throw ApiError.badRequest('Selected contact does not belong to customer');
    }
    contactId = contact._id;
  }

  const targetCoordinates = input.targetCoordinates
    ? {
        latitude: input.targetCoordinates.latitude,
        longitude: input.targetCoordinates.longitude,
      }
    : customer.address.location?.coordinates
      ? {
          latitude: customer.address.location.coordinates[1],
          longitude: customer.address.location.coordinates[0],
        }
      : null;

  const conflicts = await findOverlappingMeetings(
    assignedRepId,
    input.scheduledStart,
    input.scheduledEnd,
  );

  const createdId = await withTransaction(async (session) => {
    const meetingCode = generateEntityCode('MTG');

    const [meeting] = await MeetingModel.create(
      [
        {
          meetingCode,
          title: input.title,
          purpose: input.purpose,
          customerId: customer._id,
          contactId,
          assignedRepId,
          coHostIds: input.coHostIds ?? [],
          createdBy: actor.userId,
          meetingType: input.meetingType,
          priority: input.priority,
          status: MEETING_STATUS.SCHEDULED,
          originalScheduledStart: input.scheduledStart,
          originalScheduledEnd: input.scheduledEnd,
          currentScheduledStart: input.scheduledStart,
          currentScheduledEnd: input.scheduledEnd,
          timezone: input.timezone,
          currentScheduleRevision: 1,
          locationText: input.locationText,
          targetCoordinates,
          agenda: input.agenda,
          tags: input.tags ?? [],
        },
      ],
      session ? { session } : undefined,
    );

    if (!meeting) {
      throw ApiError.internal('Failed to create meeting');
    }

    const [schedule] = await MeetingScheduleModel.create(
      [
        {
          meetingId: meeting._id,
          revisionNumber: 1,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          timezone: input.timezone,
          isOriginal: true,
          previousScheduleId: null,
          changedBy: actor.userId,
          changeReason: 'Initial meeting schedule',
        },
      ],
      session ? { session } : undefined,
    );

    if (schedule) {
      meeting.currentScheduleId = schedule._id;
      await meeting.save(session ? { session } : undefined);
    }

    await MeetingEventModel.create(
      [
        {
          meetingId: meeting._id,
          eventType: MEETING_EVENT_TYPE.CREATED,
          fromStatus: null,
          toStatus: MEETING_STATUS.SCHEDULED,
          actorId: actor.userId,
          telemetry: {
            ipAddress: ipAddress ?? undefined,
            sha256Hash: sha256Hex(`${meetingCode}:CREATED:${Date.now()}`),
          },
          metadata: {
            scheduledStart: input.scheduledStart.toISOString(),
            scheduledEnd: input.scheduledEnd.toISOString(),
          },
        },
      ],
      session ? { session } : undefined,
    );

    if (String(assignedRepId) !== String(actor.userId)) {
      await NotificationModel.create(
        [
          {
            recipientId: assignedRepId,
            type: 'MEETING_ASSIGNED',
            title: `New Meeting Assigned (${meeting.meetingCode})`,
            message: `${actor.fullName} scheduled "${meeting.title}" with ${customer.companyName}.`,
            entityType: 'MEETING',
            entityId: String(meeting._id),
          },
        ],
        session ? { session } : undefined,
      );
    }

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'MEETING_CREATED',
      entityType: 'MEETING',
      entityId: meeting._id,
      afterSnapshot: {
        meetingCode: meeting.meetingCode,
        customerId: String(customer._id),
        assignedRepId: String(assignedRepId),
        scheduledStart: input.scheduledStart.toISOString(),
        scheduledEnd: input.scheduledEnd.toISOString(),
      },
      ipAddress,
      session,
    });

    return String(meeting._id);
  });

  const details = await getMeetingDetails(actor, createdId);
  return { meeting: details, conflicts };
}

export async function listMeetings(
  actor: AuthenticatedActor,
  query: MeetingListQuery,
) {
  const scope = await resolveAuthorizedUserScope(actor);

  const baseScopeFilter: Record<string, unknown> = { isDeleted: false };
  if (scope.allowedUserIds !== null) {
    baseScopeFilter.$or = [
      { assignedRepId: { $in: scope.allowedUserIds } },
      { coHostIds: { $in: scope.allowedUserIds } },
    ];
  }

  const filter: Record<string, unknown> = { ...baseScopeFilter };

  if (query.status) {
    filter.status = query.status;
  }
  if (query.customerId) {
    filter.customerId = query.customerId;
  }
  if (query.assignedRepId) {
    await assertCanAccessUserScopedRecord(actor, query.assignedRepId);
    filter.assignedRepId = query.assignedRepId;
  }
  if (query.fromDate || query.toDate) {
    const range: Record<string, Date> = {};
    if (query.fromDate) range.$gte = query.fromDate;
    if (query.toDate) range.$lte = query.toDate;
    filter.currentScheduledStart = range;
  }

  if (query.outcomeType) {
    const matchingOutcomes = await MeetingOutcomeModel.find(
      { outcomeType: query.outcomeType },
      { meetingId: 1 },
    ).lean();
    filter._id = { $in: matchingOutcomes.map((o) => o.meetingId) };
  }

  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const matchingCustomers = await CustomerModel.find(
      { companyName: regex },
      { _id: 1 },
    ).lean();
    const searchClauses = [
      { meetingCode: regex },
      { title: regex },
      { locationText: regex },
      { purpose: regex },
      ...(matchingCustomers.length > 0
        ? [{ customerId: { $in: matchingCustomers.map((c) => c._id) } }]
        : []),
    ];
    filter.$and = [{ $or: searchClauses }];
  }

  const skip = (query.page - 1) * query.limit;
  const sortField =
    query.sortBy &&
    ['currentScheduledStart', 'createdAt', 'priority', 'status'].includes(
      query.sortBy,
    )
      ? query.sortBy
      : 'currentScheduledStart';
  const sortDir = query.sortOrder === 'asc' ? 1 : -1;

  const [total, docs, totalScope, scheduledScope, inProgressScope, completedScope] =
    await Promise.all([
      MeetingModel.countDocuments(filter),
      MeetingModel.find(filter)
        .populate('customerId', 'companyName customerCode tier industry address')
        .populate('contactId', 'fullName designation email phone')
        .populate('assignedRepId', 'firstName lastName email employeeCode territory')
        .populate('outcomeId', 'outcomeType summary commercialSpecs')
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      MeetingModel.countDocuments(baseScopeFilter),
      MeetingModel.countDocuments({
        ...baseScopeFilter,
        status: {
          $in: [
            MEETING_STATUS.SCHEDULED,
            MEETING_STATUS.CONFIRMED,
            MEETING_STATUS.RESCHEDULED,
          ],
        },
      }),
      MeetingModel.countDocuments({
        ...baseScopeFilter,
        status: {
          $in: [
            MEETING_STATUS.CHECKED_IN,
            MEETING_STATUS.IN_PROGRESS,
            MEETING_STATUS.PAUSED,
            MEETING_STATUS.AWAITING_OUTCOME,
          ],
        },
      }),
      MeetingModel.countDocuments({
        ...baseScopeFilter,
        status: MEETING_STATUS.COMPLETED,
      }),
    ]);

  const items = docs.map((m) => {
    const cust = m.customerId as unknown as {
      _id: Types.ObjectId;
      companyName: string;
      customerCode: string;
      tier: string;
      industry: string;
    } | null;
    const contact = m.contactId as unknown as {
      _id: Types.ObjectId;
      fullName: string;
      designation?: string;
      email: string;
      phone: string;
    } | null;
    const rep = m.assignedRepId as unknown as {
      _id: Types.ObjectId;
      firstName: string;
      lastName: string;
      email: string;
      employeeCode: string;
      territory?: string;
    } | null;
    const outcome = m.outcomeId as unknown as {
      _id: Types.ObjectId;
      outcomeType: string;
      summary: string;
    } | null;

    return {
      id: String(m._id),
      meetingCode: m.meetingCode,
      title: m.title,
      purpose: m.purpose,
      meetingType: m.meetingType,
      priority: m.priority,
      status: m.status,
      originalScheduledStart: m.originalScheduledStart,
      originalScheduledEnd: m.originalScheduledEnd,
      scheduledStart: m.currentScheduledStart,
      scheduledEnd: m.currentScheduledEnd,
      currentScheduleRevision: m.currentScheduleRevision,
      locationText: m.locationText,
      agenda: m.agenda ?? null,
      tags: m.tags,
      visitSessionCount: m.visitSessionCount,
      completedSessionCount: m.completedSessionCount,
      totalActualDurationMinutes: m.totalActualDurationMinutes,
      firstCheckInAt: m.firstCheckInAt ?? null,
      lastCheckOutAt: m.lastCheckOutAt ?? null,
      customer: cust
        ? {
            id: String(cust._id),
            companyName: cust.companyName,
            customerCode: cust.customerCode,
            tier: cust.tier,
            industry: cust.industry,
          }
        : null,
      contact: contact
        ? {
            id: String(contact._id),
            fullName: contact.fullName,
            designation: contact.designation ?? null,
            email: contact.email,
            phone: contact.phone,
          }
        : null,
      assignedRep: rep
        ? {
            id: String(rep._id),
            fullName: `${rep.firstName} ${rep.lastName}`.trim(),
            email: rep.email,
            employeeCode: rep.employeeCode,
            territory: rep.territory ?? null,
          }
        : null,
      outcome: outcome
        ? {
            id: String(outcome._id),
            outcomeType: outcome.outcomeType,
            summary: outcome.summary,
          }
        : null,
      createdAt: m.createdAt,
    };
  });

  return {
    items,
    stats: {
      total: totalScope,
      scheduled: scheduledScope,
      inProgress: inProgressScope,
      completed: completedScope,
    },
    pagination: buildPaginationMeta(total, query.page, query.limit),
  };
}

export async function getMeetingDetails(
  actor: AuthenticatedActor,
  meetingId: string,
) {
  const meeting = await MeetingModel.findOne({
    _id: meetingId,
    isDeleted: false,
  })
    .populate(
      'customerId',
      'companyName customerCode tier industry website annualRevenue address status',
    )
    .populate('contactId', 'fullName designation email phone department')
    .populate('assignedRepId', 'firstName lastName email employeeCode territory phone')
    .lean();

  if (!meeting) {
    throw ApiError.notFound('Meeting record not found');
  }

  await assertCanAccessUserScopedRecord(
    actor,
    meeting.assignedRepId._id,
    meeting.coHostIds,
  );

  const [schedules, visitSessions, events, outcome, followUps, attachments] =
    await Promise.all([
      MeetingScheduleModel.find({ meetingId: meeting._id })
        .populate('changedBy', 'firstName lastName employeeCode')
        .sort({ revisionNumber: 1 })
        .lean(),
      VisitSessionModel.find({ meetingId: meeting._id })
        .populate('repId', 'firstName lastName employeeCode')
        .sort({ sessionNumber: 1 })
        .lean(),
      MeetingEventModel.find({ meetingId: meeting._id })
        .populate('actorId', 'firstName lastName employeeCode')
        .sort({ createdAt: 1 })
        .lean(),
      MeetingOutcomeModel.findOne({ meetingId: meeting._id })
        .populate('recordedBy', 'firstName lastName employeeCode')
        .lean(),
      FollowUpTaskModel.find({ meetingId: meeting._id, isDeleted: false })
        .populate('ownerId', 'firstName lastName employeeCode')
        .sort({ dueDate: 1 })
        .lean(),
      AttachmentModel.find({ meetingId: meeting._id, deletedAt: null })
        .populate('uploadedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

  const cust = meeting.customerId as unknown as {
    _id: Types.ObjectId;
    companyName: string;
    customerCode: string;
    tier: string;
    industry: string;
    website?: string;
    annualRevenue?: number;
    status: string;
    address: {
      street: string;
      city: string;
      state?: string;
      country: string;
      geofenceRadiusMeters: number;
      location?: { coordinates: [number, number] };
    };
  };

  const contact = meeting.contactId as unknown as {
    _id: Types.ObjectId;
    fullName: string;
    designation?: string;
    email: string;
    phone: string;
    department?: string;
  } | null;

  const rep = meeting.assignedRepId as unknown as {
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    email: string;
    employeeCode: string;
    territory?: string;
    phone?: string;
  };

  return {
    id: String(meeting._id),
    meetingCode: meeting.meetingCode,
    title: meeting.title,
    purpose: meeting.purpose,
    meetingType: meeting.meetingType,
    priority: meeting.priority,
    status: meeting.status,
    originalScheduledStart: meeting.originalScheduledStart,
    originalScheduledEnd: meeting.originalScheduledEnd,
    scheduledStart: meeting.currentScheduledStart,
    scheduledEnd: meeting.currentScheduledEnd,
    timezone: meeting.timezone,
    currentScheduleRevision: meeting.currentScheduleRevision,
    locationText: meeting.locationText,
    targetCoordinates: meeting.targetCoordinates ?? null,
    agenda: meeting.agenda ?? null,
    tags: meeting.tags,
    activeVisitSessionId: meeting.activeVisitSessionId
      ? String(meeting.activeVisitSessionId)
      : null,
    visitSessionCount: meeting.visitSessionCount,
    completedSessionCount: meeting.completedSessionCount,
    totalActualDurationMinutes: meeting.totalActualDurationMinutes,
    firstCheckInAt: meeting.firstCheckInAt ?? null,
    lastCheckOutAt: meeting.lastCheckOutAt ?? null,
    lockedAt: meeting.lockedAt ?? null,
    reopenCount: meeting.reopenCount,
    lastReopenReason: meeting.lastReopenReason ?? null,
    cancellationReason: meeting.cancellationReason ?? null,
    customer: {
      id: String(cust._id),
      companyName: cust.companyName,
      customerCode: cust.customerCode,
      tier: cust.tier,
      industry: cust.industry,
      website: cust.website ?? null,
      annualRevenue: cust.annualRevenue ?? null,
      status: cust.status,
      address: {
        street: cust.address.street,
        city: cust.address.city,
        state: cust.address.state ?? null,
        country: cust.address.country,
        geofenceRadiusMeters: cust.address.geofenceRadiusMeters,
        coordinates: cust.address.location?.coordinates
          ? {
              longitude: cust.address.location.coordinates[0],
              latitude: cust.address.location.coordinates[1],
            }
          : null,
      },
    },
    contact: contact
      ? {
          id: String(contact._id),
          fullName: contact.fullName,
          designation: contact.designation ?? null,
          email: contact.email,
          phone: contact.phone,
          department: contact.department ?? null,
        }
      : null,
    assignedRep: {
      id: String(rep._id),
      fullName: `${rep.firstName} ${rep.lastName}`.trim(),
      email: rep.email,
      employeeCode: rep.employeeCode,
      territory: rep.territory ?? null,
      phone: rep.phone ?? null,
    },
    schedules: schedules.map((s) => {
      const cb = s.changedBy as unknown as {
        firstName: string;
        lastName: string;
        employeeCode: string;
      } | null;
      return {
        id: String(s._id),
        revisionNumber: s.revisionNumber,
        scheduledStart: s.scheduledStart,
        scheduledEnd: s.scheduledEnd,
        timezone: s.timezone,
        isOriginal: s.isOriginal,
        changeReason: s.changeReason ?? null,
        changedBy: cb
          ? `${cb.firstName} ${cb.lastName} (${cb.employeeCode})`
          : 'System',
        createdAt: s.createdAt,
      };
    }),
    visitSessions: visitSessions.map((vs) => ({
      id: String(vs._id),
      sessionNumber: vs.sessionNumber,
      scheduleRevisionNumber: vs.scheduleRevisionNumber,
      status: vs.status,
      checkInAt: vs.checkInAt,
      checkInTelemetry: vs.checkInTelemetry,
      checkOutAt: vs.checkOutAt ?? null,
      checkOutTelemetry: vs.checkOutTelemetry ?? null,
      pauseSegments: vs.pauseSegments,
      grossDurationMinutes: vs.grossDurationMinutes,
      pausedDurationMinutes: vs.pausedDurationMinutes,
      netDurationMinutes: vs.netDurationMinutes,
      arrivalNotes: vs.arrivalNotes ?? null,
      fieldNotes: vs.fieldNotes ?? null,
      signatureDataUrl: vs.signatureDataUrl ?? null,
      createdAt: vs.createdAt,
    })),
    events: events.map((ev) => {
      const act = ev.actorId as unknown as {
        firstName: string;
        lastName: string;
        employeeCode: string;
      } | null;
      return {
        id: String(ev._id),
        eventType: ev.eventType,
        fromStatus: ev.fromStatus ?? null,
        toStatus: ev.toStatus,
        actorName: act
          ? `${act.firstName} ${act.lastName} (${act.employeeCode})`
          : 'System',
        reason: ev.reason ?? null,
        telemetry: ev.telemetry ?? null,
        metadata: ev.metadata ?? {},
        createdAt: ev.createdAt,
      };
    }),
    outcome: outcome
      ? {
          id: String(outcome._id),
          version: outcome.version,
          outcomeType: outcome.outcomeType,
          summary: outcome.summary,
          minutes: outcome.minutes ?? null,
          clientFeedback: outcome.clientFeedback ?? null,
          commercialSpecs: outcome.commercialSpecs ?? null,
          disqualificationReason: outcome.disqualificationReason ?? null,
          competitorNotes: outcome.competitorNotes ?? null,
          recordedAt: outcome.recordedAt,
        }
      : null,
    followUps: followUps.map((f) => {
      const owner = f.ownerId as unknown as {
        _id: Types.ObjectId;
        firstName: string;
        lastName: string;
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
        owner: owner
          ? {
              id: String(owner._id),
              fullName: `${owner.firstName} ${owner.lastName}`.trim(),
              employeeCode: owner.employeeCode,
            }
          : null,
      };
    }),
    attachments: attachments.map((att) => {
      const hasBinary = Boolean(att.storageKey?.startsWith('disk:'));
      return {
        id: String(att._id),
        fileName: att.fileName,
        originalName: att.originalName,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        category: att.category,
        hasBinary,
        downloadPath: hasBinary
          ? `/api/v1/attachments/${String(att._id)}/download`
          : null,
        createdAt: att.createdAt,
      };
    }),
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
  };
}

export async function updateMeeting(
  actor: AuthenticatedActor,
  meetingId: string,
  input: UpdateMeetingInput,
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

  // Business Rule #10: Completed/Cancelled/Active-Visit meetings cannot be arbitrarily modified
  if (!EDITABLE_MEETING_STATUSES.includes(meeting.status)) {
    throw ApiError.unprocessable(
      `Meetings in "${meeting.status}" state cannot be modified directly. Completed meetings require an authorized Manager/Admin reopen.`,
      undefined,
      'MEETING_LOCKED_FOR_EDIT',
    );
  }

  if (input.title !== undefined) meeting.title = input.title;
  if (input.purpose !== undefined) meeting.purpose = input.purpose;
  if (input.contactId !== undefined) {
    if (input.contactId === null) {
      meeting.contactId = null;
    } else {
      const validContact = await ContactModel.findOne({
        _id: input.contactId,
        customerId: meeting.customerId,
        deletedAt: null,
      }).lean();
      if (!validContact) {
        throw ApiError.badRequest(
          'Selected contact does not belong to this meeting’s customer account',
        );
      }
      meeting.contactId = validContact._id;
    }
  }
  if (input.coHostIds !== undefined)
    meeting.coHostIds = input.coHostIds as unknown as Types.ObjectId[];
  if (input.meetingType !== undefined) meeting.meetingType = input.meetingType;
  if (input.priority !== undefined) meeting.priority = input.priority;
  if (input.locationText !== undefined)
    meeting.locationText = input.locationText;
  if (input.targetCoordinates !== undefined) {
    meeting.targetCoordinates = {
      latitude: input.targetCoordinates.latitude,
      longitude: input.targetCoordinates.longitude,
    };
  }
  if (input.agenda !== undefined) meeting.agenda = input.agenda;
  if (input.tags !== undefined) meeting.tags = input.tags;

  await meeting.save();

  await MeetingEventModel.create({
    meetingId: meeting._id,
    eventType: MEETING_EVENT_TYPE.UPDATED,
    fromStatus: meeting.status,
    toStatus: meeting.status,
    actorId: actor.userId,
    telemetry: {
      ipAddress: ipAddress ?? undefined,
      sha256Hash: sha256Hex(`${meeting.meetingCode}:UPDATED:${Date.now()}`),
    },
  });

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'MEETING_UPDATED',
    entityType: 'MEETING',
    entityId: meeting._id,
    ipAddress,
  });

  return getMeetingDetails(actor, String(meeting._id));
}

export async function confirmMeeting(
  actor: AuthenticatedActor,
  meetingId: string,
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

  if (!canTransitionMeetingStatus(meeting.status, MEETING_STATUS.CONFIRMED)) {
    throw ApiError.unprocessable(
      `Invalid lifecycle transition from ${meeting.status} to CONFIRMED`,
      undefined,
      'INVALID_STATE_TRANSITION',
    );
  }

  const fromStatus = meeting.status;
  meeting.status = MEETING_STATUS.CONFIRMED;
  await meeting.save();

  await MeetingEventModel.create({
    meetingId: meeting._id,
    eventType: MEETING_EVENT_TYPE.CONFIRMED,
    fromStatus,
    toStatus: MEETING_STATUS.CONFIRMED,
    actorId: actor.userId,
    telemetry: {
      ipAddress: ipAddress ?? undefined,
      sha256Hash: sha256Hex(`${meeting.meetingCode}:CONFIRMED:${Date.now()}`),
    },
  });

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'MEETING_CONFIRMED',
    entityType: 'MEETING',
    entityId: meeting._id,
    ipAddress,
  });

  return getMeetingDetails(actor, String(meeting._id));
}

export async function cancelMeeting(
  actor: AuthenticatedActor,
  meetingId: string,
  input: CancelMeetingInput,
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

  if (!canTransitionMeetingStatus(meeting.status, MEETING_STATUS.CANCELLED)) {
    throw ApiError.unprocessable(
      `Cannot cancel meeting in ${meeting.status} state`,
      undefined,
      'INVALID_STATE_TRANSITION',
    );
  }

  const fromStatus = meeting.status;
  meeting.status = MEETING_STATUS.CANCELLED;
  meeting.cancelledAt = new Date();
  meeting.cancelledBy = actor.userId;
  meeting.cancellationReason = input.reason;
  await meeting.save();

  await MeetingEventModel.create({
    meetingId: meeting._id,
    eventType: MEETING_EVENT_TYPE.CANCELLED,
    fromStatus,
    toStatus: MEETING_STATUS.CANCELLED,
    actorId: actor.userId,
    reason: input.reason,
    telemetry: {
      ipAddress: ipAddress ?? undefined,
      sha256Hash: sha256Hex(`${meeting.meetingCode}:CANCELLED:${Date.now()}`),
    },
  });

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'MEETING_CANCELLED',
    entityType: 'MEETING',
    entityId: meeting._id,
    reason: input.reason,
    ipAddress,
  });

  return getMeetingDetails(actor, String(meeting._id));
}

export async function getOverviewDashboard(actor: AuthenticatedActor) {
  const scope = await resolveAuthorizedUserScope(actor);

  const meetingScope: Record<string, unknown> = { isDeleted: false };
  const followUpScope: Record<string, unknown> = { isDeleted: false };

  if (scope.allowedUserIds !== null) {
    meetingScope.$or = [
      { assignedRepId: { $in: scope.allowedUserIds } },
      { coHostIds: { $in: scope.allowedUserIds } },
    ];
    followUpScope.ownerId = { $in: scope.allowedUserIds };
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const scopedMeetingIds = await MeetingModel.distinct('_id', meetingScope);

  const [
    totalMeetings,
    completedMeetings,
    todaysDocs,
    pendingFollowUpCount,
    urgentFollowUpCount,
    dueTodayFollowUpCount,
    pendingFollowUpItems,
    completedAgg,
    positiveOutcomeCount,
  ] = await Promise.all([
    MeetingModel.countDocuments(meetingScope),
    MeetingModel.countDocuments({
      ...meetingScope,
      status: MEETING_STATUS.COMPLETED,
    }),
    MeetingModel.find({
      ...meetingScope,
      currentScheduledStart: { $gte: startOfDay, $lte: endOfDay },
    })
      .populate('customerId', 'companyName customerCode industry address')
      .populate('contactId', 'fullName designation phone')
      .populate('assignedRepId', 'firstName lastName employeeCode')
      .populate('outcomeId', 'outcomeType')
      .sort({ currentScheduledStart: 1 })
      .limit(15)
      .lean(),
    FollowUpTaskModel.countDocuments({
      ...followUpScope,
      status: {
        $in: [
          FOLLOW_UP_STATUS.PENDING,
          FOLLOW_UP_STATUS.IN_PROGRESS,
          FOLLOW_UP_STATUS.OVERDUE,
        ],
      },
    }),
    FollowUpTaskModel.countDocuments({
      ...followUpScope,
      status: {
        $in: [
          FOLLOW_UP_STATUS.PENDING,
          FOLLOW_UP_STATUS.IN_PROGRESS,
          FOLLOW_UP_STATUS.OVERDUE,
        ],
      },
      priority: { $in: ['HIGH', 'CRITICAL'] },
    }),
    FollowUpTaskModel.countDocuments({
      ...followUpScope,
      status: { $ne: FOLLOW_UP_STATUS.COMPLETED },
      dueDate: { $lte: endOfDay },
    }),
    FollowUpTaskModel.find({
      ...followUpScope,
      status: {
        $in: [
          FOLLOW_UP_STATUS.PENDING,
          FOLLOW_UP_STATUS.IN_PROGRESS,
          FOLLOW_UP_STATUS.OVERDUE,
        ],
      },
    })
      .populate('customerId', 'companyName')
      .sort({ dueDate: 1 })
      .limit(5)
      .lean(),
    MeetingModel.aggregate<{ avgMinutes: number }>([
      {
        $match: {
          ...meetingScope,
          status: MEETING_STATUS.COMPLETED,
          totalActualDurationMinutes: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          avgMinutes: { $avg: '$totalActualDurationMinutes' },
        },
      },
    ]),
    MeetingOutcomeModel.countDocuments({
      meetingId: { $in: scopedMeetingIds },
      outcomeType: {
        $in: [OUTCOME_TYPE.INTERESTED, OUTCOME_TYPE.PROPOSAL_REQUESTED],
      },
    }),
  ]);

  // If there are no meetings scheduled specifically today, also include upcoming/recent meetings for the table
  let tableDocs = todaysDocs;
  if (tableDocs.length === 0) {
    tableDocs = await MeetingModel.find(meetingScope)
      .populate('customerId', 'companyName customerCode industry address')
      .populate('contactId', 'fullName designation phone')
      .populate('assignedRepId', 'firstName lastName employeeCode')
      .populate('outcomeId', 'outcomeType')
      .sort({ currentScheduledStart: -1 })
      .limit(10)
      .lean();
  }

  const inPersonToday = todaysDocs.filter(
    (d) => d.meetingType === MEETING_TYPE.IN_PERSON,
  ).length;
  const virtualToday = todaysDocs.length - inPersonToday;
  const avgDurationMinutes = Math.round(completedAgg[0]?.avgMinutes ?? 0);
  const conversionRate =
    completedMeetings > 0
      ? Math.round((positiveOutcomeCount / completedMeetings) * 1000) / 10
      : 0;

  return {
    kpis: {
      totalMeetings,
      scheduledToday: todaysDocs.length,
      inPersonToday,
      virtualToday,
      completedMeetings,
      completionRatePercent:
        totalMeetings > 0
          ? Math.round((completedMeetings / totalMeetings) * 1000) / 10
          : 0,
      avgDurationMinutes,
      pendingFollowUps: pendingFollowUpCount,
      dueTodayFollowUps: dueTodayFollowUpCount,
      urgentFollowUps: urgentFollowUpCount,
      conversionRatePercent: conversionRate,
    },
    todaysMeetings: tableDocs.map((m) => {
      const cust = m.customerId as unknown as {
        _id: Types.ObjectId;
        companyName: string;
        customerCode: string;
        industry: string;
      } | null;
      const ct = m.contactId as unknown as {
        fullName: string;
        designation?: string;
      } | null;
      const rep = m.assignedRepId as unknown as {
        firstName: string;
        lastName: string;
      } | null;
      const out = m.outcomeId as unknown as { outcomeType: string } | null;

      return {
        id: String(m._id),
        meetingCode: m.meetingCode,
        title: m.title,
        status: m.status,
        meetingType: m.meetingType,
        priority: m.priority,
        locationText: m.locationText,
        scheduledStart: m.currentScheduledStart,
        scheduledEnd: m.currentScheduledEnd,
        customerName: cust?.companyName ?? 'Unknown Account',
        customerIndustry: cust?.industry ?? '',
        contactName: ct?.fullName ?? 'Primary Contact',
        contactDesignation: ct?.designation ?? '',
        repName: rep ? `${rep.firstName} ${rep.lastName}`.trim() : 'Unassigned',
        outcomeType: out?.outcomeType ?? null,
      };
    }),
    pendingActionItems: pendingFollowUpItems.map((f) => {
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
    routeStops: (() => {
      const inPersonList = tableDocs
        .filter((m) => m.meetingType === MEETING_TYPE.IN_PERSON)
        .slice(0, 6);
      let prevCoords: { latitude: number; longitude: number } | null = null;
      return inPersonList.map((m) => {
        const cust = m.customerId as unknown as {
          companyName: string;
          address?: { location?: { coordinates?: [number, number] } };
        } | null;
        const coords =
          m.targetCoordinates ??
          (cust?.address?.location?.coordinates
            ? {
                longitude: cust.address.location.coordinates[0],
                latitude: cust.address.location.coordinates[1],
              }
            : null);
        const legDistanceKm =
          prevCoords && coords
            ? Math.round(
                (calculateDistanceMeters(
                  prevCoords.latitude,
                  prevCoords.longitude,
                  coords.latitude,
                  coords.longitude,
                ) /
                  1000) *
                  10,
              ) / 10
            : null;
        if (coords) prevCoords = coords;
        return {
          id: String(m._id),
          meetingCode: m.meetingCode,
          customerName: cust?.companyName ?? m.title,
          locationText: m.locationText,
          scheduledStart: m.currentScheduledStart,
          status: m.status,
          coordinates: coords,
          legDistanceKm,
        };
      });
    })(),
  };
}
