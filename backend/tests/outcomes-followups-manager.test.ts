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
  'mongodb://127.0.0.1:27017/optronix_phase07_outcomes_manager_test';

describe('Outcomes, Follow-Ups & Sales Manager Governance', () => {
  const app = createApp();
  let users: Awaited<ReturnType<typeof seedCoreUsersAndRbac>>;
  let vertexCustomerId: string;

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
    vertexCustomerId = custRes.body.data.customers[0].id as string;
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it('enforces Rule #5 (completion requires outcome), Rule #6 (Follow-up Required needs owner & due date), Rule #2/#7 (governed Manager reopen with reason)', async () => {
    const repAgent = request.agent(app);
    const mgrAgent = request.agent(app);

    await repAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await mgrAgent.post('/api/v1/auth/login').send({
      email: 'priya.mehta@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    // Create, check in, and check out a meeting
    const createRes = await repAgent.post('/api/v1/meetings').send({
      title: 'Outcome & Governance Test Meeting',
      purpose: 'Commercial Finalization',
      customerId: vertexCustomerId,
      meetingType: 'IN_PERSON',
      priority: 'HIGH',
      scheduledStart: '2026-11-22T10:00:00+05:30',
      scheduledEnd: '2026-11-22T11:00:00+05:30',
      locationText: 'Sector 62, Noida',
      targetCoordinates: { latitude: 28.628, longitude: 77.3649 },
    });
    const mtgId = createRes.body.data.meeting.id as string;

    await repAgent.post(`/api/v1/meetings/${mtgId}/check-in`).send({
      coordinates: { latitude: 28.62802, longitude: 77.36492 },
      timestamp: '2026-11-22T10:00:00+05:30',
    });
    await repAgent.post(`/api/v1/meetings/${mtgId}/check-out`).send({
      coordinates: { latitude: 28.62802, longitude: 77.36492 },
      timestamp: '2026-11-22T10:45:00+05:30',
    });

    // Rule #5: Attempting explicit /complete without an outcome is rejected!
    const completeWithoutOutcome = await repAgent.post(
      `/api/v1/meetings/${mtgId}/complete`,
    );
    expect(completeWithoutOutcome.status).toBe(422);
    expect(completeWithoutOutcome.body.error.code).toBe(
      'OUTCOME_REQUIRED_FOR_COMPLETION',
    );

    // Rule #6: Recording FOLLOW_UP_REQUIRED without owner and due date is rejected!
    const badFollowUpOutcome = await repAgent
      .post(`/api/v1/meetings/${mtgId}/outcome`)
      .send({
        outcomeType: 'FOLLOW_UP_REQUIRED',
        summary: 'Client requested revised compliance matrix next week.',
        followUpTasks: [],
      });
    expect(badFollowUpOutcome.status).toBe(400);

    // Valid FOLLOW_UP_REQUIRED with ownerId and dueDate completes & locks meeting + creates FollowUpTask
    const validOutcome = await repAgent
      .post(`/api/v1/meetings/${mtgId}/outcome`)
      .send({
        outcomeType: 'FOLLOW_UP_REQUIRED',
        summary: 'Client requested revised compliance matrix next week.',
        minutes: 'Discussed SOC2 addendum and multi-region RTO.',
        followUpTasks: [
          {
            title: 'Deliver SOC2 compliance matrix to Vertex CTO',
            ownerId: String(users.aditya._id),
            dueDate: '2026-11-26T12:00:00.000Z',
            priority: 'HIGH',
          },
        ],
        completeAndLock: true,
      });
    expect(validOutcome.status).toBe(200);
    expect(validOutcome.body.data.meeting.status).toBe('COMPLETED');
    expect(validOutcome.body.data.meeting.followUps).toHaveLength(1);

    // Rule #2 / #6 (Testing Requirement #6): Sales Employee CANNOT reopen completed meeting!
    const repReopen = await repAgent
      .post(`/api/v1/meetings/${mtgId}/reopen`)
      .send({ reason: 'Employee trying to unlock own completed meeting' });
    expect(repReopen.status).toBe(403);

    // Rule #7: Sales Manager reopening WITHOUT valid reason is rejected!
    const mgrReopenNoReason = await mgrAgent
      .post(`/api/v1/meetings/${mtgId}/reopen`)
      .send({ reason: '' });
    expect(mgrReopenNoReason.status).toBe(400);

    // Sales Manager reopening WITH mandatory reason succeeds and preserves revision history
    const mgrReopenOk = await mgrAgent
      .post(`/api/v1/meetings/${mtgId}/reopen`)
      .send({
        reason: 'Customer CTO requested scope amendment to commercial terms',
        explanation: 'Adding multi-region DR clause.',
      });
    expect(mgrReopenOk.status).toBe(200);
    expect(mgrReopenOk.body.data.meeting.status).toBe('REOPENED');
    expect(mgrReopenOk.body.data.meeting.reopenCount).toBe(1);

    // Manager Team Activity dashboard & follow-up completion work cleanly
    const teamDash = await mgrAgent.get('/api/v1/manager/team-activity');
    expect(teamDash.status).toBe(200);
    expect(teamDash.body.data.repExecution.length).toBeGreaterThanOrEqual(3);

    const fupId = validOutcome.body.data.meeting.followUps[0].id as string;
    const completeFup = await repAgent.post(
      `/api/v1/follow-ups/${fupId}/complete`,
    );
    expect(completeFup.status).toBe(200);
    expect(completeFup.body.data.followUp.status).toBe('COMPLETED');
  });
});
