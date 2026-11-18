import type { Types } from 'mongoose';
import {
  FOLLOW_UP_STATUS,
  MEETING_EVENT_TYPE,
  MEETING_STATUS,
  OUTCOME_TYPE,
  ROLE_CODES,
  VISIT_SESSION_STATUS,
  canTransitionMeetingStatus,
  type ReassignMeetingInput,
  type RecordMeetingOutcomeInput,
  type ReopenMeetingInput,
} from '../../shared/index.js';
import { ApiError } from '../../common/ApiError.js';
import { generateEntityCode, writeAuditLog } from '../../common/audit.service.js';
import { sha256Hex, verifyPassword } from '../../common/crypto.js';
import { withTransaction } from '../../config/database.js';
import type { AuthenticatedActor } from '../../middleware/auth.middleware.js';
import { assertCanAccessUserScopedRecord } from '../../middleware/rbac.middleware.js';
import { FollowUpTaskModel } from '../../models/FollowUpTask.model.js';
import { MeetingEventModel } from '../../models/MeetingEvent.model.js';
import { MeetingModel } from '../../models/Meeting.model.js';
import { MeetingOutcomeModel } from '../../models/MeetingOutcome.model.js';
import { NotificationModel } from '../../models/Notification.model.js';
import { SystemSettingModel } from '../../models/SystemSetting.model.js';
import { UserModel } from '../../models/User.model.js';
import { VisitSessionModel } from '../../models/VisitSession.model.js';
import { getMeetingDetails } from '../meetings/meetings.service.js';

