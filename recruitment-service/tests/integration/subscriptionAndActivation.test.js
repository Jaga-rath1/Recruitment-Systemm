import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const request = require('supertest');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const { getModels } = require('../../src/config/database');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const notificationAdapter = require('../../src/integrations/notification/notification.adapter');

let app;
let platformAdminToken;

const samplePdfBuffer = () => Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

describe('Subscription, Payment Verification & Organisation Activation', () => {
  beforeAll(async () => {
    await startTestDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetTestState();
    notificationAdapter.clearDispatchedNotifications();
    authAdapter.clearStandaloneUsers();
    platformAdminToken = authAdapter.signAccessToken({
      sub: uuidv4(),
      email: 'platform-admin@nexnuv.com',
      name: 'Platform Admin',
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN']
    });
  });

  it('executes full Basic plan onboarding: payment -> Super Admin approval -> enriched notification -> token expiry/reuse guards -> password setup -> login -> dashboard', async () => {
    // 1. Create Basic Monthly subscription request (₹999)
    const createRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Quantum Solar Systems',
        organisationDomain: 'quantumsolar.in',
        industry: 'CleanTech',
        companySize: '11-50',
        adminName: 'Aarav Patel',
        adminEmail: 'aarav@quantumsolar.in',
        planCode: 'RECRUITMENT_BASIC',
        billingCycle: 'MONTHLY'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe('PENDING_PAYMENT');
    expect(createRes.body.data.amountCents).toBe(99900);
    expect(createRes.body.data.currency).toBe('INR');
    expect(createRes.body.data.planCode).toBe('RECRUITMENT_BASIC');

    const subId = createRes.body.data.id;

    // 2. Submit payment proof
    const paymentRes = await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'UPI-BASIC-2026-9911')
      .field('paymentMethod', 'UPI')
      .field('submittedByEmail', 'aarav@quantumsolar.in')
      .attach('proof', samplePdfBuffer(), {
        filename: 'upi-receipt.pdf',
        contentType: 'application/pdf'
      });

    expect(paymentRes.status).toBe(201);
    expect(paymentRes.body.data.subscription.status).toBe('PENDING_VERIFICATION');

    // 3. Super Admin approves payment
    const approveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.subscription.status).toBe('APPROVED');
    expect(approveRes.body.data.subscription.organisationId).toBeTruthy();
    const activationToken = approveRes.body.data.invitationPreview.activationToken;
    expect(activationToken).toBeTruthy();

    // 4. Verify enriched ACCOUNT_INVITATION notification
    const invites = notificationAdapter.getDispatchedNotifications({ eventType: 'ACCOUNT_INVITATION' });
    expect(invites).toHaveLength(1);
    const invite = invites[0];
    expect(invite.recipientEmail).toBe('aarav@quantumsolar.in');
    expect(invite.payload.organisationName).toBe('Quantum Solar Systems');
    expect(invite.payload.planCode).toBe('RECRUITMENT_BASIC');
    expect(invite.payload.planName).toBe('Basic');
    expect(invite.payload.loginUrl).toBeTruthy();
    expect(invite.payload.activationLink).toContain(activationToken);
    expect(invite.payload.expiresInHours).toBe(48);
    expect(invite.title).toContain('Quantum Solar Systems');
    expect(invite.message).toContain('Basic');
    expect(invite.message).toContain(activationToken);
    // Zero plaintext passwords
    expect(invite).not.toHaveProperty('password');
    expect(invite.payload).not.toHaveProperty('password');
    expect(JSON.stringify(invite)).not.toContain('SecureSolarPassword!2026');

    // 5. Test expired activation link guard
    const { Subscription } = getModels();
    await Subscription.update(
      { activationExpiresAt: new Date(Date.now() - 60000) },
      { where: { id: subId } }
    );

    const expiredRes = await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({
        activationToken,
        password: 'ValidPassword123!'
      });
    expect(expiredRes.status).toBe(400);
    expect(expiredRes.body.error.message).toContain('expired');

    // Restore activation expiry to future
    await Subscription.update(
      { activationExpiresAt: new Date(Date.now() + 48 * 3600000) },
      { where: { id: subId } }
    );

    // 6. Test password validation (minimum 8 characters)
    const shortPassRes = await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({
        activationToken,
        password: 'short'
      });
    expect(shortPassRes.status).toBe(422);

    // 7. Successful activation & password creation
    const activateRes = await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({
        activationToken,
        password: 'SecureSolarPassword!2026'
      });

    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.subscription.status).toBe('ACTIVE');
    expect(activateRes.body.data.token).toBeTruthy();
    expect(activateRes.body.data.user.roles).toContain('ORGANISATION_ADMIN');
    expect(activateRes.body.data.user.userType).toBe('ORG_USER');
    expect(activateRes.body.data.user.email).toBe('aarav@quantumsolar.in');

    // 8. Prevent token reuse
    const reuseRes = await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({
        activationToken,
        password: 'AnotherPassword123!'
      });
    expect(reuseRes.status).toBe(404);
    expect(reuseRes.body.error.message).toContain('Invalid or already used');

    // 9. Verify Org Admin can authenticate via POST /api/v1/auth/login with newly set password
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'aarav@quantumsolar.in',
        password: 'SecureSolarPassword!2026'
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeTruthy();
    expect(loginRes.body.data.user.roles).toContain('ORGANISATION_ADMIN');
    expect(loginRes.body.data.user.organisationId).toBe(approveRes.body.data.subscription.organisationId);

    // Invalid password rejected
    const badLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'aarav@quantumsolar.in',
        password: 'WrongPassword999!'
      });
    expect(badLoginRes.status).toBe(401);

    // 10. Org Admin dashboard access: profile, plan, status, and expiry
    const dashRes = await request(app)
      .get('/api/v1/organisations/dashboard')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`);

    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.profile.name).toBe('Quantum Solar Systems');
    expect(dashRes.body.data.profile.subscription.planCode).toBe('RECRUITMENT_BASIC');
    expect(dashRes.body.data.profile.subscription.status).toBe('ACTIVE');
    expect(dashRes.body.data.profile.subscription.expiresAt).toBeTruthy();
  });

  it('executes Enterprise plan onboarding + full member management lifecycle & RBAC inside tenant', async () => {
    // 1. Create Enterprise Annual subscription request (₹49,999)
    const createRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Cyberdyne Advanced Dynamics',
        organisationDomain: 'cyberdyne.ai',
        industry: 'Defense & Robotics',
        companySize: '501-1000',
        adminName: 'Miles Dyson',
        adminEmail: 'miles@cyberdyne.ai',
        planCode: 'RECRUITMENT_ENTERPRISE',
        billingCycle: 'ANNUAL'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.amountCents).toBe(4999900);
    expect(createRes.body.data.planCode).toBe('RECRUITMENT_ENTERPRISE');

    const subId = createRes.body.data.id;

    // 2. Submit payment proof
    const paymentRes = await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'RTGS-CYBER-2026-001')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .field('submittedByEmail', 'miles@cyberdyne.ai')
      .attach('proof', samplePdfBuffer(), {
        filename: 'rtgs.pdf',
        contentType: 'application/pdf'
      });
    expect(paymentRes.status).toBe(201);

    // 3. Super Admin approves
    const approveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE' });

    expect(approveRes.status).toBe(200);
    const orgId = approveRes.body.data.subscription.organisationId;
    const activationToken = approveRes.body.data.invitationPreview.activationToken;

    // Verify Enterprise notification
    const invites = notificationAdapter.getDispatchedNotifications({ eventType: 'ACCOUNT_INVITATION' });
    const enterpriseInvite = invites.find((i) => i.recipientEmail === 'miles@cyberdyne.ai');
    expect(enterpriseInvite).toBeTruthy();
    expect(enterpriseInvite.payload.planName).toBe('Enterprise');
    expect(enterpriseInvite.payload.planCode).toBe('RECRUITMENT_ENTERPRISE');

    // 4. Admin activates account
    const activateRes = await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({
        activationToken,
        password: 'SkynetProtocols!2026'
      });

    expect(activateRes.status).toBe(200);
    const adminToken = activateRes.body.data.token;
    const adminEmployeeId = activateRes.body.data.user.employeeId;

    // 5. Admin lists initial employees (contains the Admin themselves)
    const listRes = await request(app)
      .get('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    const selfEmp = listRes.body.data.find((e) => e.email === 'miles@cyberdyne.ai');
    expect(selfEmp).toBeTruthy();
    expect(selfEmp.recruitmentAccess.roleCode).toBe('ORGANISATION_ADMIN');

    // 6. Admin invites new member: Recruiter
    const addMemberRes = await request(app)
      .post('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Sarah Connor',
        email: 'sarah@cyberdyne.ai',
        department: 'Talent Acquisition',
        designation: 'Senior Technical Recruiter',
        roleCode: 'RECRUITER',
        sendInvite: true
      });

    expect(addMemberRes.status).toBe(201);
    expect(addMemberRes.body.data.email).toBe('sarah@cyberdyne.ai');
    expect(addMemberRes.body.data.recruitmentAccess.roleCode).toBe('RECRUITER');
    expect(addMemberRes.body.data.recruitmentAccess.isActive).toBe(true);

    const newEmpId = addMemberRes.body.data.employeeId;

    // Verify EMPLOYEE_INVITATION notification dispatched
    const empInvites = notificationAdapter.getDispatchedNotifications({ eventType: 'EMPLOYEE_INVITATION' });
    const sarahInvite = empInvites.find((i) => i.recipientEmail === 'sarah@cyberdyne.ai');
    expect(sarahInvite).toBeTruthy();
    expect(sarahInvite.payload.roleCode).toBe('RECRUITER');

    // 7. Admin updates member role to SENIOR_INTERVIEWER
    const updateRoleRes = await request(app)
      .patch(`/api/v1/organisations/employees/${newEmpId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleCode: 'SENIOR_INTERVIEWER' });

    expect(updateRoleRes.status).toBe(200);
    expect(updateRoleRes.body.data.roleCode).toBe('SENIOR_INTERVIEWER');

    // 8. Admin updates granular custom permissions
    const updatePermsRes = await request(app)
      .patch(`/api/v1/organisations/employees/${newEmpId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customPermissions: ['offer:create', 'joining:manage'],
        revokedPermissions: []
      });

    expect(updatePermsRes.status).toBe(200);
    expect(updatePermsRes.body.data.customPermissions).toContain('offer:create');

    // 9. Admin views member activity log
    const activityRes = await request(app)
      .get(`/api/v1/organisations/employees/${newEmpId}/activity`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(activityRes.status).toBe(200);
    expect(activityRes.body.data.employee.employeeId).toBe(newEmpId);
    expect(activityRes.body.data.roleCode).toBe('SENIOR_INTERVIEWER');

    // 10. Admin deactivates member access
    const deactivateRes = await request(app)
      .patch(`/api/v1/organisations/employees/${newEmpId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.isActive).toBe(false);

    // 11. Admin reactivates member access
    const reactivateRes = await request(app)
      .patch(`/api/v1/organisations/employees/${newEmpId}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.isActive).toBe(true);

    // 12. Admin CANNOT deactivate their own access
    const selfDeactivateRes = await request(app)
      .patch(`/api/v1/organisations/employees/${adminEmployeeId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(selfDeactivateRes.status).toBe(400);
    expect(selfDeactivateRes.body.error.message).toContain('cannot deactivate your own active recruitment admin access');
  });

  it('enforces strict tenant isolation on member operations across separate organisations', async () => {
    // Org A (Cyberdyne) created and activated
    const subARes = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'Cyberdyne Systems',
      organisationDomain: 'cyberdyne-iso.com',
      industry: 'Defense',
      companySize: '500+',
      adminName: 'Miles Dyson',
      adminEmail: 'miles@cyberdyne-iso.com',
      planCode: 'RECRUITMENT_ENTERPRISE'
    });
    const subAId = subARes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subAId}/payments`)
      .field('paymentReference', 'REF-A-101')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), { filename: 'p1.pdf', contentType: 'application/pdf' });

    const approveARes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subAId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE' });

    expect(approveARes.status).toBe(200);
    const orgAId = approveARes.body.data.subscription.organisationId;
    const tokenA = approveARes.body.data.invitationPreview.activationToken;
    const activateARes = await request(app).post('/api/v1/subscriptions/activate').send({ activationToken: tokenA, password: 'PasswordA123!' });
    const adminTokenA = activateARes.body.data.token;

    // Add employee in Org A
    const empARes = await request(app)
      .post('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({
        fullName: 'John Connor',
        email: 'john@cyberdyne-iso.com',
        department: 'Operations',
        designation: 'Field Lead',
        roleCode: 'RECRUITER'
      });
    expect(empARes.status).toBe(201);
    const empAId = empARes.body.data.employeeId;

    // Org B (Weyland Yutani) created and activated
    const subBRes = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'Weyland Yutani',
      organisationDomain: 'weyland-yutani.com',
      industry: 'Offworld Mining',
      companySize: '1000+',
      adminName: 'Peter Weyland',
      adminEmail: 'peter@weyland-yutani.com',
      planCode: 'RECRUITMENT_ADVANCED'
    });
    const subBId = subBRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subBId}/payments`)
      .field('paymentReference', 'REF-B-202')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), { filename: 'p2.pdf', contentType: 'application/pdf' });

    const approveBRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subBId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE' });

    expect(approveBRes.status).toBe(200);
    const orgBId = approveBRes.body.data.subscription.organisationId;
    const tokenB = approveBRes.body.data.invitationPreview.activationToken;
    const activateBRes = await request(app).post('/api/v1/subscriptions/activate').send({ activationToken: tokenB, password: 'PasswordB123!' });
    const adminTokenB = activateBRes.body.data.token;

    // Org B Admin lists employees: must NOT see Org A employee
    const listBRes = await request(app)
      .get('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${adminTokenB}`);
    expect(listBRes.status).toBe(200);
    const emailsB = listBRes.body.data.map((e) => e.email);
    expect(emailsB).not.toContain('john@cyberdyne-iso.com');

    // Org B Admin attempts to read Org A employee activity -> 404
    const crossActivityRes = await request(app)
      .get(`/api/v1/organisations/employees/${empAId}/activity`)
      .set('Authorization', `Bearer ${adminTokenB}`);
    expect(crossActivityRes.status).toBe(404);

    // Org B Admin attempts to deactivate Org A employee -> 404
    const crossDeactRes = await request(app)
      .patch(`/api/v1/organisations/employees/${empAId}/deactivate`)
      .set('Authorization', `Bearer ${adminTokenB}`);
    expect(crossDeactRes.status).toBe(404);

    // Org B Admin attempts to spoof X-Organisation-Id header of Org A -> 403 CROSS_TENANT_DENIED
    const spoofHeaderRes = await request(app)
      .get('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .set('X-Organisation-Id', orgAId);
    expect(spoofHeaderRes.status).toBe(403);
    expect(spoofHeaderRes.body.error.code).toBe('CROSS_TENANT_DENIED');
  });

  it('guarantees Super Admin approval idempotency and blocks duplicate verification', async () => {
    const subRes = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'Tyrell Corporation',
      organisationDomain: 'tyrell.corp',
      industry: 'Bioengineering',
      companySize: '500+',
      adminName: 'Eldon Tyrell',
      adminEmail: 'eldon@tyrell.corp',
      planCode: 'RECRUITMENT_ADVANCED'
    });
    const subId = subRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'TYR-001')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), { filename: 'p.pdf', contentType: 'application/pdf' });

    // First approval succeeds
    const approve1 = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE' });
    expect(approve1.status).toBe(200);
    expect(approve1.body.data.subscription.status).toBe('APPROVED');

    // Repeated approval attempt rejects with 409 Conflict
    const approve2 = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE' });
    expect(approve2.status).toBe(409);
    expect(approve2.body.error.code).toBe('ALREADY_VERIFIED_OR_INVALID_STATE');
  });

  it('is resilient to notification service errors during Super Admin approval', async () => {
    const subRes = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'Omni Consumer Products',
      organisationDomain: 'ocp.detroit',
      industry: 'Security',
      companySize: '1000+',
      adminName: 'Dick Jones',
      adminEmail: 'dick.jones@ocp.detroit',
      planCode: 'RECRUITMENT_BASIC'
    });
    const subId = subRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'OCP-991')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), { filename: 'p.pdf', contentType: 'application/pdf' });

    // Temporarily mock dispatchNotification to reject with error
    const originalDispatch = notificationAdapter.dispatchNotification;
    notificationAdapter.dispatchNotification = async () => {
      throw new Error('Notification Service 503 Service Unavailable');
    };

    try {
      // Super Admin approval must succeed even if notification service fails!
      const approveRes = await request(app)
        .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ decision: 'APPROVE' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.subscription.status).toBe('APPROVED');
      expect(approveRes.body.data.invitationPreview.activationToken).toBeTruthy();
    } finally {
      notificationAdapter.dispatchNotification = originalDispatch;
    }
  });

  it('handles Platform Admin payment rejection and allows resubmission with new reference', async () => {
    const createRes = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'Beta BioLabs',
      organisationDomain: 'betabiolabs.com',
      industry: 'Biotech',
      companySize: '50-200',
      adminName: 'Marcus Chen',
      adminEmail: 'marcus@betabiolabs.com'
    });
    const subId = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'TXN-BAD-001')
      .field('paymentMethod', 'ACH')
      .attach('proof', samplePdfBuffer(), { filename: 'bad.pdf', contentType: 'application/pdf' });

    const rejectRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'REJECT', reason: 'Reference amount mismatch' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.subscription.status).toBe('REJECTED');
    expect(notificationAdapter.getDispatchedNotifications({ eventType: 'PAYMENT_REJECTED' })).toHaveLength(1);

    // Resubmit valid payment proof
    const resubmitRes = await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'TXN-VALID-002')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), { filename: 'valid.pdf', contentType: 'application/pdf' });

    expect(resubmitRes.status).toBe(201);
    expect(resubmitRes.body.data.subscription.status).toBe('PENDING_VERIFICATION');
  });

  it('handles concurrent payment verification requests: exactly one succeeds and the other receives 409 conflict', async () => {
    const createRes = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'Apex Fusion Labs',
      organisationDomain: 'apexfusion.io',
      industry: 'DeepTech',
      companySize: '201-500',
      adminName: 'Elena Rostova',
      adminEmail: 'elena@apexfusion.io',
      planCode: 'RECRUITMENT_ADVANCED',
      billingCycle: 'ANNUAL'
    });
    const subId = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'CONCURRENT-TXN-001')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), { filename: 'p.pdf', contentType: 'application/pdf' });

    // Fire 2 concurrent approval requests simultaneously
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ decision: 'APPROVE' }),
      request(app)
        .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ decision: 'APPROVE' })
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const successRes = res1.status === 200 ? res1 : res2;
    const conflictRes = res1.status === 409 ? res1 : res2;

    expect(successRes.body.data.subscription.status).toBe('APPROVED');
    expect(successRes.body.data.subscription.organisationId).toBeTruthy();
    expect(conflictRes.body.error.code).toMatch(/ALREADY_VERIFIED_OR_INVALID_STATE|VERIFICATION_IN_FLIGHT/);

    const { Subscription } = getModels();
    const finalSub = await Subscription.findByPk(subId);
    expect(finalSub.status).toBe('APPROVED');
    expect(finalSub.provisioningStatus).toBe('PROVISIONED');
  });

  it('supports secure activation invitation resend: refreshes 48h expiration, invalidates old token, enforces RBAC, and records audit', async () => {
    const createRes = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'Helios Dynamics',
      organisationDomain: 'heliosdynamics.org',
      industry: 'Aerospace',
      companySize: '50-200',
      adminName: 'Garrison Vance',
      adminEmail: 'garrison@heliosdynamics.org',
      planCode: 'RECRUITMENT_ENTERPRISE',
      billingCycle: 'ANNUAL'
    });
    const subId = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'HELIOS-WIRE-1001')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), { filename: 'wire.pdf', contentType: 'application/pdf' });

    // Approve
    const approveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE' });

    expect(approveRes.status).toBe(200);
    const initialToken = approveRes.body.data.invitationPreview.activationToken;
    expect(initialToken).toBeTruthy();

    // Fast-forward initial token into expired state (1 hour in the past)
    const { Subscription, RecruitmentAuditLog } = getModels();
    await Subscription.update(
      { activationExpiresAt: new Date(Date.now() - 3600000) },
      { where: { id: subId } }
    );

    // Attempting activation with expired initial token returns 400
    const expiredAttempt = await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({
        activationToken: initialToken,
        password: 'ValidP@ssword123!'
      });
    expect(expiredAttempt.status).toBe(400);
    expect(expiredAttempt.body.error.message).toContain('expired');

    // Resend without admin auth is blocked
    const unauthResend = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/resend-activation`);
    expect(unauthResend.status).toBe(401);

    // Super Admin resends activation invitation
    const resendRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/resend-activation`)
      .set('Authorization', `Bearer ${platformAdminToken}`);

    expect(resendRes.status).toBe(200);
    expect(resendRes.body.data.subscription.invitationResendCount).toBe(1);
    const replacementToken = resendRes.body.data.invitationPreview.activationToken;
    expect(replacementToken).toBeTruthy();
    expect(replacementToken).not.toBe(initialToken);

    // Verify old token is now completely rejected (404 invalid/already used)
    const oldTokenAttempt = await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({
        activationToken: initialToken,
        password: 'ValidP@ssword123!'
      });
    expect(oldTokenAttempt.status).toBe(404);

    // Verify audit log has ACTIVATION_INVITATION_RESENT
    const auditLogs = await RecruitmentAuditLog.findAll({
      where: { entityId: subId, action: 'ACTIVATION_INVITATION_RESENT' }
    });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].afterState.resendCount).toBe(1);

    // Activate successfully with replacement token
    const activateRes = await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({
        activationToken: replacementToken,
        password: 'StrongAdmin#2026!'
      });
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.subscription.status).toBe('ACTIVE');

    // After activation, resend is blocked with 409 ADMIN_ALREADY_ACTIVATED
    const postActivationResend = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/resend-activation`)
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(postActivationResend.status).toBe(409);
    expect(postActivationResend.body.error.code).toBe('ADMIN_ALREADY_ACTIVATED');
  });

  it('handles partial provisioning failure and allows safe recovery retry without duplicate organisations', async () => {
    const platformAdapter = require('../../src/integrations/platform/platform.adapter');

    const createRes = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'Resilient Robotics',
      organisationDomain: 'resilientrobotics.com',
      industry: 'Robotics',
      companySize: '11-50',
      adminName: 'Isaac Asimov',
      adminEmail: 'isaac@resilientrobotics.com',
      planCode: 'RECRUITMENT_ADVANCED'
    });
    const subId = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'ROBOT-WIRE-5001')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), { filename: 'proof.pdf', contentType: 'application/pdf' });

    // Mock platform provisioning failure
    const originalProvision = platformAdapter.provisionOrganisation;
    let attempts = 0;
    platformAdapter.provisionOrganisation = async (...args) => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Platform Service 503 Unavailable: Organization creation timeout');
      }
      return originalProvision(...args);
    };

    try {
      // First attempt fails during downstream provisioning
      const failRes = await request(app)
        .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ decision: 'APPROVE' });

      expect(failRes.status).toBe(500);

      // Verify subscription records FAILED provisioning state in DB
      const { Subscription } = getModels();
      const failedSub = await Subscription.findByPk(subId);
      expect(failedSub.status).toBe('APPROVED');
      expect(failedSub.provisioningStatus).toBe('FAILED');
      expect(failedSub.provisioningError).toContain('Organization creation timeout');

      // Super Admin retries verification
      const retryRes = await request(app)
        .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ decision: 'APPROVE' });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.subscription.status).toBe('APPROVED');
      expect(retryRes.body.data.subscription.provisioningStatus).toBe('PROVISIONED');
      expect(retryRes.body.data.subscription.provisioningError).toBeNull();
      expect(retryRes.body.data.invitationPreview.activationToken).toBeTruthy();

      // Verify tenant can now be activated
      const activateRes = await request(app)
        .post('/api/v1/subscriptions/activate')
        .send({
          activationToken: retryRes.body.data.invitationPreview.activationToken,
          password: 'RoboAdmin!2026'
        });
      expect(activateRes.status).toBe(200);
    } finally {
      platformAdapter.provisionOrganisation = originalProvision;
    }
  });

  it('strictly enforces strong password complexity on organisation admin activation', async () => {
    const createRes = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'CipherTech Security',
      organisationDomain: 'ciphertech.io',
      industry: 'Cybersecurity',
      companySize: '1-10',
      adminName: 'Ada Lovelace',
      adminEmail: 'ada@ciphertech.io'
    });
    const subId = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'CIPHER-001')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), { filename: 'c.pdf', contentType: 'application/pdf' });

    const approveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE' });

    const token = approveRes.body.data.invitationPreview.activationToken;

    // 1. Weak: under 8 chars -> 422
    const res1 = await request(app).post('/api/v1/subscriptions/activate').send({ activationToken: token, password: 'Pass1!' });
    expect(res1.status).toBe(422);

    // 2. Weak: no uppercase -> 422
    const res2 = await request(app).post('/api/v1/subscriptions/activate').send({ activationToken: token, password: 'password123!' });
    expect(res2.status).toBe(422);

    // 3. Weak: no lowercase -> 422
    const res3 = await request(app).post('/api/v1/subscriptions/activate').send({ activationToken: token, password: 'PASSWORD123!' });
    expect(res3.status).toBe(422);

    // 4. Weak: no number -> 422
    const res4 = await request(app).post('/api/v1/subscriptions/activate').send({ activationToken: token, password: 'Password!Special' });
    expect(res4.status).toBe(422);

    // 5. Weak: no special char -> 422
    const res5 = await request(app).post('/api/v1/subscriptions/activate').send({ activationToken: token, password: 'Password12345' });
    expect(res5.status).toBe(422);

    // 6. Strong: valid password -> 200
    const res6 = await request(app).post('/api/v1/subscriptions/activate').send({ activationToken: token, password: 'StrongP@ssword2026!' });
    expect(res6.status).toBe(200);
    expect(res6.body.data.subscription.status).toBe('ACTIVE');
  });

  it('accurately tracks notification delivery states and records provider delivery webhook confirmations', async () => {
    const dispatchResult = await notificationAdapter.dispatchNotification({
      eventType: 'ACCOUNT_INVITATION',
      organisationId: uuidv4(),
      recipientEmail: 'tracking-test@nexnuv.org',
      recipientName: 'Tracking Test',
      payload: {
        organisationName: 'Tracking Org',
        activationLink: 'https://example.com/activate'
      }
    });

    // In standalone / unconfirmed state: deliveryStatus is ACCEPTED, delivered is FALSE (not falsely claiming inbox delivery)
    expect(dispatchResult.deliveryStatus).toBe('ACCEPTED');
    expect(dispatchResult.delivered).toBe(false);

    // Provider sends cryptographically signed delivery webhook callback
    const notifId = dispatchResult.notificationId;
    const webhookPayload = {
      notificationId: notifId,
      event: 'delivered',
      timestamp: new Date().toISOString()
    };
    const rawBody = JSON.stringify(webhookPayload);
    const svixId = `msg_${uuidv4().replace(/-/g, '')}`;
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const rawSecret = process.env.RESEND_WEBHOOK_SECRET.startsWith('whsec_')
      ? process.env.RESEND_WEBHOOK_SECRET.slice(6)
      : process.env.RESEND_WEBHOOK_SECRET;
    const secretBytes = Buffer.from(rawSecret, 'base64');
    const signature = crypto
      .createHmac('sha256', secretBytes.length > 0 ? secretBytes : Buffer.from(process.env.RESEND_WEBHOOK_SECRET))
      .update(`${svixId}.${svixTimestamp}.${rawBody}`)
      .digest('base64');

    const webhookRes = await request(app)
      .post('/api/v1/subscriptions/notifications/delivery-webhook')
      .set('svix-id', svixId)
      .set('svix-timestamp', svixTimestamp)
      .set('svix-signature', `v1,${signature}`)
      .send(webhookPayload);

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.data.status).toBe('DELIVERED');

    // Verify delivery ledger records DELIVERED
    const deliveryState = notificationAdapter.getDeliveryStatus(notifId);
    expect(deliveryState).toBeTruthy();
    expect(deliveryState.status).toBe('DELIVERED');
  });

  it('REGRESSION: Public customer registration (paid and free trial) succeeds without provisioning_status database error', async () => {
    // 1. Paid registration
    const paidRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Nova Solar Technologies',
        organisationDomain: 'novasolartech.io',
        industry: 'CleanTech',
        companySize: '51-200',
        adminName: 'Kavita Rao',
        adminEmail: 'kavita@novasolartech.io',
        planCode: 'RECRUITMENT_ADVANCED',
        billingCycle: 'ANNUAL'
      });

    expect(paidRes.status).toBe(201);
    expect(paidRes.body.success).toBe(true);
    expect(paidRes.body.data.provisioningStatus).toBe('PENDING');
    expect(paidRes.body.data.status).toBe('PENDING_PAYMENT');
    expect(paidRes.body.data.id).toBeTruthy();

    // 2. Free trial registration
    const trialRes = await request(app)
      .post('/api/v1/subscriptions/trial')
      .send({
        organisationName: 'Orion Biotech Labs',
        organisationDomain: 'orionbiotech.io',
        industry: 'Healthcare',
        companySize: '11-50',
        adminName: 'Sanjay Dutt',
        adminEmail: 'sanjay@orionbiotech.io',
        password: 'Password123!'
      });

    expect(trialRes.status).toBe(201);
    expect(trialRes.body.success).toBe(true);
    expect(trialRes.body.data.subscription.status).toBe('TRIAL');
    expect(trialRes.body.data.subscription.provisioningStatus).toBe('PENDING');
    expect(trialRes.body.data.token).toBeTruthy();
    expect(trialRes.body.data.user.email).toBe('sanjay@orionbiotech.io');
    expect(trialRes.body.data.trial.daysRemaining).toBe(15);
  });
});
