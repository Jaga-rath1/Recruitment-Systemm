import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { sha256, signHmacPayload, verifyHmacToken } = require('../../src/utils/crypto');
const { parsePagination, buildPaginationMeta } = require('../../src/utils/pagination');
const { computeStageTracker } = require('../../src/modules/tracking/tracking.service');
const {
  mapSharedRoleToRecruitmentContext,
  isTrustedGatewayRequest,
  extractGatewayContext
} = require('../../src/integrations/gateway/gateway.config');
const { normalizeDownstreamError, buildUrl } = require('../../src/integrations/common/httpClient');
const { normalizeEmployeeDto } = require('../../src/integrations/employee/employee.adapter');
const { normalizeOrganizationDto } = require('../../src/integrations/organisation/organisation.adapter');
const storageAdapter = require('../../src/integrations/storage/storage.adapter');
const notificationAdapter = require('../../src/integrations/notification/notification.adapter');
const hrmsAdapter = require('../../src/integrations/hrms/hrms.adapter');
const env = require('../../src/config/env');

describe('Core Utilities, Gateway Context & Shared Adapter Normalization', () => {
  beforeEach(() => {
    process.env.EMAIL_PROVIDER = 'DISABLED';
    notificationAdapter.clearDispatchedNotifications();
    hrmsAdapter.clearStandaloneHrmsJobs();
  });

  it('computes SHA-256 and verifies HMAC signed download tokens safely', () => {
    const digest = sha256('nexnuv');
    expect(digest).toHaveLength(64);

    const token = signHmacPayload({ storageKey: 'org1/resumes/cv.pdf' }, 'secret-key', 60);
    const verified = verifyHmacToken(token, 'secret-key');
    expect(verified.storageKey).toBe('org1/resumes/cv.pdf');
    expect(verifyHmacToken(token, 'wrong-secret')).toBeNull();
    expect(verifyHmacToken('tampered.' + token.split('.')[1], 'secret-key')).toBeNull();
  });

  it('blocks path traversal in storage adapter', async () => {
    await expect(storageAdapter.readFileBuffer('../../etc/passwd')).rejects.toThrow(/Invalid storage path/);
  });

  it('parses pagination and produces cursor metadata accurately', () => {
    const parsed = parsePagination({ page: '2', limit: '10' });
    expect(parsed).toEqual({ page: 2, limit: 10, cursor: null, skip: 10 });

    const { items, meta } = buildPaginationMeta({
      items: [{ id: '1' }, { id: '2' }, { id: '3' }],
      limit: 2,
      total: 5,
      page: 1
    });
    expect(items).toHaveLength(2);
    expect(meta.hasMore).toBe(true);
    expect(meta.nextCursor).toBe('2');
    expect(meta.totalPages).toBe(3);
  });

  it('computes 8-stage Candidate Portal progress tracker accurately', () => {
    const tracker = computeStageTracker('TECHNICAL_INTERVIEW', []);
    expect(tracker).toHaveLength(8);
    expect(tracker[0]).toMatchObject({ key: 'APPLIED', status: 'COMPLETED' });
    expect(tracker[1]).toMatchObject({ key: 'SCREENING', status: 'COMPLETED' });
    expect(tracker[2]).toMatchObject({ key: 'TECHNICAL_INTERVIEW', status: 'CURRENT' });
    expect(tracker[3]).toMatchObject({ key: 'MANAGERIAL_INTERVIEW', status: 'UPCOMING' });
  });

  it('dispatches valid notification events and rejects unknown event keys', async () => {
    const res = await notificationAdapter.dispatchNotification({
      eventType: 'APPLICATION_RECEIVED',
      recipientEmail: 'candidate@example.com',
      recipientName: 'Jane Doe',
      payload: { applicationReference: 'NXV-100' }
    });
    expect(res.requestAccepted).toBe(true);
    expect(res.deliveryStatus).toBe('ACCEPTED');
    expect(notificationAdapter.getDispatchedNotifications({ eventType: 'APPLICATION_RECEIVED' })).toHaveLength(1);

    await expect(
      notificationAdapter.dispatchNotification({
        eventType: 'INVALID_EVENT',
        recipientEmail: 'a@b.com'
      })
    ).rejects.toThrow(/Unsupported notification event/);
  });

  it('returns clearly structured HRMS jobs from standalone adapter', async () => {
    const jobs = await hrmsAdapter.fetchJobs('00000000-0000-4000-8000-000000000001');
    expect(jobs.length).toBeGreaterThanOrEqual(3);
    expect(jobs[0]).toHaveProperty('hrmsJobId');
    expect(jobs[0]).toHaveProperty('totalHeadcount');
  });

  it('enforces trusted x-internal-token and rejects spoofed gateway identity headers', () => {
    const spoofedReq = {
      headers: {
        'x-internal-token': 'wrong-token',
        'x-user-id': 'user-1',
        'x-user-role': 'super_admin',
        'x-organization-id': '11111111-1111-4111-8111-111111111111'
      }
    };
    expect(isTrustedGatewayRequest(spoofedReq)).toBe(false);
    expect(extractGatewayContext(spoofedReq)).toBeNull();

    const validReq = {
      headers: {
        'x-internal-token': env.services.internalToken,
        'x-user-id': 'user-1',
        'x-user-role': 'org_admin',
        'x-user-email': 'admin@acme.io',
        'x-organization-id': '11111111-1111-4111-8111-111111111111'
      }
    };
    expect(isTrustedGatewayRequest(validReq)).toBe(true);
    expect(extractGatewayContext(validReq)).toMatchObject({
      userId: 'user-1',
      organisationId: '11111111-1111-4111-8111-111111111111',
      userType: 'ORG_USER',
      roles: ['ORGANISATION_ADMIN'],
      viaGateway: true
    });

    expect(mapSharedRoleToRecruitmentContext('super_admin')).toMatchObject({
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN']
    });
  });

  it('normalizes shared Employee and Organization DTOs and HTTP downstream errors accurately', () => {
    const org = normalizeOrganizationDto({
      id: 'org-uuid-1',
      name: 'Acme Robotics',
      code: 'ACME',
      status: 'active'
    });
    expect(org).toMatchObject({
      organisationId: 'org-uuid-1',
      name: 'Acme Robotics',
      code: 'ACME',
      status: 'active'
    });

    const emp = normalizeEmployeeDto({
      id: 'emp-uuid-1',
      organizationId: 'org-uuid-1',
      employeeCode: 'EMP001',
      firstName: 'Jordan',
      lastName: 'Lee',
      workEmail: 'jordan@acme.io',
      status: 'terminated'
    });
    expect(emp).toMatchObject({
      employeeId: 'emp-uuid-1',
      organisationId: 'org-uuid-1',
      fullName: 'Jordan Lee',
      email: 'jordan@acme.io',
      isActive: false
    });

    expect(normalizeDownstreamError('Platform Service', 403, { code: 'SUBSCRIPTION_INACTIVE', message: 'Expired' }).statusCode).toBe(403);
    expect(normalizeDownstreamError('Auth Service', 401, { message: 'Invalid token' }).statusCode).toBe(401);
    expect(normalizeDownstreamError('Notification Service', 503, { message: 'Down' }).statusCode).toBe(503);
    expect(buildUrl('http://localhost:4004/', '/api/v1/employees', { search: 'jordan', page: 1 })).toBe(
      'http://localhost:4004/api/v1/employees?search=jordan&page=1'
    );
  });

  it('enforces Salary Approval Gate authorization and detects salary budget status', () => {
    const { hasSalaryApprovalAuthority, parseSalaryApproval } = require('../../src/modules/offer/offer.service');

    expect(hasSalaryApprovalAuthority({ actorRole: 'ORGANISATION_ADMIN' })).toBe(true);
    expect(hasSalaryApprovalAuthority({ actorRole: 'super_admin' })).toBe(true);
    expect(hasSalaryApprovalAuthority({ actorRole: 'RECRUITER', permissions: ['offer:salary_approve'] })).toBe(true);
    expect(hasSalaryApprovalAuthority({ actorRole: 'RECRUITER', permissions: ['offer:view', 'offer:manage'] })).toBe(false);
    expect(hasSalaryApprovalAuthority({ actorRole: 'TECHNICAL_INTERVIEWER' })).toBe(false);

    // Unapproved or empty summary
    expect(parseSalaryApproval('')).toEqual({ approved: false, status: 'NONE' });
    expect(parseSalaryApproval('Standard terms and conditions.')).toEqual({ approved: false, status: 'NONE' });

    // Pending approval
    const pendingTerms = '<!--SALARY_APPROVAL:{"status":"PENDING_APPROVAL","offeredSalary":150000}-->\nStandard terms';
    expect(parseSalaryApproval(pendingTerms)).toMatchObject({
      approved: false,
      status: 'PENDING_APPROVAL',
      offeredSalary: 150000
    });

    // Approved
    const approvedTerms = '<!--SALARY_APPROVAL:{"status":"APPROVED","approvedSalary":150000,"approvedBy":"admin-1"}-->\nStandard terms';
    expect(parseSalaryApproval(approvedTerms)).toMatchObject({
      approved: true,
      status: 'APPROVED',
      approvedSalary: 150000,
      approvedBy: 'admin-1'
    });
  });

  it('provisions employee record upon candidate joining and verifies idempotency in Employee Adapter', async () => {
    const employeeAdapter = require('../../src/integrations/employee/employee.adapter');
    const orgId = '00000000-0000-4000-8000-000000000099';

    // 1. Create employee via adapter
    const emp1 = await employeeAdapter.createEmployee(orgId, {
      fullName: 'Aiden Vance',
      email: 'aiden.vance@example.org',
      phone: '+1-555-0199',
      status: 'ACTIVE',
      department: 'Platform Engineering',
      designation: 'Senior Backend Engineer',
      joiningDate: '2026-12-01'
    });

    expect(emp1).toBeDefined();
    expect(emp1.email).toBe('aiden.vance@example.org');
    expect(emp1.fullName).toBe('Aiden Vance');
    expect(emp1.isActive).toBe(true);

    // 2. Idempotent call with same email returns the same employee without throwing
    const emp2 = await employeeAdapter.createEmployee(orgId, {
      fullName: 'Aiden Vance',
      email: 'aiden.vance@example.org',
      status: 'ACTIVE'
    });

    expect(emp2.id || emp2.employeeId).toBe(emp1.id || emp1.employeeId);
    expect(emp2.email).toBe('aiden.vance@example.org');
  });

  it('validates retryEmployeeSync handles recovery, deduplication, and non-JOINED states', async () => {
    const { retryEmployeeSync } = require('../../src/modules/joining/joining.service');
    const joiningRepo = require('../../src/modules/joining/joining.repository');
    const auditService = require('../../src/modules/audit/audit.service');

    const testOrg = '00000000-0000-4000-8000-000000000077';
    const testJoiningId = '22222222-3333-4444-5555-666666666666';

    const mockRecord = {
      id: testJoiningId,
      organisationId: testOrg,
      status: 'JOINED',
      actualJoiningDate: new Date('2026-12-01'),
      application: {
        candidate: { fullName: 'Sync Retry User', email: 'sync.retry@example.org' },
        job: { title: 'Cloud Architect', department: 'DevOps' }
      },
      offer: { designation: 'Cloud Architect', department: 'DevOps' }
    };

    const origFind = joiningRepo.findJoiningById;
    const origAudit = auditService.recordAudit;
    joiningRepo.findJoiningById = async (orgId, id) => {
      if (orgId === testOrg && id === testJoiningId) return mockRecord;
      return null;
    };
    auditService.recordAudit = async () => {};

    try {
      // 1. Initial sync on JOINED candidate
      const res1 = await retryEmployeeSync(testOrg, testJoiningId, {
        actorUserId: 'admin-1',
        actorRole: 'ORGANISATION_ADMIN'
      });
      expect(res1.success).toBe(true);
      expect(res1.status).toBe('SYNCED');
      expect(res1.data.email).toBe('sync.retry@example.org');

      // 2. Second retry reports ALREADY_SYNCED
      const res2 = await retryEmployeeSync(testOrg, testJoiningId, {
        actorUserId: 'admin-1',
        actorRole: 'ORGANISATION_ADMIN'
      });
      expect(res2.success).toBe(true);
      expect(res2.status).toBe('ALREADY_SYNCED');
      expect(res2.data.employeeId).toBe(res1.data.employeeId);

      // 3. Candidate in INITIATED status rejects with 409
      mockRecord.status = 'INITIATED';
      await expect(
        retryEmployeeSync(testOrg, testJoiningId, { actorUserId: 'admin-1', actorRole: 'ORGANISATION_ADMIN' })
      ).rejects.toThrow(/Employee synchronization can only be performed for confirmed JOINED candidates/);

      // 4. Cross-tenant access rejects with 404
      await expect(
        retryEmployeeSync('00000000-0000-4000-8000-000000000099', testJoiningId, { actorUserId: 'admin-1' })
      ).rejects.toThrow(/Joining record not found/);
    } finally {
      joiningRepo.findJoiningById = origFind;
      auditService.recordAudit = origAudit;
    }
  });
});
