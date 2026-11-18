import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { registerAndVerifyCandidate } = require('../helpers/candidateAuthHelper');
const { createApp } = require('../../src/app');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const notificationAdapter = require('../../src/integrations/notification/notification.adapter');

let app;

async function setupOrgWithTeam(orgName, emailPrefix) {
  const platformToken = authAdapter.signAccessToken({
    sub: uuidv4(),
    email: 'pa@nexnuv.com',
    name: 'Platform Admin',
    userType: 'PLATFORM_ADMIN',
    roles: ['PLATFORM_ADMIN']
  });

  const subRes = await request(app).post('/api/v1/subscriptions').send({
    organisationName: orgName,
    organisationDomain: `${emailPrefix}.io`,
    industry: 'Cloud SaaS',
    companySize: '500+',
    adminName: `${orgName} Admin`,
    adminEmail: `admin@${emailPrefix}.io`
  });
  const subId = subRes.body.data.id;

  await request(app)
    .post(`/api/v1/subscriptions/${subId}/payments`)
    .field('paymentReference', `PAY-${subId.slice(0, 8)}`)
    .field('paymentMethod', 'ACH');

  const verifyRes = await request(app)
    .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
    .set('Authorization', `Bearer ${platformToken}`)
    .send({ decision: 'APPROVE' });

  const actRes = await request(app).post('/api/v1/subscriptions/activate').send({
    activationToken: verifyRes.body.data.invitationPreview.activationToken,
    password: 'Password!2026'
  });

  const organisationId = actRes.body.data.user.organisationId;
  const adminToken = actRes.body.data.token;

  const createStaff = async (fullName, email, roleCode) => {
    const res = await request(app)
      .post('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName, email, roleCode, department: 'Engineering', designation: roleCode });
    const emp = res.body.data;
    const token = authAdapter.signAccessToken({
      sub: emp.authUserId,
      email: emp.email,
      name: emp.fullName,
      organisationId,
      employeeId: emp.employeeId,
      userType: 'ORG_USER',
      roles: [roleCode]
    });
    return { ...emp, token };
  };

  const recruiter = await createStaff('Alex Recruiter', `recruiter@${emailPrefix}.io`, 'RECRUITER');
  const techInterviewer = await createStaff('Devon Tech', `tech@${emailPrefix}.io`, 'TECHNICAL_INTERVIEWER');
  const otherTech = await createStaff('Sam OtherTech', `othertech@${emailPrefix}.io`, 'TECHNICAL_INTERVIEWER');
  const seniorInterviewer = await createStaff('Morgan Senior', `senior@${emailPrefix}.io`, 'SENIOR_INTERVIEWER');

  return { organisationId, adminToken, recruiter, techInterviewer, otherTech, seniorInterviewer };
}

describe('Complete End-to-End Recruitment Lifecycle & Cross-Tenant Security', () => {
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

  it('runs HRMS sync, manual job publish, candidate application, 7-stage pipeline, confidential portal isolation, and cross-tenant blocking', async () => {
    const tenantA = await setupOrgWithTeam('Apex Cloud', 'apexcloud');
    const tenantB = await setupOrgWithTeam('Zephyr Retail', 'zephyr');

    // 1. Sync HRMS jobs for Tenant A
    const syncRes = await request(app)
      .post('/api/v1/jobs/hrms/sync')
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`);
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.data.length).toBeGreaterThanOrEqual(3);
    const hrmsJob = syncRes.body.data[0];
    expect(hrmsJob.sourceType).toBe('HRMS');
    expect(hrmsJob.hrmsJobId).toBe('HRMS-REQ-2026-101');
    expect(hrmsJob.jobSource.rawPayload.title).toBe(hrmsJob.title);

    // Configure recruitment-specific fields on HRMS job while preserving HRMS source payload
    const configRes = await request(app)
      .patch(`/api/v1/jobs/${hrmsJob.id}`)
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .send({
        recruitmentConfig: { priority: 'HIGH', remotePolicy: 'Hybrid 3 days' }
      });
    expect(configRes.status).toBe(200);
    expect(configRes.body.data.recruitmentConfig.priority).toBe('HIGH');

    // Publish HRMS job + Create & publish Manual job
    const pubHrms = await request(app)
      .post(`/api/v1/jobs/${hrmsJob.id}/publish`)
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`);
    expect(pubHrms.status).toBe(200);
    expect(pubHrms.body.data.status).toBe('PUBLISHED');

    const manualJobRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .send({
        title: 'Principal Security Architect',
        description: 'Lead multi-tenant SaaS security architecture, RBAC governance, and compliance.',
        department: 'Security',
        skills: ['AppSec', 'PostgreSQL', 'OAuth2'],
        experienceMinYears: 8,
        experienceMaxYears: 12,
        salaryMin: 170000,
        salaryMax: 210000,
        location: 'Remote',
        employmentType: 'FULL_TIME',
        headcount: 1,
        publishImmediately: true
      });
    expect(manualJobRes.status).toBe(201);
    const manualJobId = manualJobRes.body.data.id;

    // 2. Public Careers lists published jobs
    const careersRes = await request(app).get('/api/v1/jobs/public/careers');
    expect(careersRes.status).toBe(200);
    expect(careersRes.body.data.length).toBe(2);

    // Unpublish & close test on HRMS job
    const unpubRes = await request(app)
      .post(`/api/v1/jobs/${hrmsJob.id}/unpublish`)
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`);
    expect(unpubRes.body.data.status).toBe('UNPUBLISHED');

    // 3. Candidate registers account, verifies email, signs in, and applies to published manual job
    const { token: candidateToken } = await registerAndVerifyCandidate(request, app, {
      fullName: 'Jordan Blake',
      email: 'jordan.blake@candidate.dev',
      password: 'CandidatePass#2026'
    });

    const applyRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${manualJobId}/apply`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .field('fullName', 'Jordan Blake')
      .field('email', 'jordan.blake@candidate.dev')
      .field('mobileNumber', '+1-555-0192')
      .field('location', 'Austin, TX')
      .field('totalExperienceYears', '9')
      .field('currentCompany', 'ShieldNet')
      .field('currentSalary', '160000 USD')
      .field('expectedSalary', '190000 USD')
      .field('noticePeriodDays', '30')
      .field('skills', 'AppSec,PostgreSQL,Zero Trust')
      .field('coverLetter', 'Excited to architect NEXNUV security.')
      .attach('resume', Buffer.from('%PDF-1.4 Jordan Blake Resume'), {
        filename: 'jordan_blake_resume.pdf',
        contentType: 'application/pdf'
      });

    expect(applyRes.status).toBe(201);
    expect(applyRes.body.data.applicationReference).toMatch(/^NXV-/);
    const applicationId = applyRes.body.data.applicationId;

    // Duplicate application prevention check
    const dupApplyRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${manualJobId}/apply`)
      .field('fullName', 'Jordan Blake')
      .field('email', 'jordan.blake@candidate.dev')
      .field('mobileNumber', '+1-555-0192')
      .field('location', 'Austin, TX')
      .field('totalExperienceYears', '9')
      .attach('resume', Buffer.from('%PDF-1.4 dup'), {
        filename: 'dup.pdf',
        contentType: 'application/pdf'
      });
    expect(dupApplyRes.status).toBe(409);

    // Cross-tenant security check: Tenant B cannot view Tenant A's application or job!
    const crossTenantApp = await request(app)
      .get(`/api/v1/applications/${applicationId}`)
      .set('Authorization', `Bearer ${tenantB.recruiter.token}`);
    expect(crossTenantApp.status).toBe(404);

    const crossTenantHeader = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${tenantB.recruiter.token}`)
      .set('x-organisation-id', tenantA.organisationId);
    expect(crossTenantHeader.status).toBe(403);

    // Verify signed resume download works
    const appDetail = await request(app)
      .get(`/api/v1/applications/${applicationId}`)
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`);
    expect(appDetail.status).toBe(200);
    const resumeUrl = appDetail.body.data.documents[0].downloadUrl;
    const downloadRes = await request(app)
      .get(resumeUrl)
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`);
    expect(downloadRes.status).toBe(200);
    const downloadedContent = downloadRes.text || Buffer.from(downloadRes.body).toString('utf8');
    expect(downloadedContent).toContain('Jordan Blake Resume');

    // 4. STAGE 2: Screening -> Shortlist & assign Technical Interviewer
    const screenRes = await request(app)
      .post(`/api/v1/applications/${applicationId}/screen`)
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .send({
        decision: 'SHORTLIST',
        notes: 'Strong enterprise AppSec background (internal confidential note).',
        technicalInterviewerEmployeeId: tenantA.techInterviewer.employeeId,
        scheduledAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        meetingMode: 'VIDEO',
        meetingLinkOrLocation: 'https://meet.nexnuv.io/tech-101'
      });
    expect(screenRes.status).toBe(200);
    expect(screenRes.body.data.currentStage).toBe('TECHNICAL_INTERVIEW');

    // Verify cannot schedule Managerial Interview BEFORE Technical Interview is SELECTED
    const prematureManagerial = await request(app)
      .post('/api/v1/interviews')
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .send({
        applicationId,
        roundType: 'MANAGERIAL',
        scheduledAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        meetingMode: 'VIDEO',
        meetingLinkOrLocation: 'https://meet.nexnuv.io/mgr-101',
        interviewerEmployeeId: tenantA.seniorInterviewer.employeeId
      });
    expect(prematureManagerial.status).toBe(400);

    // 5. STAGE 3: Technical Interviewer views assigned interviews ONLY
    const assignedTechRes = await request(app)
      .get('/api/v1/interviews/assigned/technical')
      .set('Authorization', `Bearer ${tenantA.techInterviewer.token}`);
    expect(assignedTechRes.status).toBe(200);
    expect(assignedTechRes.body.data).toHaveLength(1);
    const techInterviewId = assignedTechRes.body.data[0].id;

    // Unassigned otherTech sees 0 interviews and CANNOT submit feedback
    const unassignedTechRes = await request(app)
      .get('/api/v1/interviews/assigned/technical')
      .set('Authorization', `Bearer ${tenantA.otherTech.token}`);
    expect(unassignedTechRes.body.data).toHaveLength(0);

    const unauthorizedFeedback = await request(app)
      .post(`/api/v1/interviews/${techInterviewId}/feedback`)
      .set('Authorization', `Bearer ${tenantA.otherTech.token}`)
      .send({
        overallRating: 9,
        technicalSkillsRating: 9,
        strengths: 'Great',
        weaknesses: 'None',
        detailedFeedback: 'Unauthorized attempt',
        recommendation: 'SELECTED'
      });
    expect(unauthorizedFeedback.status).toBe(403);

    // Assigned Technical Interviewer submits structured feedback
    const techFeedbackRes = await request(app)
      .post(`/api/v1/interviews/${techInterviewId}/feedback`)
      .set('Authorization', `Bearer ${tenantA.techInterviewer.token}`)
      .send({
        overallRating: 9,
        technicalSkillsRating: 9,
        strengths: 'Deep Postgres RLS & threat modeling knowledge.',
        weaknesses: 'Minor gap on Kubernetes network policies.',
        detailedFeedback: 'CONFIDENTIAL_TECH_EVALUATION: Top 5% security engineering candidate.',
        recommendation: 'SELECTED'
      });
    expect(techFeedbackRes.status).toBe(201);

    // 6. STAGE 4: Managerial Interview scheduled & Senior Interviewer submits feedback
    const scheduleMgrRes = await request(app)
      .post('/api/v1/interviews')
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .send({
        applicationId,
        roundType: 'MANAGERIAL',
        scheduledAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        meetingMode: 'VIDEO',
        meetingLinkOrLocation: 'https://meet.nexnuv.io/mgr-101',
        interviewerEmployeeId: tenantA.seniorInterviewer.employeeId
      });
    expect(scheduleMgrRes.status).toBe(201);
    const mgrInterviewId = scheduleMgrRes.body.data.id;

    // Reschedule test
    const reschedRes = await request(app)
      .patch(`/api/v1/interviews/${mgrInterviewId}/reschedule`)
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .send({
        scheduledAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        reason: 'Executive calendar shift'
      });
    expect(reschedRes.status).toBe(200);
    expect(reschedRes.body.data.status).toBe('RESCHEDULED');

    const mgrFeedbackRes = await request(app)
      .post(`/api/v1/interviews/${mgrInterviewId}/feedback`)
      .set('Authorization', `Bearer ${tenantA.seniorInterviewer.token}`)
      .send({
        overallRating: 9,
        communicationRating: 9,
        behaviouralRating: 9,
        problemSolvingRating: 10,
        leadershipRating: 9,
        strengths: 'Clear executive communication and pragmatic architectural leadership.',
        weaknesses: 'Could delegate incident triage faster.',
        detailedFeedback: 'CONFIDENTIAL_MGR_EVALUATION: Strong hire for Principal role.',
        recommendation: 'SELECTED'
      });
    expect(mgrFeedbackRes.status).toBe(201);

    // 7. STAGE 5: Final Selection
    const finalRes = await request(app)
      .post(`/api/v1/applications/${applicationId}/final-decision`)
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .send({
        decision: 'SELECTED',
        notes: 'CONFIDENTIAL_FINAL_NOTE: Approved compensation band.'
      });
    expect(finalRes.status).toBe(200);
    expect(finalRes.body.data.currentStage).toBe('FINAL_SELECTION');

    // 8. STAGE 6: Offer Processing & Candidate Offer Acceptance
    const offerRes = await request(app)
      .post('/api/v1/offers')
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .field('applicationId', applicationId)
      .field('offeredSalary', '195000')
      .field('salaryCurrency', 'USD')
      .field('designation', 'Principal Security Architect')
      .field('department', 'Security')
      .field('joiningDate', new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString())
      .field('offerValidUntil', new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString())
      .field('termsSummary', 'Includes annual bonus and equity grant.')
      .field('sendImmediately', 'true')
      .attach('offerLetter', Buffer.from('%PDF-1.4 Offer Letter PDF'), {
        filename: 'offer_letter_jordan.pdf',
        contentType: 'application/pdf'
      });
    expect(offerRes.status).toBe(201);
    expect(offerRes.body.data.status).toBe('SENT');
    const offerId = offerRes.body.data.id;

    // Candidate Portal inspection: MUST see own progress & offer, MUST NOT see confidential feedback or internal remarks!
    const portalRes = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${candidateToken}`);
    expect(portalRes.status).toBe(200);
    expect(portalRes.body.data.applications).toHaveLength(1);
    const portalSerialized = JSON.stringify(portalRes.body.data);
    expect(portalSerialized).not.toContain('CONFIDENTIAL_TECH_EVALUATION');
    expect(portalSerialized).not.toContain('CONFIDENTIAL_MGR_EVALUATION');
    expect(portalSerialized).not.toContain('CONFIDENTIAL_FINAL_NOTE');
    expect(portalSerialized).not.toContain('internal confidential note');

    // Candidate accepts offer
    const acceptRes = await request(app)
      .post(`/api/v1/portal/offers/${offerId}/respond`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({ decision: 'ACCEPT', note: 'Thrilled to join!' });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe('ACCEPTED');

    // 9. STAGE 7: Joining Initiation, Joining Letter, and HIRED Confirmation
    const joinInitRes = await request(app)
      .post('/api/v1/joining')
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .field('applicationId', applicationId)
      .field('joiningLocation', 'Austin HQ / Hybrid')
      .field('reportingManager', 'VP of Security Engineering')
      .attach('joiningLetter', Buffer.from('%PDF-1.4 Joining Letter'), {
        filename: 'joining_letter.pdf',
        contentType: 'application/pdf'
      });
    expect(joinInitRes.status).toBe(201);
    expect(joinInitRes.body.data.status).toBe('LETTER_SENT');
    const joiningId = joinInitRes.body.data.id;

    const hiredRes = await request(app)
      .patch(`/api/v1/joining/${joiningId}/status`)
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .send({ status: 'JOINED' });
    expect(hiredRes.status).toBe(200);
    expect(hiredRes.body.data.status).toBe('JOINED');
    expect(hiredRes.body.data.hiredAt).toBeTruthy();

    // Candidate Portal tracker shows all 8 stages completed & HIRED
    const portalAfterHire = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${candidateToken}`);
    expect(portalAfterHire.body.data.applications[0].currentStage).toBe('HIRED');
    expect(portalAfterHire.body.data.applications[0].progressTracker.every((s) => s.status === 'COMPLETED')).toBe(true);

    // Recruitment Reports reflect accurate analytics
    const reportsRes = await request(app)
      .get('/api/v1/reports/summary')
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`);
    expect(reportsRes.status).toBe(200);
    expect(reportsRes.body.data.recentHires).toHaveLength(1);

    // Verify all key lifecycle notifications were dispatched
    const sentEvents = notificationAdapter.getDispatchedNotifications().map((n) => n.eventType);
    expect(sentEvents).toContain('APPLICATION_RECEIVED');
    expect(sentEvents).toContain('CANDIDATE_SHORTLISTED');
    expect(sentEvents).toContain('INTERVIEW_SCHEDULED');
    expect(sentEvents).toContain('INTERVIEW_RESCHEDULED');
    expect(sentEvents).toContain('INTERVIEW_FEEDBACK_SUBMITTED');
    expect(sentEvents).toContain('FINAL_SELECTION');
    expect(sentEvents).toContain('OFFER_LETTER_SENT');
    expect(sentEvents).toContain('OFFER_ACCEPTED');
    expect(sentEvents).toContain('JOINING_LETTER_SENT');
    expect(sentEvents).toContain('JOINING_CONFIRMED');
  });
});
