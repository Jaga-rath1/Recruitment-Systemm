'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { v4: uuidv4 } = require('uuid');

const app = require('../src/app');
const sequelize = require('../src/config/database');
const Notification = require('../src/modules/notifications/notifications.model');
const emailProvider = require('../src/providers/email.provider');
const { INTERNAL_SERVICE_TOKEN } = require('../src/config/env');

const TEST_INTERNAL_TOKEN = INTERNAL_SERVICE_TOKEN || 'nexnuv-internal-service-token-dev';

async function startTestServer() {
  await sequelize.authenticate();
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({ server, baseUrl });
    });
  });
}

function stopTestServer(server) {
  return new Promise((resolve) => {
    server.close(resolve);
  });
}

function authHeaders(orgId, userId = 'svc-recruitment', role = 'super_admin', serviceName = 'recruitment-service') {
  return {
    'Content-Type': 'application/json',
    'x-internal-token': TEST_INTERNAL_TOKEN,
    'x-user-id': userId,
    'x-user-role': role,
    'x-organization-id': orgId,
    ...(serviceName ? { 'x-service-name': serviceName } : {})
  };
}

test('NEXNUV Recruitment — Notification Service Final End-to-End Verification Suite', async (t) => {
  const { server, baseUrl } = await startTestServer();

  const orgA = uuidv4();
  const orgB = uuidv4();
  const userA = `user-${Date.now()}-A`;
  const userB = `user-${Date.now()}-B`;

  const createdNotificationIds = [];

  t.after(async () => {
    // Clean up all created test notifications from Neon PostgreSQL
    if (createdNotificationIds.length > 0) {
      await Notification.destroy({ where: { id: createdNotificationIds } }).catch(() => {});
    }
    await stopTestServer(server);
    await sequelize.close().catch(() => {});
  });

  // =========================================================================
  // 1. Authentication and Authorization Security Scenarios
  // =========================================================================
  await t.test('1. Authentication & Authorization Security', async (st) => {
    await st.test('1.1 Rejects request with missing x-internal-token (401)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'user-1',
          'x-organization-id': orgA
        },
        body: JSON.stringify({ userId: 'u1', title: 'T', message: 'M' })
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.message, 'Unauthorized');
    });

    await st.test('1.2 Rejects request with invalid x-internal-token (401)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': 'wrong-token-12345',
          'x-user-id': 'user-1',
          'x-organization-id': orgA
        },
        body: JSON.stringify({ userId: 'u1', title: 'T', message: 'M' })
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.success, false);
    });

    await st.test('1.3 Rejects request with missing x-user-id (401)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': TEST_INTERNAL_TOKEN,
          'x-organization-id': orgA
        },
        body: JSON.stringify({ userId: 'u1', title: 'T', message: 'M' })
      });
      assert.equal(res.status, 401);
    });

    await st.test('1.4 Rejects request with missing x-organization-id (403)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': TEST_INTERNAL_TOKEN,
          'x-user-id': 'user-1'
        },
        body: JSON.stringify({ userId: 'u1', title: 'T', message: 'M' })
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.message, 'Missing organization context');
    });

    await st.test('1.5 Rejects notification creation by non-admin, non-service actor (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': TEST_INTERNAL_TOKEN,
          'x-user-id': 'employee-123',
          'x-user-role': 'employee',
          'x-organization-id': orgA
          // x-service-name omitted
        },
        body: JSON.stringify({ userId: 'target-user', title: 'T', message: 'M' })
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.message, 'Forbidden');
    });

    await st.test('1.6 Allows notification creation with x-service-name header (201)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA, 'svc-recruitment', '', 'recruitment-service'),
        body: JSON.stringify({
          userId: userA,
          title: 'Service Notification',
          message: 'Created by recruitment-service directly',
          sendEmail: false
        })
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data.id);
      createdNotificationIds.push(body.data.id);
    });
  });

  // =========================================================================
  // 2. Payload Validation & Malformed Input Scenarios
  // =========================================================================
  await t.test('2. Payload Validation & Error Handling', async (st) => {
    await st.test('2.1 Rejects missing userId (400)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({ title: 'Title', message: 'Message' })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.message, 'userId is required');
    });

    await st.test('2.2 Rejects whitespace-only userId (400)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({ userId: '   ', title: 'Title', message: 'Message' })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.message, 'userId is required');
    });

    await st.test('2.3 Rejects missing title without template (400)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({ userId: userA, message: 'Message' })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.message, 'title is required');
    });

    await st.test('2.4 Rejects title exceeding 255 characters (400)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({ userId: userA, title: 'A'.repeat(256), message: 'Message' })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.message, 'title must not exceed 255 characters');
    });

    await st.test('2.5 Rejects message exceeding 5000 characters (400)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({ userId: userA, title: 'Title', message: 'A'.repeat(5001) })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.message, 'message must not exceed 5000 characters');
    });

    await st.test('2.6 Rejects malformed recipientEmail (400)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({ userId: userA, title: 'Title', message: 'Message', recipientEmail: 'not-an-email' })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.message, 'recipientEmail must be a valid email address');
    });

    await st.test('2.7 Rejects non-boolean sendEmail flag (400)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({ userId: userA, title: 'Title', message: 'Message', sendEmail: 'yes' })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.message, 'sendEmail must be a boolean');
    });

    await st.test('2.8 Rejects malformed data payload (non-object) (400)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({ userId: userA, title: 'Title', message: 'Message', data: 'string-instead-of-object' })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.message, 'data must be a plain object when provided');
    });
  });

  // =========================================================================
  // 3. Organisation Tenant Isolation Scenarios
  // =========================================================================
  await t.test('3. Multi-Tenant Isolation & Cross-Tenant Boundary Protection', async (st) => {
    let orgANotificationId = '';

    // Create notification in Org A
    const resA = await fetch(`${baseUrl}/api/v1/notifications`, {
      method: 'POST',
      headers: authHeaders(orgA),
      body: JSON.stringify({
        userId: userA,
        title: 'Org A Confidential Offer',
        message: 'Offer details for Org A candidate only',
        sendEmail: false
      })
    });
    assert.equal(resA.status, 201);
    const bodyA = await resA.json();
    orgANotificationId = bodyA.data.id;
    createdNotificationIds.push(orgANotificationId);

    await st.test('3.1 Org B cannot view Org A notification by ID (404)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/${orgANotificationId}`, {
        headers: authHeaders(orgB, userA)
      });
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.message, 'Notification not found');
    });

    await st.test('3.2 Org B listing does not leak Org A notifications', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications?limit=50`, {
        headers: authHeaders(orgB, userA)
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      const leaked = (data.data || []).some((item) => item.id === orgANotificationId);
      assert.equal(leaked, false, 'Org A notification must never appear in Org B listing');
    });

    await st.test('3.3 Org B cannot mark read Org A notification (404)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/${orgANotificationId}/read`, {
        method: 'PATCH',
        headers: authHeaders(orgB, userA)
      });
      assert.equal(res.status, 404);
    });

    await st.test('3.4 Org B markAllRead does not mutate Org A notification status', async () => {
      await fetch(`${baseUrl}/api/v1/notifications/read-all`, {
        method: 'PATCH',
        headers: authHeaders(orgB, userA)
      });

      // Verify Org A record remains unread
      const resCheck = await fetch(`${baseUrl}/api/v1/notifications/${orgANotificationId}`, {
        headers: authHeaders(orgA, userA)
      });
      const dataCheck = await resCheck.json();
      assert.equal(dataCheck.data.isRead, false, 'Org A notification must still be unread');
    });

    await st.test('3.5 Org B cannot delete Org A notification (404)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/${orgANotificationId}`, {
        method: 'DELETE',
        headers: authHeaders(orgB, userA)
      });
      assert.equal(res.status, 404);

      // Verify still exists in Org A
      const resCheck = await fetch(`${baseUrl}/api/v1/notifications/${orgANotificationId}`, {
        headers: authHeaders(orgA, userA)
      });
      assert.equal(resCheck.status, 200);
    });

    await st.test('3.6 Unread count is strictly isolated per organisation', async () => {
      const resOrgA = await fetch(`${baseUrl}/api/v1/notifications/unread-count`, {
        headers: authHeaders(orgA, userA)
      });
      const dataOrgA = await resOrgA.json();
      assert.ok(dataOrgA.data.count >= 1);

      const resOrgB = await fetch(`${baseUrl}/api/v1/notifications/unread-count`, {
        headers: authHeaders(orgB, userA)
      });
      const dataOrgB = await resOrgB.json();
      assert.equal(dataOrgB.data.count, 0, 'Org B unread count must be 0 for this user');
    });
  });

  // =========================================================================
  // 4. Retry and Duplicate Notification Handling (Idempotency)
  // =========================================================================
  await t.test('4. Idempotency & Duplicate Notification Suppression', async (st) => {
    const key = `recruitment-idemp-${Date.now()}-${uuidv4()}`;

    await st.test('4.1 First submission creates new in-app notification', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({
          userId: userA,
          type: 'recruitment_interview_scheduled',
          title: 'Technical Interview Scheduled',
          message: 'Round 1 technical scheduled for tomorrow 10:00 AM',
          idempotencyKey: key,
          sendEmail: false
        })
      });
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.ok(data.data.id);
      assert.equal(data.data.duplicateSuppressed, undefined);
      createdNotificationIds.push(data.data.id);
    });

    await st.test('4.2 Re-submission with identical idempotencyKey suppresses duplicate', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({
          userId: userA,
          type: 'recruitment_interview_scheduled',
          title: 'Technical Interview Scheduled',
          message: 'Round 1 technical scheduled for tomorrow 10:00 AM',
          idempotencyKey: key,
          sendEmail: false
        })
      });
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.ok(data.data.id);
      assert.equal(data.data.duplicateSuppressed, true, 'Duplicate must be suppressed');
    });
  });

  // =========================================================================
  // 5. Email Provider Configuration & Failure Handling
  // =========================================================================
  await t.test('5. Multi-Channel Email Provider Integration & Graceful Failure', async (st) => {
    const originalSendMail = emailProvider.sendMail;

    st.after(() => {
      emailProvider.sendMail = originalSendMail;
    });

    await st.test('5.1 Successful email dispatch returns delivery confirmation', async () => {
      let sentOptions = null;
      emailProvider.sendMail = async (options) => {
        sentOptions = options;
        return { sent: true, messageId: 'mock-mail-id-12345', previewUrl: null, mode: 'mock' };
      };

      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({
          userId: userA,
          title: 'Offer Letter Sent',
          message: 'Please review and accept your offer letter.',
          recipientEmail: 'test-candidate-1@nexus.test',
          recipientName: 'Alex Mercer',
          sendEmail: true
        })
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.ok(sentOptions);
      assert.equal(sentOptions.to, 'test-candidate-1@nexus.test');
      assert.ok(data.data.emailDelivery);
      assert.equal(data.data.emailDelivery.sent, true);
      assert.equal(data.data.emailDelivery.messageId, 'mock-mail-id-12345');
      createdNotificationIds.push(data.data.id);
    });

    await st.test('5.2 Email provider failure is safely handled as partial failure without crashing 201 response', async () => {
      emailProvider.sendMail = async () => {
        throw new Error('SMTP connection timeout: Connection refused by upstream relay');
      };

      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({
          userId: userA,
          title: 'Joining Instructions',
          message: 'Please report on Monday 9 AM.',
          recipientEmail: 'test-candidate-2@nexus.test',
          sendEmail: true
        })
      });

      // Crucial requirement: email failures must NOT crash the notification API or return 500
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.ok(data.data.id);
      assert.ok(data.data.emailDelivery);
      assert.equal(data.data.emailDelivery.sent, false);
      assert.ok(data.data.emailDelivery.error.includes('Connection refused'));
      createdNotificationIds.push(data.data.id);
    });

    await st.test('5.3 When sendEmail is false, email provider is bypassed entirely', async () => {
      let called = false;
      emailProvider.sendMail = async () => {
        called = true;
        return { sent: true, messageId: 'm' };
      };

      const res = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({
          userId: userA,
          title: 'Silent In-App Alert',
          message: 'Dashboard stats updated',
          recipientEmail: 'test-candidate-3@nexus.test',
          sendEmail: false
        })
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(called, false);
      assert.equal(data.data.emailDelivery, undefined);
      createdNotificationIds.push(data.data.id);
    });
  });

  // =========================================================================
  // 6. Notification Status Tracking & Lifecycle
  // =========================================================================
  await t.test('6. Notification Status Tracking & Lifecycle', async (st) => {
    let notifId = '';

    const resCreate = await fetch(`${baseUrl}/api/v1/notifications`, {
      method: 'POST',
      headers: authHeaders(orgA),
      body: JSON.stringify({
        userId: userA,
        title: 'Status Tracking Notification',
        message: 'Initial state test',
        sendEmail: false
      })
    });
    const bodyCreate = await resCreate.json();
    notifId = bodyCreate.data.id;
    createdNotificationIds.push(notifId);

    await st.test('6.1 Newly created notification is unread', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/${notifId}`, {
        headers: authHeaders(orgA, userA)
      });
      const data = await res.json();
      assert.equal(data.data.isRead, false);
      assert.equal(data.data.readAt, null);
    });

    await st.test('6.2 Marking single notification as read updates isRead and readAt', async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/${notifId}/read`, {
        method: 'PATCH',
        headers: authHeaders(orgA, userA)
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.data.isRead, true);
      assert.ok(data.data.readAt);
    });

    await st.test('6.3 Marking all read updates all remaining unread notifications', async () => {
      // Create second unread
      const res2 = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: authHeaders(orgA),
        body: JSON.stringify({
          userId: userA,
          title: 'Second Notification',
          message: 'To be read in bulk',
          sendEmail: false
        })
      });
      const body2 = await res2.json();
      createdNotificationIds.push(body2.data.id);

      const resReadAll = await fetch(`${baseUrl}/api/v1/notifications/read-all`, {
        method: 'PATCH',
        headers: authHeaders(orgA, userA)
      });
      assert.equal(resReadAll.status, 200);
      const dataReadAll = await resReadAll.json();
      assert.ok(typeof dataReadAll.data.updated === 'number');

      const resCount = await fetch(`${baseUrl}/api/v1/notifications/unread-count`, {
        headers: authHeaders(orgA, userA)
      });
      const dataCount = await resCount.json();
      assert.equal(dataCount.data.count, 0, 'Unread count must be 0 after markAllRead');
    });

    await st.test('6.4 Delete by ID removes notification completely', async () => {
      const resDel = await fetch(`${baseUrl}/api/v1/notifications/${notifId}`, {
        method: 'DELETE',
        headers: authHeaders(orgA, userA)
      });
      assert.equal(resDel.status, 200);

      const resGet = await fetch(`${baseUrl}/api/v1/notifications/${notifId}`, {
        headers: authHeaders(orgA, userA)
      });
      assert.equal(resGet.status, 404);
    });
  });

  // =========================================================================
  // 7. End-to-End Workflow Testing — All 18 Implemented Recruitment Events
  // =========================================================================
  await t.test('7. End-to-End Testing of All 18 Implemented Recruitment Events', async (st) => {
    const originalSendMail = emailProvider.sendMail;
    let dispatchedEvents = [];

    emailProvider.sendMail = async (options) => {
      dispatchedEvents.push(options);
      return { sent: true, messageId: `msg-${uuidv4()}`, previewUrl: null, mode: 'mock' };
    };

    st.after(() => {
      emailProvider.sendMail = originalSendMail;
    });

    const RECRUITMENT_EVENTS = [
      {
        event: 'SUBSCRIPTION_SUBMITTED',
        title: 'Subscription Request Recorded — Vertex Cloud Corp',
        message: 'Hello Org Admin, your Recruitment Premium subscription request has been recorded. Remit payment with memo REC-SUB-101.',
        payload: { organisationName: 'Vertex Cloud Corp', paymentInstructions: { paymentMemo: 'REC-SUB-101' } }
      },
      {
        event: 'TRIAL_ACTIVATED',
        title: '15-Day Free Trial Activated — Alpha Tech',
        message: 'Hello Admin, your 15-day free trial has been activated. Welcome to NEXNUV Recruitment!',
        payload: { organisationName: 'Alpha Tech', trialDays: 15 }
      },
      {
        event: 'PAYMENT_APPROVED',
        title: 'Payment Approved — Vertex Cloud Corp',
        message: 'Hello Admin, your payment (PAY-REF-2026-001) has been verified and your organisation tenant is provisioned.',
        payload: { paymentReference: 'PAY-REF-2026-001' }
      },
      {
        event: 'PAYMENT_REJECTED',
        title: 'Subscription Payment Verification Issue',
        message: 'Hello Admin, payment verification requires attention: Invalid transaction UTR.',
        payload: { reason: 'Invalid transaction UTR' }
      },
      {
        event: 'ACCOUNT_INVITATION',
        title: 'Activate Your NEXNUV Recruitment Workspace — Vertex Cloud Corp',
        message: 'Hello Admin, your organisation subscription (Advanced) has been approved and your administrator workspace is provisioned.\n\nActivation Link: https://nexnuv.internal/activate-account?token=xyz (expires in 48 hours)\nLogin Portal: https://nexnuv.internal/login',
        payload: {
          organisationName: 'Vertex Cloud Corp',
          planName: 'Advanced',
          activationLink: 'https://nexnuv.internal/activate-account?token=xyz',
          expiresInHours: 48,
          loginUrl: 'https://nexnuv.internal/login'
        }
      },
      {
        event: 'EMPLOYEE_INVITATION',
        title: 'Invited to NEXNUV Recruitment Workspace',
        message: 'Hello Recruiter, you have been assigned the Recruiter role in NEXNUV Recruitment.',
        payload: { roleName: 'Recruiter' }
      },
      {
        event: 'APPLICATION_RECEIVED',
        title: 'Application Received — Senior Software Engineer',
        message: 'Hello Candidate, your application (APP-2026-101) has been received.',
        payload: { applicationReference: 'APP-2026-101', jobTitle: 'Senior Software Engineer' }
      },
      {
        event: 'CANDIDATE_SHORTLISTED',
        title: 'Application Shortlisted — Senior Software Engineer',
        message: 'Hello Candidate, congratulations — your application (APP-2026-101) has been shortlisted.',
        payload: { applicationReference: 'APP-2026-101', jobTitle: 'Senior Software Engineer' }
      },
      {
        event: 'CANDIDATE_REJECTED',
        title: 'Application Update — Senior Software Engineer',
        message: 'Hello Candidate, thank you for applying (APP-2026-101). We will not be moving forward at this stage.',
        payload: { applicationReference: 'APP-2026-101', jobTitle: 'Senior Software Engineer' }
      },
      {
        event: 'INTERVIEW_SCHEDULED',
        title: 'Technical Interview Scheduled',
        message: 'An interview (Technical Round #1) is scheduled for 2026-11-20 14:00:00.',
        payload: { roundType: 'Technical', roundNumber: 1, scheduledAt: '2026-11-20 14:00:00' }
      },
      {
        event: 'INTERVIEW_RESCHEDULED',
        title: 'Interview Rescheduled',
        message: 'Interview has been rescheduled to 2026-11-21 15:00:00: Interviewer requested slot change.',
        payload: { scheduledAt: '2026-11-21 15:00:00', reason: 'Interviewer requested slot change' }
      },
      {
        event: 'INTERVIEW_FEEDBACK_SUBMITTED',
        title: 'Interview Scorecard Submitted',
        message: 'Technical evaluation submitted with recommendation: STRONGLY_HIRE.',
        payload: { roundType: 'Technical', recommendation: 'STRONGLY_HIRE' }
      },
      {
        event: 'FINAL_SELECTION',
        title: 'Final Selection Update — Senior Software Engineer',
        message: 'Application APP-2026-101 moved to final decision: SELECTED.',
        payload: { applicationReference: 'APP-2026-101', decision: 'SELECTED', jobTitle: 'Senior Software Engineer' }
      },
      {
        event: 'OFFER_LETTER_SENT',
        title: 'Official Offer Letter — Senior Software Engineer',
        message: 'Hello Candidate, an official compensation offer has been extended for Senior Software Engineer.',
        payload: { designation: 'Senior Software Engineer' }
      },
      {
        event: 'OFFER_ACCEPTED',
        title: 'Candidate Accepted Offer',
        message: 'Candidate Alex Mercer accepted offer for application APP-2026-101.',
        payload: { candidateName: 'Alex Mercer', applicationReference: 'APP-2026-101' }
      },
      {
        event: 'OFFER_REJECTED',
        title: 'Candidate Declined Offer',
        message: 'Candidate Alex Mercer declined the offer for application APP-2026-101.',
        payload: { candidateName: 'Alex Mercer', applicationReference: 'APP-2026-101' }
      },
      {
        event: 'JOINING_LETTER_SENT',
        title: 'Joining & Onboarding Initiated',
        message: 'Hello Candidate, onboarding and joining details are ready for Bengaluru HQ.',
        payload: { joiningLocation: 'Bengaluru HQ' }
      },
      {
        event: 'JOINING_CONFIRMED',
        title: 'Welcome Aboard — Joining Confirmed',
        message: 'Hello Candidate, your joining status is confirmed as HIRED.',
        payload: { actualJoiningDate: '2026-12-01' }
      }
    ];

    for (const item of RECRUITMENT_EVENTS) {
      await st.test(`7.${RECRUITMENT_EVENTS.indexOf(item) + 1} Workflow: ${item.event}`, async () => {
        dispatchedEvents = [];
        const recipientEmail = `test-${item.event.toLowerCase()}@nexus.test`;

        const res = await fetch(`${baseUrl}/api/v1/notifications`, {
          method: 'POST',
          headers: authHeaders(orgA),
          body: JSON.stringify({
            userId: userA,
            type: `recruitment_${item.event.toLowerCase()}`,
            title: item.title,
            message: item.message,
            recipientEmail,
            recipientName: 'Test Recipient',
            sendEmail: true,
            idempotencyKey: `${item.event}:${orgA}:${userA}:${Date.now()}`,
            data: {
              ...item.payload,
              eventType: item.event,
              timestamp: new Date().toISOString()
            }
          })
        });

        assert.equal(res.status, 201, `Event ${item.event} must return 201`);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.ok(body.data.id);
        assert.equal(body.data.type, `recruitment_${item.event.toLowerCase()}`);
        assert.equal(body.data.title, item.title);
        assert.equal(body.data.message, item.message);
        assert.equal(body.data.organizationId, orgA);
        assert.equal(body.data.userId, userA);
        assert.ok(body.data.emailDelivery);
        assert.equal(body.data.emailDelivery.sent, true);
        assert.equal(body.data.emailDelivery.recipient, recipientEmail);

        // Verify email provider was triggered with matching content
        assert.equal(dispatchedEvents.length, 1);
        assert.equal(dispatchedEvents[0].to, recipientEmail);
        assert.equal(dispatchedEvents[0].subject, item.title);

        createdNotificationIds.push(body.data.id);
      });
    }
  });

  // =========================================================================
  // 8. Security & Secret Exposure Audit
  // =========================================================================
  await t.test('8. Secret Exposure & Security Audit', async (st) => {
    await st.test('8.1 Health check exposes zero database or token credentials', async () => {
      const res = await fetch(`${baseUrl}/health`);
      const body = await res.json();
      const str = JSON.stringify(body);
      assert.ok(!str.includes('password'));
      assert.ok(!str.includes('postgres://'));
      assert.ok(!str.includes('token'));
      assert.ok(!str.includes('secret'));
    });

    await st.test('8.2 Ready check exposes zero database or token credentials', async () => {
      const res = await fetch(`${baseUrl}/ready`);
      const body = await res.json();
      const str = JSON.stringify(body);
      assert.ok(!str.includes('password'));
      assert.ok(!str.includes('postgres://'));
      assert.ok(!str.includes('token'));
      assert.ok(!str.includes('secret'));
    });

    await st.test('8.3 Route 404 exposes zero stack traces or internal filenames', async () => {
      const res = await fetch(`${baseUrl}/api/v1/unknown-endpoint-test`);
      const body = await res.json();
      assert.equal(body.code, 'ROUTE_NOT_FOUND');
      assert.equal(body.stack, undefined);
      assert.equal(body.error?.details, null);
    });
  });
});