export async function recordMeetingOutcome(
  actor: AuthenticatedActor,
  meetingId: string,
  input: RecordMeetingOutcomeInput,
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

  if (meeting.status === MEETING_STATUS.COMPLETED) {
    throw ApiError.unprocessable(
      'Completed meetings are locked. A Sales Manager or Admin must reopen the meeting before modifying its outcome.',
      undefined,
      'MEETING_COMPLETED_LOCKED',
    );
  }

  if (meeting.status === MEETING_STATUS.CANCELLED) {
    throw ApiError.unprocessable(
      'Cannot record an outcome for a cancelled meeting.',
      undefined,
      'INVALID_STATE_TRANSITION',
    );
  }

  // Ensure no open VisitSession is left dangling while completing
  const openSession = await VisitSessionModel.findOne({
    meetingId: meeting._id,
    status: { $in: [VISIT_SESSION_STATUS.ACTIVE, VISIT_SESSION_STATUS.PAUSED] },
  }).lean();

  if (openSession) {
    throw ApiError.unprocessable(
      'Active or paused visit session must be checked out before recording the final outcome.',
      undefined,
      'OPEN_VISIT_SESSION_EXISTS',
    );
  }

  if (
    meeting.completedSessionCount === 0 &&
    input.outcomeType !== OUTCOME_TYPE.UNABLE_TO_MEET
  ) {
    throw ApiError.unprocessable(
      'At least one completed visit session is required before recording a positive/standard outcome (use "Unable to Meet" if the visit could not take place).',
      undefined,
      'VISIT_SESSION_REQUIRED',
    );
  }

  // Business Rule #6: Double-verify Follow-up Required demands valid owner and due date
  if (input.outcomeType === OUTCOME_TYPE.FOLLOW_UP_REQUIRED) {
    if (!input.followUpTasks || input.followUpTasks.length === 0) {
      throw ApiError.unprocessable(
        'Follow-up Required outcome demands at least one follow-up task with owner and due date.',
        undefined,
        'FOLLOW_UP_REQUIRED_MISSING',
      );
    }
  }

  for (const task of input.followUpTasks ?? []) {
    if (
      actor.roleCode === ROLE_CODES.SALES_EMPLOYEE &&
      String(task.ownerId) !== String(actor.userId)
    ) {
      throw ApiError.forbidden(
        'Sales Employees can only assign outcome follow-up tasks to themselves',
      );
    }
    await assertCanAccessUserScopedRecord(actor, task.ownerId);
    const ownerExists = await UserModel.exists({
      _id: task.ownerId,
      deletedAt: null,
    });
    if (!ownerExists) {
      throw ApiError.badRequest(
        `Follow-up owner ${task.ownerId} does not exist`,
      );
    }
  }

  await withTransaction(async (session) => {
    const now = new Date();
    const existingOutcome = await MeetingOutcomeModel.findOne({
      meetingId: meeting._id,
    }).session(session ?? null);

    let outcomeId: Types.ObjectId;

    if (existingOutcome) {
      existingOutcome.revisionHistory.push({
        version: existingOutcome.version,
        outcomeType: existingOutcome.outcomeType,
        summary: existingOutcome.summary,
        minutes: existingOutcome.minutes,
        recordedBy: existingOutcome.recordedBy,
        recordedAt: existingOutcome.recordedAt,
      });
      existingOutcome.version += 1;
      existingOutcome.outcomeType = input.outcomeType;
      existingOutcome.summary = input.summary;
      existingOutcome.minutes = input.minutes;
      existingOutcome.clientFeedback = input.clientFeedback;
      existingOutcome.commercialSpecs = input.commercialSpecs
        ? {
            estimatedValue: input.commercialSpecs.estimatedValue,
            currency: input.commercialSpecs.currency ?? 'USD',
            targetCloseDate: input.commercialSpecs.targetCloseDate ?? null,
            productsDiscussed: input.commercialSpecs.productsDiscussed ?? [],
          }
        : null;
      existingOutcome.disqualificationReason = input.disqualificationReason;
      existingOutcome.competitorNotes = input.competitorNotes;
      existingOutcome.recordedBy = actor.userId;
      existingOutcome.recordedAt = now;
      await existingOutcome.save(session ? { session } : undefined);
      outcomeId = existingOutcome._id;
    } else {
      const [createdOutcome] = await MeetingOutcomeModel.create(
        [
          {
            meetingId: meeting._id,
            version: 1,
            outcomeType: input.outcomeType,
            summary: input.summary,
            minutes: input.minutes,
            clientFeedback: input.clientFeedback,
            commercialSpecs: input.commercialSpecs
              ? {
                  estimatedValue: input.commercialSpecs.estimatedValue,
                  currency: input.commercialSpecs.currency ?? 'USD',
                  targetCloseDate:
                    input.commercialSpecs.targetCloseDate ?? null,
                  productsDiscussed:
                    input.commercialSpecs.productsDiscussed ?? [],
                }
              : null,
            disqualificationReason: input.disqualificationReason,
            competitorNotes: input.competitorNotes,
            recordedBy: actor.userId,
            recordedAt: now,
          },
        ],
        session ? { session } : undefined,
      );
      if (!createdOutcome) {
        throw ApiError.internal('Failed to persist meeting outcome');
      }
      outcomeId = createdOutcome._id;
    }

    // Create any inline follow-up deliverables
    for (const taskInput of input.followUpTasks ?? []) {
      const taskCode = generateEntityCode('FUP');
      const [createdTask] = await FollowUpTaskModel.create(
        [
          {
            taskCode,
            title: taskInput.title,
            description: taskInput.description,
            customerId: meeting.customerId,
            meetingId: meeting._id,
            ownerId: taskInput.ownerId,
            assignedById: actor.userId,
            dueDate: taskInput.dueDate,
            priority: taskInput.priority,
            status: FOLLOW_UP_STATUS.PENDING,
          },
        ],
        session ? { session } : undefined,
      );

      if (createdTask && String(taskInput.ownerId) !== String(actor.userId)) {
        await NotificationModel.create(
          [
            {
              recipientId: taskInput.ownerId,
              type: 'FOLLOWUP_ASSIGNED',
              title: `New Follow-up Assigned (${taskCode})`,
              message: `${actor.fullName} assigned "${taskInput.title}" from ${meeting.meetingCode}.`,
              entityType: 'FOLLOW_UP',
              entityId: String(createdTask._id),
            },
          ],
          session ? { session } : undefined,
        );
      }
    }

    const fromStatus = meeting.status;
    meeting.outcomeId = outcomeId;

    if (input.completeAndLock !== false) {
      meeting.status = MEETING_STATUS.COMPLETED;
      meeting.lockedAt = now;
      meeting.lockedBy = actor.userId;
    } else if (meeting.status !== MEETING_STATUS.REOPENED) {
      meeting.status = MEETING_STATUS.AWAITING_OUTCOME;
    }
    await meeting.save(session ? { session } : undefined);

    await MeetingEventModel.create(
      [
        {
          meetingId: meeting._id,
          eventType: MEETING_EVENT_TYPE.OUTCOME_RECORDED,
          fromStatus,
          toStatus: meeting.status,
          actorId: actor.userId,
          telemetry: {
            ipAddress: ipAddress ?? undefined,
            sha256Hash: sha256Hex(
              `${meeting.meetingCode}:OUTCOME:${input.outcomeType}:${now.toISOString()}`,
            ),
          },
          metadata: {
            outcomeType: input.outcomeType,
            followUpsCreated: input.followUpTasks?.length ?? 0,
          },
        },
        ...(meeting.status === MEETING_STATUS.COMPLETED
          ? [
              {
                meetingId: meeting._id,
                eventType: MEETING_EVENT_TYPE.COMPLETED,
                fromStatus,
                toStatus: MEETING_STATUS.COMPLETED,
                actorId: actor.userId,
                telemetry: {
                  sha256Hash: sha256Hex(
                    `${meeting.meetingCode}:COMPLETED:${now.toISOString()}`,
                  ),
                },
              },
            ]
          : []),
      ],
      session ? { session, ordered: true } : undefined,
    );

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action:
        meeting.status === MEETING_STATUS.COMPLETED
          ? 'MEETING_COMPLETED'
          : 'MEETING_OUTCOME_SAVED',
      entityType: 'MEETING',
      entityId: meeting._id,
      afterSnapshot: {
        outcomeType: input.outcomeType,
        status: meeting.status,
        followUpsCreated: input.followUpTasks?.length ?? 0,
      },
      ipAddress,
      session,
    });
  });

  return getMeetingDetails(actor, String(meeting._id));
}

