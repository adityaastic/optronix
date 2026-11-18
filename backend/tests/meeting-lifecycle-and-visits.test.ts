import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  DEFAULT_SEED_PASSWORD,
  seedCoreUsersAndRbac,
  seedSampleDomainData,
} from '../src/seed/seedData.js';

const TEST_DB_URI =
  process.env.MONGODB_TEST_URI ??
  'mongodb://127.0.0.1:27017/optronix_phase06_lifecycle_test';

describe('Meeting Lifecycle, Multi-Session Visit Tracking & Rescheduling', () => {
  const app = createApp();
  let users: Awaited<ReturnType<typeof seedCoreUsersAndRbac>>;
  let customerId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.db?.dropDatabase();
    users = await seedCoreUsersAndRbac();
    await seedSampleDomainData(users);

    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    const custRes = await agent.get('/api/v1/customers?search=Vertex');
    customerId = custRes.body.data.customers[0].id as string;
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it('executes the exact split-visit & reschedule scenario (10:02-10:40 + 15:10-16:00 = 88 mins) and enforces check-in/out guards', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const origStart = '2026-11-20T10:00:00+05:30';
    const origEnd = '2026-11-20T11:00:00+05:30';

    // 1. Create original meeting 10:00 AM - 11:00 AM
    const createRes = await agent.post('/api/v1/meetings').send({
      title: 'Split-Visit Scenario Verification',
      purpose: 'Architecture Review',
      customerId,
      meetingType: 'IN_PERSON',
      priority: 'HIGH',
      scheduledStart: origStart,
      scheduledEnd: origEnd,
      locationText: 'Vertex Tech Park, Sector 62, Noida',
      targetCoordinates: { latitude: 28.628, longitude: 77.3649 },
    });
    expect(createRes.status).toBe(201);
    const mtgId = createRes.body.data.meeting.id as string;

    //Rule #3: Check-out without active check-in must be rejected
    const prematureCheckout = await agent
      .post(`/api/v1/meetings/${mtgId}/check-out`)
      .send({ timestamp: '2026-11-20T10:10:00+05:30' });
    expect(prematureCheckout.status).toBe(422);
    expect(prematureCheckout.body.error.code).toBe('NO_ACTIVE_VISIT_SESSION');

    // Confirm meeting
    const confirmRes = await agent.post(`/api/v1/meetings/${mtgId}/confirm`);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.meeting.status).toBe('CONFIRMED');

    // 2. First check-in at 10:02 AM (within 100m geofence)
    const checkIn1 = await agent.post(`/api/v1/meetings/${mtgId}/check-in`).send({
      coordinates: {
        latitude: 28.62805,
        longitude: 77.36495,
        accuracyMeters: 3.5,
      },
      timestamp: '2026-11-20T10:02:00+05:30',
      arrivalNotes: 'Arrived at Vertex lobby, CTO confirmed ready.',
    });
    expect(checkIn1.status).toBe(200);
    expect(checkIn1.body.data.meeting.status).toBe('IN_PROGRESS');
    expect(checkIn1.body.data.meeting.visitSessions).toHaveLength(1);

    // Rule #4: Duplicate check-in while session 1 is active must be rejected
    const dupCheckIn = await agent
      .post(`/api/v1/meetings/${mtgId}/check-in`)
      .send({
        coordinates: { latitude: 28.62805, longitude: 77.36495 },
        timestamp: '2026-11-20T10:05:00+05:30',
      });
    expect(dupCheckIn.status).toBe(409);
    expect(dupCheckIn.body.error.code).toBe('DUPLICATE_CHECKIN');

    // 3. At 10:40 AM, customer requests continuation at 3:00 PM - 4:00 PM
    const rescheduleRes = await agent
      .post(`/api/v1/meetings/${mtgId}/reschedule`)
      .send({
        scheduledStart: '2026-11-20T15:00:00+05:30',
        scheduledEnd: '2026-11-20T16:00:00+05:30',
        reason: 'Customer requested second session at 3:00 PM with CFO',
        checkOutActiveSession: true,
        checkOutTimestamp: '2026-11-20T10:40:00+05:30',
        checkOutCoordinates: { latitude: 28.62805, longitude: 77.36495 },
      });
    expect(rescheduleRes.status).toBe(200);
    const afterResched = rescheduleRes.body.data.meeting;
    expect(afterResched.status).toBe('RESCHEDULED');
    expect(afterResched.totalActualDurationMinutes).toBe(38);
    expect(afterResched.schedules).toHaveLength(2);
    // Rule #8: Original scheduled start & end remain untouched
    expect(new Date(afterResched.originalScheduledStart).toISOString()).toBe(
      new Date(origStart).toISOString(),
    );
    expect(new Date(afterResched.scheduledStart).toISOString()).toBe(
      new Date('2026-11-20T15:00:00+05:30').toISOString(),
    );

    // Check-out while between sessions is rejected
    const betweenSessionsCheckout = await agent
      .post(`/api/v1/meetings/${mtgId}/check-out`)
      .send({ timestamp: '2026-11-20T12:00:00+05:30' });
    expect(betweenSessionsCheckout.status).toBe(422);

    // 4. Second check-in at 3:10 PM
    const checkIn2 = await agent.post(`/api/v1/meetings/${mtgId}/check-in`).send({
      coordinates: {
        latitude: 28.62802,
        longitude: 77.36492,
        accuracyMeters: 4.1,
      },
      timestamp: '2026-11-20T15:10:00+05:30',
      arrivalNotes: 'Reconvened with CFO & CTO for afternoon session.',
    });
    expect(checkIn2.status).toBe(200);
    expect(checkIn2.body.data.meeting.status).toBe('IN_PROGRESS');
    expect(checkIn2.body.data.meeting.visitSessions).toHaveLength(2);

    // 5. Final check-out at 4:00 PM
    const finalCheckout = await agent
      .post(`/api/v1/meetings/${mtgId}/check-out`)
      .send({
        coordinates: { latitude: 28.62802, longitude: 77.36492 },
        timestamp: '2026-11-20T16:00:00+05:30',
        fieldNotes: 'Completed technical & commercial alignment across both sessions.',
      });
    expect(finalCheckout.status).toBe(200);
    const finalMtg = finalCheckout.body.data.meeting;

    // Verify Rule #9: Sum of completed visit sessions (38 + 50 = 88 mins), NOT 10:02->16:00 (358 mins)!
    expect(finalMtg.completedSessionCount).toBe(2);
    expect(finalMtg.visitSessions[0].netDurationMinutes).toBe(38);
    expect(finalMtg.visitSessions[1].netDurationMinutes).toBe(50);
    expect(finalMtg.totalActualDurationMinutes).toBe(88);
    // Rule #5: Meeting awaits outcome and is NOT prematurely COMPLETED
    expect(finalMtg.status).toBe('AWAITING_OUTCOME');
  });

  it('handles pause/resume subtraction and geofence out-of-range validation', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const createRes = await agent.post('/api/v1/meetings').send({
      title: 'Pause & Geofence Verification',
      purpose: 'Site Inspection',
      customerId,
      meetingType: 'IN_PERSON',
      priority: 'MEDIUM',
      scheduledStart: '2026-11-21T10:00:00+05:30',
      scheduledEnd: '2026-11-21T11:00:00+05:30',
      locationText: 'Sector 62, Noida',
      targetCoordinates: { latitude: 28.628, longitude: 77.3649 },
    });
    const mtgId = createRes.body.data.meeting.id as string;

    // Out of geofence (~2km away) without override reason is rejected
    const farCheckIn = await agent
      .post(`/api/v1/meetings/${mtgId}/check-in`)
      .send({
        coordinates: { latitude: 28.65, longitude: 77.38 },
        timestamp: '2026-11-21T10:00:00+05:30',
      });
    expect(farCheckIn.status).toBe(422);
    expect(farCheckIn.body.error.code).toBe('GEOFENCE_OUT_OF_RANGE');

    // Out of geofence WITH documented override reason succeeds
    const overrideCheckIn = await agent
      .post(`/api/v1/meetings/${mtgId}/check-in`)
      .send({
        coordinates: { latitude: 28.65, longitude: 77.38 },
        timestamp: '2026-11-21T10:00:00+05:30',
        geofenceOverrideReason: 'Client moved meeting to adjacent annex campus.',
      });
    expect(overrideCheckIn.status).toBe(200);

    // Pause at 10:15, Resume at 10:30 (15m pause), Check out at 11:00 -> 45m net active duration
    const pauseRes = await agent.post(`/api/v1/meetings/${mtgId}/pause`).send({
      timestamp: '2026-11-21T10:15:00+05:30',
      reason: 'Client stepped out for emergency production call',
    });
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.data.meeting.status).toBe('PAUSED');

    const resumeRes = await agent.post(`/api/v1/meetings/${mtgId}/resume`).send({
      timestamp: '2026-11-21T10:30:00+05:30',
      notes: 'Resumed session',
    });
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.data.meeting.status).toBe('IN_PROGRESS');

    const checkoutRes = await agent
      .post(`/api/v1/meetings/${mtgId}/check-out`)
      .send({
        timestamp: '2026-11-21T11:00:00+05:30',
      });
    expect(checkoutRes.status).toBe(200);
    expect(checkoutRes.body.data.meeting.visitSessions[0].grossDurationMinutes).toBe(60);
    expect(checkoutRes.body.data.meeting.visitSessions[0].pausedDurationMinutes).toBe(15);
    expect(checkoutRes.body.data.meeting.totalActualDurationMinutes).toBe(45);
  });
});
