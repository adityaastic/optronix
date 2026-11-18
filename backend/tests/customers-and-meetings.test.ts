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
  'mongodb://127.0.0.1:27017/optronix_phase05_customers_meetings_test';

describe('Customer & Meeting Management REST APIs + Business Rules', () => {
  const app = createApp();
  let users: Awaited<ReturnType<typeof seedCoreUsersAndRbac>>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.db?.dropDatabase();
    users = await seedCoreUsersAndRbac();
    await seedSampleDomainData(users);
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it('scopes customer and meeting listings strictly to Sales Employee vs Sales Manager', async () => {
    const adityaAgent = request.agent(app);
    const priyaAgent = request.agent(app);

    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await priyaAgent.post('/api/v1/auth/login').send({
      email: 'priya.mehta@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const adityaCustomers = await adityaAgent.get('/api/v1/customers');
    expect(adityaCustomers.status).toBe(200);
    expect(
      adityaCustomers.body.data.customers.every(
        (c: { assignedRep: { id: string } }) =>
          c.assignedRep.id === String(users.aditya._id),
      ),
    ).toBe(true);

    const priyaCustomers = await priyaAgent.get('/api/v1/customers');
    expect(priyaCustomers.status).toBe(200);
    expect(priyaCustomers.body.data.customers.length).toBeGreaterThan(
      adityaCustomers.body.data.customers.length,
    );

    // Find Rahul's meeting (MTG-005) via Priya, verify Aditya gets 403 anti-IDOR block
    const priyaMeetings = await priyaAgent.get('/api/v1/meetings?search=MTG-005');
    expect(priyaMeetings.status).toBe(200);
    const rahulMtgId = priyaMeetings.body.data.meetings[0]?.id as string;
    expect(rahulMtgId).toBeTruthy();

    const adityaUnauthorizedMtg = await adityaAgent.get(
      `/api/v1/meetings/${rahulMtgId}`,
    );
    expect(adityaUnauthorizedMtg.status).toBe(403);
    expect(adityaUnauthorizedMtg.body.error.code).toBe('OWNERSHIP_VIOLATION');
  });

  it('creates customer + meeting with immutable Schedule Rev 1, confirms, cancels, and blocks editing COMPLETED meetings', async () => {
    const adityaAgent = request.agent(app);
    const priyaAgent = request.agent(app);

    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await priyaAgent.post('/api/v1/auth/login').send({
      email: 'priya.mehta@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    // Create customer
    const createCustRes = await adityaAgent.post('/api/v1/customers').send({
      companyName: 'Hyperion Cloud Systems',
      industry: 'Cloud Native Security',
      tier: 'ENTERPRISE_T1',
      annualRevenue: 260000,
      address: {
        street: 'DLF CyberPark Block C',
        city: 'Gurugram',
        country: 'India',
        coordinates: { latitude: 28.501, longitude: 77.091 },
        geofenceRadiusMeters: 100,
      },
      primaryContact: {
        fullName: 'Elena Rostova',
        designation: 'Head of Procurement',
        email: 'elena@hyperion.example.com',
        phone: '+91 98112 33445',
      },
    });
    expect(createCustRes.status).toBe(201);
    const custId = createCustRes.body.data.customer.id as string;

    // Schedule meeting
    const start = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + 49 * 3600 * 1000).toISOString();
    const createMtgRes = await adityaAgent.post('/api/v1/meetings').send({
      title: 'Hyperion Procurement Alignment',
      purpose: 'Commercial Review',
      customerId: custId,
      meetingType: 'IN_PERSON',
      priority: 'HIGH',
      scheduledStart: start,
      scheduledEnd: end,
      locationText: 'DLF CyberPark Block C, Gurugram',
      agenda: 'Finalize enterprise security MSA.',
      tags: ['Cloud', 'MSA'],
    });
    expect(createMtgRes.status).toBe(201);
    const mtgId = createMtgRes.body.data.meeting.id as string;
    expect(createMtgRes.body.data.meeting.schedules).toHaveLength(1);
    expect(createMtgRes.body.data.meeting.schedules[0].revisionNumber).toBe(1);

    // Confirm meeting
    const confirmRes = await adityaAgent.post(`/api/v1/meetings/${mtgId}/confirm`);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.meeting.status).toBe('CONFIRMED');

    // Cancel meeting requires reason
    const badCancel = await adityaAgent
      .post(`/api/v1/meetings/${mtgId}/cancel`)
      .send({ reason: 'abc' });
    expect(badCancel.status).toBe(400);

    const cancelRes = await adityaAgent
      .post(`/api/v1/meetings/${mtgId}/cancel`)
      .send({ reason: 'Client executive travel emergency, moving to next month.' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.meeting.status).toBe('CANCELLED');

    // Rule #10: Completed meeting (MTG-001) cannot be edited
    const listCompleted = await adityaAgent.get('/api/v1/meetings?search=MTG-001');
    const mtg1Id = listCompleted.body.data.meetings[0].id as string;
    const editCompleted = await adityaAgent
      .patch(`/api/v1/meetings/${mtg1Id}`)
      .send({ title: 'Unauthorized Tamper Title' });
    expect(editCompleted.status).toBe(422);
    expect(editCompleted.body.error.code).toBe('MEETING_LOCKED_FOR_EDIT');

    // Sales Employee cannot archive customer; Sales Manager CAN archive customer
    const repArchive = await adityaAgent
      .post(`/api/v1/customers/${custId}/archive`)
      .send({ reason: 'Duplicate account cleanup' });
    expect(repArchive.status).toBe(403);

    const mgrArchive = await priyaAgent
      .post(`/api/v1/customers/${custId}/archive`)
      .send({ reason: 'Consolidated into parent enterprise account' });
    expect(mgrArchive.status).toBe(200);
    expect(mgrArchive.body.data.customer.isArchived).toBe(true);
  });
});