/**
 * Explicit Complete endpoint enforcing Rule #5:
 * A meeting CANNOT transition to COMPLETED without a recorded MeetingOutcome
 * (and if outcome is FOLLOW_UP_REQUIRED, at least one FollowUpTask with owner & dueDate).
 */
export async function completeMeetingExplicit(
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

  // Business Rule #5: Reject completion without outcome!
  const outcome = await MeetingOutcomeModel.findOne({
    meetingId: meeting._id,
  }).lean();

  if (!outcome || !meeting.outcomeId) {
    throw ApiError.unprocessable(
      'Meeting cannot be completed without a recorded outcome.',
      undefined,
      'OUTCOME_REQUIRED_FOR_COMPLETION',
    );
  }

  if (outcome.outcomeType === OUTCOME_TYPE.FOLLOW_UP_REQUIRED) {
    const hasFollowUp = await FollowUpTaskModel.exists({
      meetingId: meeting._id,
      isDeleted: false,
      ownerId: { $ne: null },
      dueDate: { $ne: null },
    });
    if (!hasFollowUp) {
      throw ApiError.unprocessable(
        'Follow-up Required outcome demands at least one follow-up task with owner and due date before completion.',
        undefined,
        'FOLLOW_UP_REQUIRED_MISSING',
      );
    }
  }

  if (!canTransitionMeetingStatus(meeting.status, MEETING_STATUS.COMPLETED)) {
    throw ApiError.unprocessable(
      `Invalid transition from ${meeting.status} to COMPLETED`,
      undefined,
      'INVALID_STATE_TRANSITION',
    );
  }

  const fromStatus = meeting.status;
  meeting.status = MEETING_STATUS.COMPLETED;
  meeting.lockedAt = new Date();
  meeting.lockedBy = actor.userId;
  await meeting.save();

  await MeetingEventModel.create({
    meetingId: meeting._id,
    eventType: MEETING_EVENT_TYPE.COMPLETED,
    fromStatus,
    toStatus: MEETING_STATUS.COMPLETED,
    actorId: actor.userId,
    telemetry: {
      ipAddress: ipAddress ?? undefined,
      sha256Hash: sha256Hex(`${meeting.meetingCode}:COMPLETED:${Date.now()}`),
    },
  });

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'MEETING_COMPLETED',
    entityType: 'MEETING',
    entityId: meeting._id,
    ipAddress,
  });

  return getMeetingDetails(actor, String(meeting._id));
}

/**
 * Business Rules #2 & #7:
 * Only authorized Sales Manager or Admin can reopen a COMPLETED meeting,
 * and a mandatory reason is strictly required.
 */
