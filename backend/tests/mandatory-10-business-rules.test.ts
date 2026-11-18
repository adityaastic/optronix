import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { AuditLogModel } from '../src/models/AuditLog.model.js';
import {
  DEFAULT_SEED_PASSWORD,
  seedCoreUsersAndRbac,
  seedSampleDomainData,
} from '../src/seed/seedData.js';

const TEST_DB_URI =
  process.env.MONGODB_TEST_URI ??
  'mongodb://127.0.0.1:27017/optronix_phase09_mandatory_10_rules_test';

describe('Mandatory 10 Business & Security Assertions (OPTRONIX Specification)', () => {
  const app = createApp();
  let users: Awaited<ReturnType<typeof seedCoreUsersAndRbac>>;
  let adityaCustomerId: string;
  let sharedLifecycleMtgId: string;

  const origStart = '2026-11-25T10:00:00+05:30';
  const origEnd = '2026-11-25T11:00:00+05:30';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.db?.dropDatabase();
    users = await seedCoreUsersAndRbac();
    await seedSampleDomainData(users);

    const adityaAgent = request.agent(app);
    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    const custRes = await adityaAgent.get('/api/v1/customers?search=Vertex');
    adityaCustomerId = custRes.body.data.customers[0].id as string;

    const createRes = await adityaAgent.post('/api/v1/meetings').send({
      title: 'OPTRONIX 10-Rule Verification Meeting',
      purpose: 'Enterprise Deployment Governance',
      customerId: adityaCustomerId,
      meetingType: 'IN_PERSON',
      priority: 'HIGH',
      scheduledStart: origStart,
      scheduledEnd: origEnd,
      locationText: 'Vertex Tech Park, Sector 62, Noida',
      targetCoordinates: { latitude: 28.628, longitude: 77.3649 },
    });
    sharedLifecycleMtgId = createRes.body.data.meeting.id as string;
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it('1. Employee cannot access another employee’s meeting (Anti-IDOR)', async () => {
    const rohanAgent = request.agent(app);
    await rohanAgent.post('/api/v1/auth/login').send({
      email: 'rohan.desai@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const res = await rohanAgent.get(
      `/api/v1/meetings/${sharedLifecycleMtgId}`,
    );
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('2. Checkout without active visit session is rejected', async () => {
    const adityaAgent = request.agent(app);
    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const res = await adityaAgent
      .post(`/api/v1/meetings/${sharedLifecycleMtgId}/check-out`)
      .send({ timestamp: '2026-11-25T10:15:00+05:30' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NO_ACTIVE_VISIT_SESSION');
  });

  it('3. Duplicate check-in is rejected while a visit session is active', async () => {
    const adityaAgent = request.agent(app);
    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    await adityaAgent.post(`/api/v1/meetings/${sharedLifecycleMtgId}/confirm`);

    const firstCheckIn = await adityaAgent
      .post(`/api/v1/meetings/${sharedLifecycleMtgId}/check-in`)
      .send({
        coordinates: { latitude: 28.62802, longitude: 77.36492 },
        timestamp: '2026-11-25T10:02:00+05:30',
      });
    expect(firstCheckIn.status).toBe(200);

    const duplicateCheckIn = await adityaAgent
      .post(`/api/v1/meetings/${sharedLifecycleMtgId}/check-in`)
      .send({
        coordinates: { latitude: 28.62802, longitude: 77.36492 },
        timestamp: '2026-11-25T10:06:00+05:30',
      });
    expect(duplicateCheckIn.status).toBe(409);
    expect(duplicateCheckIn.body.error.code).toBe('DUPLICATE_CHECKIN');
  });

  it('4. Original schedule remains unchanged after rescheduling (Immutable History)', async () => {
    const adityaAgent = request.agent(app);
    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const reschedRes = await adityaAgent
      .post(`/api/v1/meetings/${sharedLifecycleMtgId}/reschedule`)
      .send({
        scheduledStart: '2026-11-25T15:00:00+05:30',
        scheduledEnd: '2026-11-25T16:00:00+05:30',
        reason: 'Customer requested afternoon technical session at 3:00 PM',
        checkOutActiveSession: true,
        checkOutTimestamp: '2026-11-25T10:40:00+05:30',
        checkOutCoordinates: { latitude: 28.62802, longitude: 77.36492 },
      });

    expect(reschedRes.status).toBe(200);
    const mtg = reschedRes.body.data.meeting;
    expect(new Date(mtg.originalScheduledStart).toISOString()).toBe(
      new Date(origStart).toISOString(),
    );
    expect(new Date(mtg.originalScheduledEnd).toISOString()).toBe(
      new Date(origEnd).toISOString(),
    );
    expect(mtg.schedules).toHaveLength(2);
    expect(mtg.currentScheduleRevision).toBe(2);
  });

  it('5. Multiple visit sessions calculate duration strictly from sum of sessions (38m + 50m = 88m, NOT 358m)', async () => {
    const adityaAgent = request.agent(app);
    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const secondCheckIn = await adityaAgent
      .post(`/api/v1/meetings/${sharedLifecycleMtgId}/check-in`)
      .send({
        coordinates: { latitude: 28.62802, longitude: 77.36492 },
        timestamp: '2026-11-25T15:10:00+05:30',
      });
    expect(secondCheckIn.status).toBe(200);

    const finalCheckOut = await adityaAgent
      .post(`/api/v1/meetings/${sharedLifecycleMtgId}/check-out`)
      .send({
        coordinates: { latitude: 28.62802, longitude: 77.36492 },
        timestamp: '2026-11-25T16:00:00+05:30',
      });
    expect(finalCheckOut.status).toBe(200);

    const mtg = finalCheckOut.body.data.meeting;
    expect(mtg.visitSessions).toHaveLength(2);
    expect(mtg.totalActualDurationMinutes).toBe(88);
    expect(mtg.status).toBe('AWAITING_OUTCOME');
  });

  it('6. Meeting completion without outcome is rejected', async () => {
    const adityaAgent = request.agent(app);
    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const completeWithoutOutcome = await adityaAgent.post(
      `/api/v1/meetings/${sharedLifecycleMtgId}/complete`,
    );
    expect(completeWithoutOutcome.status).toBe(422);
    expect(completeWithoutOutcome.body.error.code).toBe(
      'OUTCOME_REQUIRED_FOR_COMPLETION',
    );
  });

  it('7. Follow-up Required outcome demands an owner and due date', async () => {
    const adityaAgent = request.agent(app);
    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const invalidOutcome = await adityaAgent
      .post(`/api/v1/meetings/${sharedLifecycleMtgId}/outcome`)
      .send({
        outcomeType: 'FOLLOW_UP_REQUIRED',
        summary: 'Need commercial sign-off and revised BoM pricing sheet.',
        followUpTasks: [],
      });
    expect(invalidOutcome.status).toBe(400);

    // Valid outcome with ownerId and dueDate locks the meeting as COMPLETED
    const validOutcome = await adityaAgent
      .post(`/api/v1/meetings/${sharedLifecycleMtgId}/outcome`)
      .send({
        outcomeType: 'FOLLOW_UP_REQUIRED',
        summary: 'Need commercial sign-off and revised BoM pricing sheet.',
        minutes: 'Reviewed 240-seat enterprise roll-out plan.',
        followUpTasks: [
          {
            title: 'Send revised BoM pricing',
            ownerId: String(users.aditya._id),
            dueDate: '2026-11-28T17:00:00+05:30',
            priority: 'HIGH',
          },
        ],
        completeAndLock: true,
      });
    expect(validOutcome.status).toBe(200);
    expect(validOutcome.body.data.meeting.status).toBe('COMPLETED');
  });

  it('8. Completed meetings cannot be modified by unauthorized users', async () => {
    const adityaAgent = request.agent(app);
    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const patchLocked = await adityaAgent
      .patch(`/api/v1/meetings/${sharedLifecycleMtgId}`)
      .send({ title: 'Unauthorized Edit After Completion' });

    expect(patchLocked.status).toBe(422);
    expect(patchLocked.body.error.code).toBe('MEETING_LOCKED_FOR_EDIT');
  });

  it('9. Unauthorized employee cannot reopen completed meeting', async () => {
    const adityaAgent = request.agent(app);
    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const reopenDenied = await adityaAgent
      .post(`/api/v1/meetings/${sharedLifecycleMtgId}/reopen`)
      .send({ reason: 'Employee attempting self-reopen' });

    expect(reopenDenied.status).toBe(403);
  });

  it('10. Manager reopening requires a mandatory reason and writes immutable AuditLog events', async () => {
    const mgrAgent = request.agent(app);
    await mgrAgent.post('/api/v1/auth/login').send({
      email: 'priya.mehta@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    // Missing/empty reason is rejected
    const missingReason = await mgrAgent
      .post(`/api/v1/meetings/${sharedLifecycleMtgId}/reopen`)
      .send({ reason: '' });
    expect(missingReason.status).toBe(400);

    // Valid manager reopen succeeds
    const validReopen = await mgrAgent
      .post(`/api/v1/meetings/${sharedLifecycleMtgId}/reopen`)
      .send({
        reason:
          'Approved reopen to attach signed CFO commercial addendum document.',
      });
    expect(validReopen.status).toBe(200);
    expect(validReopen.body.data.meeting.status).toBe('REOPENED');

    // Verify immutable AuditLog entries exist for the lifecycle & governance chain
    const logs = await AuditLogModel.find({
      entityId: sharedLifecycleMtgId,
    }).lean();
    expect(logs.length).toBeGreaterThanOrEqual(4);
    expect(logs.every((l) => l.integrityHash.length === 64)).toBe(true);
  });
});
