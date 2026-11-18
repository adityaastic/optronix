import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MEETING_EVENT_TYPE,
  MEETING_STATUS,
  ROLE_CODES,
  VISIT_SESSION_STATUS,
} from '../src/shared/index.js';
import {
  AttachmentModel,
  AuditLogModel,
  ContactModel,
  CustomerModel,
  FollowUpTaskModel,
  MeetingEventModel,
  MeetingModel,
  MeetingOutcomeModel,
  MeetingScheduleModel,
  NotificationModel,
  PermissionModel,
  RoleModel,
  SystemSettingModel,
  UserModel,
  VisitSessionModel,
} from '../src/models/index.js';

const TEST_DB_URI =
  process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017/optronix_phase02_schema_test';

describe('All 14 Mongoose Models, Indexes & Immutability Guarantees', () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.db?.dropDatabase();
    await Promise.all([
      PermissionModel.syncIndexes(),
      RoleModel.syncIndexes(),
      UserModel.syncIndexes(),
      CustomerModel.syncIndexes(),
      ContactModel.syncIndexes(),
      MeetingModel.syncIndexes(),
      MeetingScheduleModel.syncIndexes(),
      VisitSessionModel.syncIndexes(),
      MeetingEventModel.syncIndexes(),
      MeetingOutcomeModel.syncIndexes(),
      FollowUpTaskModel.syncIndexes(),
      AuditLogModel.syncIndexes(),
      NotificationModel.syncIndexes(),
      AttachmentModel.syncIndexes(),
      SystemSettingModel.syncIndexes(),
    ]);
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it('registers all 14 core domain models + SystemSetting and enforces schema constraints', async () => {
    const perm = await PermissionModel.create({
      key: 'meetings:create',
      module: 'meetings',
      description: 'Create sales meetings',
    });

    const role = await RoleModel.create({
      code: ROLE_CODES.SALES_EMPLOYEE,
      name: 'Sales Employee',
      description: 'Field sales representative',
      tier: 1,
      permissionIds: [perm._id],
    });

    const rep = await UserModel.create({
      employeeCode: 'OPT-4190',
      email: 'aditya.sharma@optronix.com',
      passwordHash: '$2a$12$placeholderhashedpasswordvalue000000000000000000',
      firstName: 'Aditya',
      lastName: 'Sharma',
      roleId: role._id,
      territory: 'North NCR',
    });

    const customer = await CustomerModel.create({
      customerCode: 'CUST-9001',
      companyName: 'Vertex Systems Ltd.',
      industry: 'Cloud Infrastructure',
      address: {
        street: 'Tower B, Sector 62',
        city: 'Noida',
        country: 'India',
        location: { type: 'Point', coordinates: [77.3649, 28.628] },
        geofenceRadiusMeters: 100,
      },
      assignedRepId: rep._id,
      createdBy: rep._id,
    });

    const contact = await ContactModel.create({
      customerId: customer._id,
      fullName: 'Neha Kapoor',
      designation: 'CTO',
      email: 'neha@vertex.example.com',
      phone: '+91 98100 23456',
      isPrimary: true,
    });

    const origStart = new Date('2026-11-18T10:00:00+05:30');
    const origEnd = new Date('2026-11-18T11:00:00+05:30');

    const meeting = await MeetingModel.create({
      meetingCode: 'MTG-004',
      title: 'Enterprise Architecture Review',
      purpose: 'Technical Discovery',
      customerId: customer._id,
      contactId: contact._id,
      assignedRepId: rep._id,
      createdBy: rep._id,
      originalScheduledStart: origStart,
      originalScheduledEnd: origEnd,
      currentScheduledStart: origStart,
      currentScheduledEnd: origEnd,
      locationText: 'Sector 62, Noida',
    });

    // Attempt to mutate originalScheduledStart alongside rescheduling currentScheduledStart
    const revisedStart = new Date('2026-11-18T15:00:00+05:30');
    const revisedEnd = new Date('2026-11-18T16:00:00+05:30');
    meeting.originalScheduledStart = revisedStart;
    meeting.currentScheduledStart = revisedStart;
    meeting.currentScheduledEnd = revisedEnd;
    await meeting.save();

    const reloaded = await MeetingModel.findById(meeting._id).lean();
    expect(reloaded?.originalScheduledStart.toISOString()).toBe(origStart.toISOString());
    expect(reloaded?.currentScheduledStart.toISOString()).toBe(revisedStart.toISOString());

    // Enforce partial unique index on open VisitSessions while allowing multiple COMPLETED sessions
    const session1 = await VisitSessionModel.create({
      meetingId: meeting._id,
      repId: rep._id,
      scheduleRevisionNumber: 1,
      sessionNumber: 1,
      status: VISIT_SESSION_STATUS.ACTIVE,
      checkInAt: new Date('2026-11-18T10:02:00+05:30'),
      checkInTelemetry: { latitude: 28.628, longitude: 77.3649, withinGeofence: true },
    });

    // Duplicate active check-in on same meeting must fail at DB index level
    await expect(
      VisitSessionModel.create({
        meetingId: meeting._id,
        repId: rep._id,
        scheduleRevisionNumber: 1,
        sessionNumber: 2,
        status: VISIT_SESSION_STATUS.ACTIVE,
        checkInAt: new Date('2026-11-18T10:05:00+05:30'),
        checkInTelemetry: { latitude: 28.628, longitude: 77.3649 },
      }),
    ).rejects.toThrow();

    // Complete session 1, then create session 2 cleanly
    session1.status = VISIT_SESSION_STATUS.COMPLETED;
    session1.checkOutAt = new Date('2026-11-18T10:40:00+05:30');
    session1.netDurationMinutes = 38;
    await session1.save();

    const session2 = await VisitSessionModel.create({
      meetingId: meeting._id,
      repId: rep._id,
      scheduleRevisionNumber: 2,
      sessionNumber: 2,
      status: VISIT_SESSION_STATUS.COMPLETED,
      checkInAt: new Date('2026-11-18T15:10:00+05:30'),
      checkInTelemetry: { latitude: 28.628, longitude: 77.3649 },
      checkOutAt: new Date('2026-11-18T16:00:00+05:30'),
      netDurationMinutes: 50,
    });
    expect(session2.sessionNumber).toBe(2);

    // Immutable models reject updates and deletes
    const sched = await MeetingScheduleModel.create({
      meetingId: meeting._id,
      revisionNumber: 1,
      scheduledStart: origStart,
      scheduledEnd: origEnd,
      isOriginal: true,
      changedBy: rep._id,
    });
    await expect(
      MeetingScheduleModel.updateOne({ _id: sched._id }, { changeReason: 'Tampered' }),
    ).rejects.toThrow(/immutable/i);

    const evt = await MeetingEventModel.create({
      meetingId: meeting._id,
      eventType: MEETING_EVENT_TYPE.CREATED,
      toStatus: MEETING_STATUS.SCHEDULED,
      actorId: rep._id,
    });
    await expect(MeetingEventModel.deleteOne({ _id: evt._id })).rejects.toThrow(/immutable/i);

    const audit = await AuditLogModel.create({
      auditCode: 'AUD-2026-0001',
      actorId: rep._id,
      actorRole: ROLE_CODES.SALES_EMPLOYEE,
      action: 'MEETING_CREATE',
      entityType: 'MEETING',
      entityId: meeting._id.toString(),
      integrityHash: 'sha256-sample-hash',
    });
    await expect(AuditLogModel.deleteOne({ _id: audit._id })).rejects.toThrow(/immutable/i);

    // Verify remaining models instantiate cleanly
    await MeetingOutcomeModel.create({
      meetingId: meeting._id,
      outcomeType: 'PROPOSAL_REQUESTED',
      summary: 'Proposal requested for multi-region SLA.',
      recordedBy: rep._id,
    });
    await FollowUpTaskModel.create({
      taskCode: 'FUP-001',
      title: 'Send commercial proposal',
      customerId: customer._id,
      meetingId: meeting._id,
      ownerId: rep._id,
      assignedById: rep._id,
      dueDate: new Date('2026-11-22T12:00:00Z'),
    });
    await NotificationModel.create({
      recipientId: rep._id,
      type: 'MEETING_ASSIGNED',
      title: 'New Meeting Assigned',
      message: 'MTG-004 assigned to you.',
    });
    await AttachmentModel.create({
      fileName: 'nda.pdf',
      originalName: 'Vertex_NDA.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 24500,
      storageKey: 'meetings/mtg-004/nda.pdf',
      meetingId: meeting._id,
      uploadedBy: rep._id,
    });
    await SystemSettingModel.create({ singletonKey: 'DEFAULT' });
  });
});
