import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../src/shared/index.js';
import { createApp } from '../src/app.js';
import { asyncHandler } from '../src/common/asyncHandler.js';
import { sendSuccess } from '../src/common/response.js';
import { authenticate, getAuthActor } from '../src/middleware/auth.middleware.js';
import { errorHandler } from '../src/middleware/error.middleware.js';
import {
  assertCanAccessUserScopedRecord,
  requirePermissions,
} from '../src/middleware/rbac.middleware.js';
import { AuditLogModel } from '../src/models/AuditLog.model.js';
import {
  DEFAULT_SEED_PASSWORD,
  seedCoreUsersAndRbac,
} from '../src/seed/seedData.js';

const TEST_DB_URI =
  process.env.MONGODB_TEST_URI ??
  'mongodb://127.0.0.1:27017/optronix_phase03_auth_rbac_test';

describe('Backend Foundation, Authentication & RBAC / Anti-IDOR', () => {
  let seeded: Awaited<ReturnType<typeof seedCoreUsersAndRbac>>;
  const app = createApp();

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.db?.dropDatabase();
    seeded = await seedCoreUsersAndRbac();

    // Mount dedicated RBAC & Anti-IDOR verification probe routes before error handler
    // Note: createApp() already mounted notFoundHandler at end of stack, so we test RBAC
    // on a mounted sub-app wrapping createApp's auth middleware + RBAC guards cleanly:
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it('serves health check with security headers', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('operational');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects invalid credentials and NoSQL injection payloads on login', async () => {
    const badPass = await request(app).post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: 'WrongPassword123!',
    });
    expect(badPass.status).toBe(401);
    expect(badPass.body.success).toBe(false);

    const nosqlPayload = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: { $ne: '' },
        password: DEFAULT_SEED_PASSWORD,
      });
    expect(nosqlPayload.status).toBe(400);
    expect(nosqlPayload.body.success).toBe(false);
  });

  it('issues HttpOnly cookies on login, hydrates /auth/me, rotates /auth/refresh, and logs out', async () => {
    const agent = request.agent(app);

    const loginRes = await agent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
      rememberWorkstation: true,
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.user.email).toBe('aditya.sharma@optronix.com');
    expect(loginRes.body.data.user.role.code).toBe('SALES_EMPLOYEE');
    expect(loginRes.body.data.user.passwordHash).toBeUndefined();

    const setCookieHeaders = loginRes.headers['set-cookie'] as unknown as string[];
    expect(Array.isArray(setCookieHeaders)).toBe(true);
    expect(
      setCookieHeaders.some(
        (c) => c.startsWith('optronix_access_token=') && c.includes('HttpOnly'),
      ),
    ).toBe(true);
    expect(
      setCookieHeaders.some(
        (c) => c.startsWith('optronix_refresh_token=') && c.includes('HttpOnly'),
      ),
    ).toBe(true);

    // Hydrate /auth/me using HttpOnly cookie
    const meRes = await agent.get('/api/v1/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.employeeCode).toBe('OPT-4190');

    // Refresh session
    const refreshRes = await agent.post('/api/v1/auth/refresh');
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.user.email).toBe('aditya.sharma@optronix.com');

    // Logout clears session
    const logoutRes = await agent.post('/api/v1/auth/logout');
    expect(logoutRes.status).toBe(200);

    const meAfterLogout = await agent.get('/api/v1/auth/me');
    expect(meAfterLogout.status).toBe(401);

    // Verify immutable AuditLog entries were written
    const loginAudit = await AuditLogModel.findOne({
      actorId: seeded.aditya._id,
      action: 'AUTH_LOGIN',
    }).lean();
    expect(loginAudit).toBeTruthy();
    expect(loginAudit?.integrityHash).toHaveLength(64);
  });

  it('supports forgot-password + reset-password and revokes prior sessions via tokenVersion', async () => {
    const oldSessionAgent = request.agent(app);
    await oldSessionAgent.post('/api/v1/auth/login').send({
      email: 'rahul.singh@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    expect((await oldSessionAgent.get('/api/v1/auth/me')).status).toBe(200);

    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'rahul.singh@optronix.com' });
    expect(forgotRes.status).toBe(200);
    const resetToken = forgotRes.body.data.debugResetToken as string;
    expect(typeof resetToken).toBe('string');

    const newPassword = 'NewSecurePass@2026!';
    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: resetToken,
        newPassword,
        confirmPassword: newPassword,
        invalidateRemoteSessions: true,
      });
    expect(resetRes.status).toBe(200);

    // Old cookie session is immediately revoked because tokenVersion incremented
    const revokedCheck = await oldSessionAgent.get('/api/v1/auth/me');
    expect(revokedCheck.status).toBe(401);
    expect(revokedCheck.body.error.code).toBe('SESSION_REVOKED');

    // Login with new password succeeds
    const newAgent = request.agent(app);
    const relogin = await newAgent.post('/api/v1/auth/login').send({
      email: 'rahul.singh@optronix.com',
      password: newPassword,
    });
    expect(relogin.status).toBe(200);
  });

  it('enforces granular RBAC permissions and anti-IDOR object-level scoping across Rep, Manager, and Admin', async () => {
    // Build an isolated Express harness mounting auth + RBAC + object-level ownership probes
    const express = (await import('express')).default;
    const cookieParser = (await import('cookie-parser')).default;
    const { authRouter } = await import('../src/modules/auth/auth.routes.js');

    const probeApp = express();
    probeApp.use(cookieParser());
    probeApp.use(express.json());
    probeApp.use('/api/v1/auth', authRouter);

    probeApp.post(
      '/api/v1/probe/reopen',
      authenticate,
      requirePermissions(PERMISSIONS.MEETINGS_REOPEN),
      (_req, res) => sendSuccess(res, { allowed: true }),
    );

    probeApp.get(
      '/api/v1/probe/owner/:ownerId',
      authenticate,
      asyncHandler(async (req, res) => {
        const actor = getAuthActor(req);
        await assertCanAccessUserScopedRecord(actor, req.params.ownerId!);
        return sendSuccess(res, { accessedOwnerId: req.params.ownerId });
      }),
    );

    probeApp.use(errorHandler);

    const repAgent = request.agent(probeApp);
    const managerAgent = request.agent(probeApp);
    const adminAgent = request.agent(probeApp);

    await repAgent.post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await managerAgent.post('/api/v1/auth/login').send({
      email: 'priya.mehta@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    await adminAgent.post('/api/v1/auth/login').send({
      email: 'vikramaditya.roy@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });

    // Rule #1: Employee can access own record, CANNOT access another employee's record
    const repSelf = await repAgent.get(
      `/api/v1/probe/owner/${String(seeded.aditya._id)}`,
    );
    expect(repSelf.status).toBe(200);

    const repOther = await repAgent.get(
      `/api/v1/probe/owner/${String(seeded.amit._id)}`,
    );
    expect(repOther.status).toBe(403);
    expect(repOther.body.error.code).toBe('OWNERSHIP_VIOLATION');

    // Rule #2 / #6: Employee CANNOT invoke meetings:reopen
    const repReopen = await repAgent.post('/api/v1/probe/reopen');
    expect(repReopen.status).toBe(403);
    expect(repReopen.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');

    // Manager CAN invoke meetings:reopen and CAN access team member Aditya, CANNOT access West-region Rohan
    const mgrReopen = await managerAgent.post('/api/v1/probe/reopen');
    expect(mgrReopen.status).toBe(200);

    const mgrTeamMember = await managerAgent.get(
      `/api/v1/probe/owner/${String(seeded.aditya._id)}`,
    );
    expect(mgrTeamMember.status).toBe(200);

    const mgrOutsideTeam = await managerAgent.get(
      `/api/v1/probe/owner/${String(seeded.rohan._id)}`,
    );
    expect(mgrOutsideTeam.status).toBe(403);
    expect(mgrOutsideTeam.body.error.code).toBe('TEAM_SCOPE_VIOLATION');

    // Admin CAN access all teams and elevated permissions
    const adminCrossTeam = await adminAgent.get(
      `/api/v1/probe/owner/${String(seeded.rohan._id)}`,
    );
    expect(adminCrossTeam.status).toBe(200);
  });

  it('supports X-Client-Platform: mobile Bearer token login, /auth/me, token refresh, and logout without exposing tokens to web clients', async () => {
    const webLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'aditya.sharma@optronix.com',
      password: DEFAULT_SEED_PASSWORD,
    });
    expect(webLogin.status).toBe(200);
    expect(webLogin.body.data.tokens).toBeUndefined();

    const mobileLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Client-Platform', 'mobile')
      .send({
        email: 'aditya.sharma@optronix.com',
        password: DEFAULT_SEED_PASSWORD,
      });
    expect(mobileLogin.status).toBe(200);
    expect(mobileLogin.body.data.tokens.accessToken).toBeTruthy();
    expect(mobileLogin.body.data.tokens.refreshToken).toBeTruthy();

    const { accessToken, refreshToken } = mobileLogin.body.data.tokens as {
      accessToken: string;
      refreshToken: string;
    };

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe('aditya.sharma@optronix.com');

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Client-Platform', 'mobile')
      .send({ refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.tokens.accessToken).toBeTruthy();

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(logoutRes.status).toBe(200);
  });
});
