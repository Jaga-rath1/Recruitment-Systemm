import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const authAdapter = require('../../src/integrations/auth/auth.adapter');

let app;

async function provisionActiveOrg(name = 'Nova Systems', adminEmail = 'admin@novasystems.io') {
  const platformToken = authAdapter.signAccessToken({
    sub: uuidv4(),
    email: 'pa@nexnuv.com',
    name: 'Platform Admin',
    userType: 'PLATFORM_ADMIN',
    roles: ['PLATFORM_ADMIN']
  });

  const subRes = await request(app).post('/api/v1/subscriptions').send({
    organisationName: name,
    organisationDomain: `${name.toLowerCase().replace(/\s+/g, '')}.io`,
    industry: 'SaaS',
    companySize: '100-500',
    adminName: 'Org Admin',
    adminEmail
  });
  const subId = subRes.body.data.id;

  await request(app)
    .post(`/api/v1/subscriptions/${subId}/payments`)
    .field('paymentReference', `REF-${subId.slice(0, 8)}`)
    .field('paymentMethod', 'WIRE_TRANSFER');

  const verifyRes = await request(app)
    .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
    .set('Authorization', `Bearer ${platformToken}`)
    .send({ decision: 'APPROVE' });

  const actRes = await request(app).post('/api/v1/subscriptions/activate').send({
    activationToken: verifyRes.body.data.invitationPreview.activationToken,
    password: 'EnterpriseAdmin#2026'
  });

  return {
    organisationId: actRes.body.data.user.organisationId,
    adminToken: actRes.body.data.token,
    adminEmployeeId: actRes.body.data.user.employeeId
  };
}

describe('Employee Management, Roles & Granular Backend RBAC', () => {
  beforeAll(async () => {
    await startTestDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetTestState();
  });

  it('supports adding employees with roles, role updates, granular permission overrides, deactivation, and activity logs', async () => {
    const org = await provisionActiveOrg();

    // Add a Recruiter
    const addRecruiterRes = await request(app)
      .post('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${org.adminToken}`)
      .send({
        fullName: 'Priya Sharma',
        email: 'priya@novasystems.io',
        department: 'Talent Acquisition',
        designation: 'Lead Recruiter',
        roleCode: 'RECRUITER'
      });

    expect(addRecruiterRes.status).toBe(201);
    const recruiterEmp = addRecruiterRes.body.data;
    expect(recruiterEmp.recruitmentAccess.roleCode).toBe('RECRUITER');

    const recruiterToken = authAdapter.signAccessToken({
      sub: recruiterEmp.authUserId,
      email: recruiterEmp.email,
      name: recruiterEmp.fullName,
      organisationId: org.organisationId,
      employeeId: recruiterEmp.employeeId,
      userType: 'ORG_USER',
      roles: ['RECRUITER']
    });

    // Recruiter can create manual jobs, but CANNOT manage roles
    const createJobRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        title: 'Staff Backend Engineer',
        description: 'Build highly scalable multi-tenant APIs with PostgreSQL and Node.js.',
        department: 'Engineering',
        skills: ['Node.js', 'PostgreSQL'],
        location: 'Remote',
        employmentType: 'FULL_TIME',
        headcount: 2
      });
    expect(createJobRes.status).toBe(201);

    const forbiddenRoleRes = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        code: 'HACK_ROLE',
        name: 'Hack Role',
        description: 'Should be blocked',
        permissionCodes: ['role:manage']
      });
    expect(forbiddenRoleRes.status).toBe(403);

    // Admin grants custom permission 'audit:view' to Recruiter
    const permUpdateRes = await request(app)
      .patch(`/api/v1/organisations/employees/${recruiterEmp.employeeId}/permissions`)
      .set('Authorization', `Bearer ${org.adminToken}`)
      .send({
        customPermissions: ['audit:view'],
        revokedPermissions: ['job:hrms:sync']
      });
    expect(permUpdateRes.status).toBe(200);
    expect(permUpdateRes.body.data.effectivePermissions).toContain('audit:view');
    expect(permUpdateRes.body.data.effectivePermissions).not.toContain('job:hrms:sync');

    // Verify revoked permission blocks HRMS sync immediately and granted permission allows audit logs
    const blockedSync = await request(app)
      .post('/api/v1/jobs/hrms/sync')
      .set('Authorization', `Bearer ${recruiterToken}`);
    expect(blockedSync.status).toBe(403);

    const allowedAudit = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${recruiterToken}`);
    expect(allowedAudit.status).toBe(200);

    // Admin reassigns Recruiter role later to TECHNICAL_INTERVIEWER
    const roleUpdateRes = await request(app)
      .patch(`/api/v1/organisations/employees/${recruiterEmp.employeeId}/role`)
      .set('Authorization', `Bearer ${org.adminToken}`)
      .send({ roleCode: 'TECHNICAL_INTERVIEWER' });
    expect(roleUpdateRes.status).toBe(200);
    expect(roleUpdateRes.body.data.roleCode).toBe('TECHNICAL_INTERVIEWER');

    // Admin deactivates recruitment access -> live backend immediately blocks token!
    const deactivateRes = await request(app)
      .patch(`/api/v1/organisations/employees/${recruiterEmp.employeeId}/deactivate`)
      .set('Authorization', `Bearer ${org.adminToken}`);
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.isActive).toBe(false);

    const blockedAfterDeactivate = await request(app)
      .get('/api/v1/interviews/assigned/technical')
      .set('Authorization', `Bearer ${recruiterToken}`);
    expect(blockedAfterDeactivate.status).toBe(403);

    // Admin views employee recruitment activity
    const activityRes = await request(app)
      .get(`/api/v1/organisations/employees/${recruiterEmp.employeeId}/activity`)
      .set('Authorization', `Bearer ${org.adminToken}`);
    expect(activityRes.status).toBe(200);
    expect(activityRes.body.data.counts.jobsCreated).toBe(1);

    // Admin reactivates recruitment access
    const reactivateRes = await request(app)
      .patch(`/api/v1/organisations/employees/${recruiterEmp.employeeId}/reactivate`)
      .set('Authorization', `Bearer ${org.adminToken}`);
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.isActive).toBe(true);

    // Admin permanently deletes recruitment employee
    const deleteRes = await request(app)
      .delete(`/api/v1/organisations/employees/${recruiterEmp.employeeId}`)
      .set('Authorization', `Bearer ${org.adminToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toBe('Employee deleted successfully');

    // Trying to delete self is rejected
    const selfDeleteRes = await request(app)
      .delete(`/api/v1/organisations/employees/${org.adminEmployeeId}`)
      .set('Authorization', `Bearer ${org.adminToken}`);
    expect(selfDeleteRes.status).toBe(400);
  });
});