export async function reopenCompletedMeeting(
  actor: AuthenticatedActor,
  meetingId: string,
  input: ReopenMeetingInput,
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

  if (!canTransitionMeetingStatus(meeting.status, MEETING_STATUS.REOPENED)) {
    throw ApiError.unprocessable(
      `Only COMPLETED meetings can be reopened (current status: ${meeting.status}).`,
      undefined,
      'INVALID_STATE_TRANSITION',
    );
  }

  const sysSettings = await SystemSettingModel.findOne({
    singletonKey: 'DEFAULT',
  }).lean();

  if (sysSettings?.requireManagerPinOnReopen) {
    const actorUser = await UserModel.findById(actor.userId).select(
      '+managerPinHash',
    );
    if (
      !input.managerPin ||
      !actorUser?.managerPinHash ||
      !(await verifyPassword(input.managerPin, actorUser.managerPinHash))
    ) {
      throw ApiError.forbidden(
        'Valid Manager Governance PIN is required by organization policy to reopen completed meetings.',
        'INVALID_MANAGER_PIN',
      );
    }
  }

  const combinedReason = input.explanation
    ? `${input.reason} — ${input.explanation}`
    : input.reason;

  await withTransaction(async (session) => {
    const now = new Date();
    meeting.status = MEETING_STATUS.REOPENED;
    meeting.lockedAt = null;
    meeting.lockedBy = null;
    meeting.reopenCount += 1;
    meeting.lastReopenedAt = now;
    meeting.lastReopenedBy = actor.userId;
    meeting.lastReopenReason = combinedReason;
    await meeting.save(session ? { session } : undefined);

    await MeetingEventModel.create(
      [
        {
          meetingId: meeting._id,
          eventType: MEETING_EVENT_TYPE.REOPENED,
          fromStatus: MEETING_STATUS.COMPLETED,
          toStatus: MEETING_STATUS.REOPENED,
          actorId: actor.userId,
          reason: combinedReason,
          telemetry: {
            ipAddress: ipAddress ?? undefined,
            sha256Hash: sha256Hex(
              `${meeting.meetingCode}:REOPEN:${meeting.reopenCount}:${now.toISOString()}`,
            ),
          },
        },
      ],
      session ? { session } : undefined,
    );

    if (input.notifyAssignedRep !== false) {
      await NotificationModel.create(
        [
          {
            recipientId: meeting.assignedRepId,
            type: 'MEETING_REOPENED',
            title: `Meeting Reopened (${meeting.meetingCode})`,
            message: `${actor.fullName} reopened "${meeting.title}". Reason: ${input.reason}`,
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
      action: 'MEETING_REOPENED',
      entityType: 'MEETING',
      entityId: meeting._id,
      beforeSnapshot: { status: MEETING_STATUS.COMPLETED },
      afterSnapshot: {
        status: MEETING_STATUS.REOPENED,
        reopenCount: meeting.reopenCount,
      },
      reason: combinedReason,
      ipAddress,
      session,
    });
  });

  return getMeetingDetails(actor, String(meeting._id));
}

export async function reassignMeeting(
  actor: AuthenticatedActor,
  meetingId: string,
  input: ReassignMeetingInput,
  ipAddress?: string | null,
) {
  const meeting = await MeetingModel.findOne({
    _id: meetingId,
    isDeleted: false,
  });
  if (!meeting) {
    throw ApiError.notFound('Meeting record not found');
  }

  await assertCanAccessUserScopedRecord(actor, meeting.assignedRepId);
  await assertCanAccessUserScopedRecord(actor, input.newAssignedRepId);

  const newRep = await UserModel.findOne({
    _id: input.newAssignedRepId,
    deletedAt: null,
  }).lean();
  if (!newRep) {
    throw ApiError.badRequest('Target sales representative not found');
  }

  const previousRepId = String(meeting.assignedRepId);
  meeting.assignedRepId = newRep._id;
  await meeting.save();

  await MeetingEventModel.create({
    meetingId: meeting._id,
    eventType: MEETING_EVENT_TYPE.REASSIGNED,
    fromStatus: meeting.status,
    toStatus: meeting.status,
    actorId: actor.userId,
    reason: input.reason,
    metadata: {
      previousRepId,
      newRepId: String(newRep._id),
    },
  });

  await NotificationModel.create({
    recipientId: newRep._id,
    type: 'MEETING_ASSIGNED',
    title: `Meeting Reassigned to You (${meeting.meetingCode})`,
    message: `${actor.fullName} assigned "${meeting.title}" to you. Reason: ${input.reason}`,
    entityType: 'MEETING',
    entityId: String(meeting._id),
  });

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'MEETING_REASSIGNED',
    entityType: 'MEETING',
    entityId: meeting._id,
    beforeSnapshot: { assignedRepId: previousRepId },
    afterSnapshot: { assignedRepId: String(newRep._id) },
    reason: input.reason,
    ipAddress,
  });

  return getMeetingDetails(actor, String(meeting._id));
}
