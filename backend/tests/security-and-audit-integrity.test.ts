import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { AuditLogModel } from '../src/models/AuditLog.model.js';
import { ContactModel } from '../src/models/Contact.model.js';
import { CustomerModel } from '../src/models/Customer.model.js';
import {
  DEFAULT_SEED_PASSWORD,
  seedCoreUsersAndRbac,
  seedSampleDomainData,
} from '../src/seed/seedData.js';

const TEST_DB_URI =
  process.env.MONGODB_TEST_URI ??
  'mongodb://127.0.0.1:27017/optronix_audit_security_regression_test';

describe('Security Hardening, Anti-IDOR Regressions & Cryptographic Audit Chain', () => {
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

  it('enforces CSRF Origin verification on cookie-authenticated state mutations', async () => {
    const repAgent = request.agent(app);
    await repAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    // Cross-origin forged mutation with session cookie must be blocked
    const forgedMutation = await repAgent
      .patch('/api/v1/auth/profile')
      .set('Origin', 'https://evil-attacker.example')
      .send({ firstName: 'Hacked' });
    expect(forgedMutation.status).toBe(403);
    expect(forgedMutation.body.error.code).toBe('CSRF_ORIGIN_MISMATCH');

    // Legitimate origin succeeds
    const validMutation = await repAgent
      .patch('/api/v1/auth/profile')
      .set('Origin', 'http://localhost:3000')
      .send({ phone: '+91 98100 41999' });
    expect(validMutation.status).toBe(200);
  });

  it('blocks cross-customer IDOR in createFollowUp, contactId spoofing in updateMeeting, and cross-user follow-up assignment in outcomes', async () => {
    const adityaAgent = request.agent(app);
    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    // Find Rahul's customer directly via DB (another employee — Aditya has no access)
    const rahulCustomer = await CustomerModel.findOne({
      assignedRepId: users.rahul._id,
    }).lean();
    expect(rahulCustomer).toBeTruthy();

    // 1. Aditya cannot create a follow-up referencing Rahul's customer
    const idorFollowUp = await adityaAgent.post('/api/v1/follow-ups').send({
      title: 'IDOR Follow-up Attempt',
      customerId: String(rahulCustomer!._id),
      ownerId: String(users.aditya._id),
      dueDate: '2026-11-30T12:00:00.000Z',
      priority: 'HIGH',
    });
    expect(idorFollowUp.status).toBe(403);

    // 2. Aditya cannot attach another customer's contactId onto a meeting
    const adityaCust = await CustomerModel.findOne({
      assignedRepId: users.aditya._id,
      companyName: /Vertex/i,
    }).lean();
    const otherCust = await CustomerModel.findOne({
      assignedRepId: users.aditya._id,
      _id: { $ne: adityaCust!._id },
    }).lean();
    const foreignContact = await ContactModel.findOne({
      customerId: otherCust!._id,
    }).lean();

    const mtgRes = await adityaAgent.post('/api/v1/meetings').send({
      title: 'Security Contact Ownership Check',
      purpose: 'Security Audit',
      customerId: String(adityaCust!._id),
      meetingType: 'VIRTUAL',
      priority: 'MEDIUM',
      scheduledStart: '2026-11-29T10:00:00+05:30',
      scheduledEnd: '2026-11-29T11:00:00+05:30',
      locationText: 'Virtual Security Bridge',
    });
    expect(mtgRes.status).toBe(201);
    const mtgId = mtgRes.body.data.meeting.id as string;

    if (foreignContact) {
      const spoofContactRes = await adityaAgent
        .patch(`/api/v1/meetings/${mtgId}`)
        .send({ contactId: String(foreignContact._id) });
      expect(spoofContactRes.status).toBe(400);
    }

    // 3. Check in & out, then attempt assigning outcome follow-up to another employee
    await adityaAgent.post(`/api/v1/meetings/${mtgId}/check-in`).send({
      coordinates: { latitude: 28.628, longitude: 77.3649 },
      timestamp: '2026-11-29T10:01:00+05:30',
    });
    await adityaAgent.post(`/api/v1/meetings/${mtgId}/check-out`).send({
      coordinates: { latitude: 28.628, longitude: 77.3649 },
      timestamp: '2026-11-29T10:35:00+05:30',
    });

    const crossOwnerOutcome = await adityaAgent
      .post(`/api/v1/meetings/${mtgId}/outcome`)
      .send({
        outcomeType: 'FOLLOW_UP_REQUIRED',
        summary: 'Attempting unauthorized follow-up owner assignment.',
        followUpTasks: [
          {
            title: 'Push work to West Region peer',
            ownerId: String(users.rohan._id),
            dueDate: '2026-12-02T12:00:00.000Z',
            priority: 'MEDIUM',
          },
        ],
      });
    expect(crossOwnerOutcome.status).toBe(403);
  });

  it('rejects dangerous attachment extensions/MIME types and scopes dashboard conversion metrics + sidebar counts', async () => {
    const rohanAgent = request.agent(app);
    const adminAgent = request.agent(app);

    await rohanAgent.post('/api/v1/auth/login').send({
      email: 'rohan.desai@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await adminAgent.post('/api/v1/auth/login').send({
      email: 'vikramaditya.roy@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const rohanDash = await rohanAgent.get('/api/v1/meetings/dashboard-summary');
    expect(rohanDash.status).toBe(200);
    expect(rohanDash.body.data.kpis.conversionRatePercent).toBeLessThanOrEqual(
      100,
    );

    const rohanMe = await rohanAgent.get('/api/v1/auth/me');
    const adminMe = await adminAgent.get('/api/v1/auth/me');
    expect(adminMe.body.data.user.sidebarCounts.meetings).toBeGreaterThan(
      rohanMe.body.data.user.sidebarCounts.meetings,
    );

    const adityaCust = await CustomerModel.findOne({
      assignedRepId: users.aditya._id,
    }).lean();

    // Executable file extension rejected
    const adityaAgent = request.agent(app);
    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const blockedExe = await adityaAgent.post('/api/v1/attachments').send({
      originalName: 'payload_dropper.exe',
      mimeType: 'application/pdf',
      sizeBytes: 4096,
      category: 'GENERAL',
      customerId: String(adityaCust!._id),
    });
    expect(blockedExe.status).toBe(400);

    // Unsafe MIME type rejected
    const blockedMime = await adityaAgent.post('/api/v1/attachments').send({
      originalName: 'xss_vector.pdf',
      mimeType: 'text/html',
      sizeBytes: 4096,
      category: 'GENERAL',
      customerId: String(adityaCust!._id),
    });
    expect(blockedMime.status).toBe(400);
  });

  it('verifies SHA-256 cryptographic AuditLog hash chain integrity and blocks in-place mutations', async () => {
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/v1/auth/login').send({
      email: 'vikramaditya.roy@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const auditRes = await adminAgent.get('/api/v1/admin/audit-logs?limit=25');
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.chainIntegrity.valid).toBe(true);
    expect(auditRes.body.data.chainIntegrity.checkedCount).toBeGreaterThan(0);

    // Immutability hook blocks updateOne and deleteOne
    await expect(
      AuditLogModel.updateOne({}, { $set: { action: 'TAMPERED' } }),
    ).rejects.toThrow(/immutable/i);
    await expect(AuditLogModel.deleteOne({})).rejects.toThrow(/immutable/i);
  });
});
