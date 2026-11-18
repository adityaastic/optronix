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
  'mongodb://127.0.0.1:27017/optronix_phase08_reports_admin_test';

describe('Reports, Analytics, Notifications, Attachments & Admin Governance', () => {
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

  it('scopes /api/v1/reports/analytics by role and blocks unauthorized cross-rep filtering', async () => {
    const repAgent = request.agent(app);
    const mgrAgent = request.agent(app);
    const adminAgent = request.agent(app);

    await repAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await mgrAgent.post('/api/v1/auth/login').send({
      email: 'priya.mehta@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await adminAgent.post('/api/v1/auth/login').send({
      email: 'vikramaditya.roy@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const repAnalytics = await repAgent.get('/api/v1/reports/analytics');
    expect(repAnalytics.status).toBe(200);
    expect(repAnalytics.body.data.employeePerformance).toHaveLength(1);
    expect(repAnalytics.body.data.employeePerformance[0].fullName).toContain(
      'Aditya',
    );

    // Anti-IDOR: Rep cannot request analytics for another rep
    const forbiddenCrossRep = await repAgent.get(
      `/api/v1/reports/analytics?employeeId=${String(users.rahul._id)}`,
    );
    expect(forbiddenCrossRep.status).toBe(403);

    // Manager sees North Region team performance (Priya + 3 direct reports = 4 users)
    const mgrAnalytics = await mgrAgent.get('/api/v1/reports/analytics');
    expect(mgrAnalytics.status).toBe(200);
    expect(mgrAnalytics.body.data.employeePerformance.length).toBeGreaterThanOrEqual(4);

    // Admin sees org-wide performance across North and West regions
    const adminAnalytics = await adminAgent.get('/api/v1/reports/analytics');
    expect(adminAnalytics.status).toBe(200);
    expect(
      adminAnalytics.body.data.employeePerformance.length,
    ).toBeGreaterThan(mgrAnalytics.body.data.employeePerformance.length);
  });

  it('rejects non-Admin roles from /api/v1/admin/* and supports full Admin governance lifecycle', async () => {
    const repAgent = request.agent(app);
    const mgrAgent = request.agent(app);
    const adminAgent = request.agent(app);

    await repAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await mgrAgent.post('/api/v1/auth/login').send({
      email: 'priya.mehta@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await adminAgent.post('/api/v1/auth/login').send({
      email: 'vikramaditya.roy@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const repDenied = await repAgent.get('/api/v1/admin/overview');
    expect(repDenied.status).toBe(403);

    const mgrDenied = await mgrAgent.get('/api/v1/admin/users');
    expect(mgrDenied.status).toBe(403);

    const overviewRes = await adminAgent.get('/api/v1/admin/overview');
    expect(overviewRes.status).toBe(200);
    expect(overviewRes.body.data.stats.totalUsers).toBeGreaterThanOrEqual(7);

    // Provision a new Sales Employee
    const provisionRes = await adminAgent.post('/api/v1/admin/users').send({
      email: 'neha.kapoor@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
      firstName: 'Neha',
      lastName: 'Kapoor',
      roleCode: 'SALES_EMPLOYEE',
      managerId: String(users.northManager._id),
      territory: 'North India — Delhi South',
      department: 'Enterprise Field Sales',
      status: 'ACTIVE',
    });
    expect(provisionRes.status).toBe(201);
    const newUserId = provisionRes.body.data.user.id as string;

    // Newly provisioned user can sign in immediately
    const nehaAgent = request.agent(app);
    const nehaLogin = await nehaAgent.post('/api/v1/auth/login').send({
      email: 'neha.kapoor@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    expect(nehaLogin.status).toBe(200);

    // Update System Settings
    const settingsRes = await adminAgent.patch('/api/v1/admin/settings').send({
      defaultGeofenceRadiusMeters: 150,
      checkInBufferMinutes: 20,
      enableSlaEscalationAlerts: true,
    });
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.data.settings.defaultGeofenceRadiusMeters).toBe(150);

    // Deactivate Neha and reallocate active items to Aditya
    const deactivateRes = await adminAgent
      .post(`/api/v1/admin/users/${newUserId}/deactivate`)
      .send({
        reason: 'Territory restructuring into Noida Sector 62 pod',
        reassignMeetingsToUserId: String(users.aditya._id),
        reassignFollowUpsToUserId: String(users.aditya._id),
      });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.user.status).toBe('INACTIVE');

    // Neha's existing JWT cookie is immediately invalidated via tokenVersion + status check!
    const nehaSessionAfter = await nehaAgent.get('/api/v1/auth/me');
    expect(nehaSessionAfter.status).toBe(401);

    // Verify Audit Logs captured USER_PROVISIONED, SETTINGS_UPDATED, and USER_DEACTIVATED
    const auditRes = await adminAgent.get('/api/v1/admin/audit-logs?limit=20');
    expect(auditRes.status).toBe(200);
    const actions = (
      auditRes.body.data.auditLogs as Array<{ action: string }>
    ).map((a) => a.action);
    expect(actions).toContain('USER_PROVISIONED');
    expect(actions).toContain('SETTINGS_UPDATED');
    expect(actions).toContain('USER_DEACTIVATED');
  });

  it('supports notifications mark-read and enforces anti-IDOR on attachments', async () => {
    const adityaAgent = request.agent(app);
    const rohanWestAgent = request.agent(app);

    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await rohanWestAgent.post('/api/v1/auth/login').send({
      email: 'rohan.desai@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    const notifRes = await adityaAgent.get('/api/v1/notifications');
    expect(notifRes.status).toBe(200);
    expect(Array.isArray(notifRes.body.data.notifications)).toBe(true);

    const markAllRes = await adityaAgent.post('/api/v1/notifications/read-all');
    expect(markAllRes.status).toBe(200);

    // Register an attachment on Aditya's meeting
    const mtgsRes = await adityaAgent.get('/api/v1/meetings?limit=5');
    const adityaMtgId = mtgsRes.body.data.meetings[0].id as string;

    const attachCreate = await adityaAgent.post('/api/v1/attachments').send({
      originalName: 'Vertex_Enterprise_Architecture_Deck.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2457600,
      category: 'PROPOSAL',
      meetingId: adityaMtgId,
    });
    expect(attachCreate.status).toBe(201);

    // Anti-IDOR: Rohan (West Region) cannot read attachments on Aditya's meeting
    const rohanForbidden = await rohanWestAgent.get(
      `/api/v1/attachments?meetingId=${adityaMtgId}`,
    );
    expect(rohanForbidden.status).toBe(403);
  });

  it('supports secure single-use invitation-based user onboarding without public registration', async () => {
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/v1/auth/login').send({
      email: 'vikramaditya.roy@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    // 1. Admin invites a new Sales Manager
    const inviteRes = await adminAgent.post('/api/v1/admin/users/invite').send({
      email: 'ananya.iyer@optronix.com',
      firstName: 'Ananya',
      lastName: 'Iyer',
      phone: '+91 98400 11223',
      roleCode: 'SALES_MANAGER',
      territory: 'South India — Bengaluru Hub',
      department: 'Enterprise Field Sales',
    });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.data.user.status).toBe('PENDING');
    const invitePath = inviteRes.body.data.invitePath as string;
    const rawToken = decodeURIComponent(invitePath.split('token=')[1]!);

    // 2. Pending invited user CANNOT log in directly before activating
    const prematureLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'ananya.iyer@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    expect(prematureLogin.status).toBe(403);
    expect(prematureLogin.body.error.code).toBe('ACCOUNT_PENDING_ACTIVATION');

    // 3. Verify invitation metadata (returns role assigned by Admin)
    const verifyRes = await request(app).get(
      `/api/v1/auth/invite/verify?token=${encodeURIComponent(rawToken)}`,
    );
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.invitation.email).toBe(
      'ananya.iyer@optronix.com',
    );
    expect(verifyRes.body.data.invitation.role.code).toBe('SALES_MANAGER');

    // 4. Accept invitation, set strong password, activate account, and receive session cookies
    const invitedUserAgent = request.agent(app);
    const acceptRes = await invitedUserAgent
      .post('/api/v1/auth/invite/accept')
      .send({
        token: rawToken,
        password: 'AnanyaSecure@2026!',
        confirmPassword: 'AnanyaSecure@2026!',
        phone: '+91 98400 11223',
      });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.user.status).toBe('ACTIVE');
    expect(acceptRes.body.data.user.role.code).toBe('SALES_MANAGER');
    expect(acceptRes.body.data.redirectPath).toBe('/team-activity');

    // Authenticated session is immediately active via HttpOnly cookie
    const meRes = await invitedUserAgent.get('/api/v1/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe('ananya.iyer@optronix.com');

    // 5. Single-use token is invalidated — replay attempt fails
    const replayRes = await request(app)
      .post('/api/v1/auth/invite/accept')
      .send({
        token: rawToken,
        password: 'AnotherPassword@2026!',
        confirmPassword: 'AnotherPassword@2026!',
      });
    expect(replayRes.status).toBe(400);
    expect(replayRes.body.error.code).toBe('INVALID_INVITATION_TOKEN');
  });

  it('supports dynamic binary attachment upload/download, RBAC omnibox search, and live tenantSettings', async () => {
    const adityaAgent = request.agent(app);
    const rahulAgent = request.agent(app);
    const adminAgent = request.agent(app);

    await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await rahulAgent.post('/api/v1/auth/login').send({
      email: 'rohan.desai@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await adminAgent.post('/api/v1/auth/login').send({
      email: 'vikramaditya.roy@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    // 1. Dynamic Tenant Settings propagation
    const patchSettings = await adminAgent.patch('/api/v1/admin/settings').send({
      defaultCurrency: 'USD',
      smtpSenderEmail: 'ops@optronix.com',
    });
    expect(patchSettings.status).toBe(200);
    expect(patchSettings.body.data.settings.defaultCurrency).toBe('USD');

    const meRes = await adityaAgent.get('/api/v1/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.tenantSettings.defaultCurrency).toBe('USD');

    // 2. Unified RBAC-Scoped Omnibox Search
    const searchRes = await adityaAgent.get('/api/v1/search?q=Apex');
    expect(searchRes.status).toBe(200);
    expect(Array.isArray(searchRes.body.data.customers)).toBe(true);
    expect(Array.isArray(searchRes.body.data.meetings)).toBe(true);

    // 3. Multipart Binary File Upload + Download + Anti-IDOR Enforcement
    const adityaMeetings = await adityaAgent.get('/api/v1/meetings');
    const targetMeeting = adityaMeetings.body.data.meetings.find(
      (m: { status: string }) => m.status !== 'COMPLETED',
    );
    expect(targetMeeting).toBeDefined();

    const pdfBytes = Buffer.from('%PDF-1.4 OPTRONIX Commercial Proposal Test');
    const uploadRes = await adityaAgent
      .post('/api/v1/attachments/upload')
      .field('meetingId', targetMeeting.id)
      .field('category', 'PROPOSAL')
      .attach('file', pdfBytes, {
        filename: 'Optronix_Proposal_2026.pdf',
        contentType: 'application/pdf',
      });
    expect(uploadRes.status).toBe(201);
    const attachmentId = uploadRes.body.data.attachment.id;
    expect(uploadRes.body.data.attachment.hasBinary).toBe(true);

    const downloadRes = await adityaAgent
      .get(`/api/v1/attachments/${attachmentId}/download`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(downloadRes.status).toBe(200);
    expect(Buffer.from(downloadRes.body).toString('utf8')).toContain(
      'OPTRONIX Commercial Proposal Test',
    );

    // Anti-IDOR: Rahul cannot download Aditya's meeting attachment
    const forbiddenDownload = await rahulAgent.get(
      `/api/v1/attachments/${attachmentId}/download`,
    );
    expect(forbiddenDownload.status).toBe(403);

    // Clean up test disk attachment
    const delRes = await adityaAgent.delete(
      `/api/v1/attachments/${attachmentId}`,
    );
    expect(delRes.status).toBe(200);
  });

  it('tracks salesperson live GPS duty pings, computes breadcrumb distance, and enforces RBAC / Anti-IDOR on Manager Live Radar', async () => {
    const adityaAgent = request.agent(app);
    const rohanAgent = request.agent(app);
    const priyaMgrAgent = request.agent(app);

    const adityaLogin = await adityaAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    const adityaId = adityaLogin.body.data.user.id as string;

    await rohanAgent.post('/api/v1/auth/login').send({
      email: 'rohan.desai@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await priyaMgrAgent.post('/api/v1/auth/login').send({
      email: 'priya.mehta@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    // 1. Aditya enables Field Duty & streams 2 GPS pings along Cyber Hub -> Golf Course Rd
    const dutyRes = await adityaAgent.post('/api/v1/tracking/duty').send({
      active: true,
      coordinates: { latitude: 28.495, longitude: 77.089, accuracyMeters: 6 },
    });
    expect(dutyRes.status).toBe(200);
    expect(dutyRes.body.data.isFieldDutyActive).toBe(true);

    const pingRes = await adityaAgent.post('/api/v1/tracking/ping').send({
      latitude: 28.4595,
      longitude: 77.0992,
      accuracyMeters: 5,
      source: 'HEARTBEAT',
    });
    expect(pingRes.status).toBe(201);

    const meTrack = await adityaAgent.get('/api/v1/tracking/me');
    expect(meTrack.status).toBe(200);
    expect(meTrack.body.data.isFieldDutyActive).toBe(true);
    expect(meTrack.body.data.todayPingsCount).toBeGreaterThanOrEqual(2);
    expect(meTrack.body.data.todayDistanceKm).toBeGreaterThan(0);

    // 2. RBAC & Anti-IDOR: Sales Employee cannot access /live-team or another rep's trail
    const repRadarDenied = await adityaAgent.get('/api/v1/tracking/live-team');
    expect(repRadarDenied.status).toBe(403);

    const crossRepTrailDenied = await rohanAgent.get(
      `/api/v1/tracking/rep/${adityaId}/trail`,
    );
    expect(crossRepTrailDenied.status).toBe(403);

    // 3. Sales Manager views Live Field Radar & Aditya's GPS Breadcrumb Trail
    const mgrRadar = await priyaMgrAgent.get('/api/v1/tracking/live-team');
    expect(mgrRadar.status).toBe(200);
    const adityaPin = (
      mgrRadar.body.data.reps as Array<{
        repId: string;
        presenceStatus: string;
      }>
    ).find((r) => r.repId === adityaId);
    expect(adityaPin).toBeDefined();
    expect(['ON_SITE', 'LIVE_DUTY']).toContain(adityaPin?.presenceStatus);

    const mgrTrail = await priyaMgrAgent.get(
      `/api/v1/tracking/rep/${adityaId}/trail`,
    );
    expect(mgrTrail.status).toBe(200);
    expect(mgrTrail.body.data.trail.length).toBeGreaterThanOrEqual(2);
  });
});
