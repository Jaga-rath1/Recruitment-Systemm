'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ticketTemplates = require('../src/modules/templates/ticket.templates');
const templatesService = require('../src/modules/templates/templates.service');
const { renderTicketCreated } = require('../src/templates/ticket-created');
const sequelize = require('../src/config/database');

test('NexnuvTKT Ticket Created Email Notification Tests', async (t) => {
  t.after(async () => {
    try {
      await sequelize.close();
    } catch {}
  });

  await t.test('Phase 1: Ticket Created template renders with reference design and dynamic ticket fields', () => {
    const input = {
      customerName: 'Parsuram Panda',
      creatorName: 'Parsuram Panda',
      customerEmail: 'parsuram.panda@company.com',
      creatorEmail: 'parsuram.panda@company.com',
      ticketId: 'TCK-20251023-0017',
      ticketNumber: '#TCK-20251023-0017',
      title: 'Login not working in production',
      subject: 'Login not working in production',
      incidentType: 'Software Bug',
      category: 'Software Bug',
      description: 'I am unable to login to the application in the production environment. It shows an error after entering valid credentials.',
      priority: 'High',
      status: 'OPEN',
      createdAt: '2025-10-23T16:48:00.000Z',
      assignedAgentName: 'Agent Smith',
      assignedAgentEmail: 'smith@nexnuv.com',
      slaPriorityLabel: 'P2',
      slaResponseTarget: '2 hours',
      ticketUrl: 'https://nexnuv-helpdesk.vercel.app/app/tickets/TCK-20251023-0017',
    };

    const rendered = renderTicketCreated(input);

    assert.ok(rendered.html, 'HTML output must be present');
    assert.ok(rendered.subject, 'Subject must be present');
    assert.ok(rendered.text, 'Plaintext fallback must be present');

    // Branding & Header
    const headerHtml = rendered.html.split('<!-- Main Content -->')[0] || '';
    assert.ok(headerHtml.includes('NexnuvTKT'), 'Must include NexnuvTKT branding in header');
    assert.ok(headerHtml.includes('Better Support, Faster Solution'), 'Must include tagline in header');
    assert.ok(!headerHtml.includes('Help Desk'), 'Header must not include Help Desk subtitle');

    // Dynamic Fields
    assert.ok(rendered.html.includes('Your Support Ticket Has Been Created'), 'Heading check');
    assert.ok(rendered.html.includes('Hello Parsuram Panda,'), 'Recipient greeting');
    assert.ok(rendered.html.includes('#TCK-20251023-0017'), 'Ticket ID');
    assert.ok(rendered.html.includes('Login not working in production'), 'Subject');
    assert.ok(rendered.html.includes('Software Bug'), 'Incident Type');
    assert.ok(rendered.html.includes('I am unable to login to the application in the production environment.'), 'Description');
    assert.ok(rendered.html.includes('High'), 'Priority');
    assert.ok(rendered.html.includes('Status: OPEN') || rendered.html.includes('OPEN'), 'Status');
    assert.ok(rendered.html.includes('parsuram.panda@company.com'), 'Creator email');
    assert.ok(rendered.html.includes('Oct 23, 2025'), 'Creation timestamp');
    assert.ok(rendered.html.includes('Agent Smith'), 'Assigned representative');
    assert.ok(rendered.html.includes('P2'), 'SLA Priority code');
    assert.ok(rendered.html.includes('2 hours'), 'SLA Response target');
    assert.ok(rendered.html.includes('https://nexnuv-helpdesk.vercel.app/app/tickets/TCK-20251023-0017'), 'View ticket URL');

    // Plaintext alternative
    assert.ok(rendered.text.includes('Hello Parsuram Panda,'), 'Plaintext contains greeting');
    assert.ok(rendered.text.includes('#TCK-20251023-0017'), 'Plaintext contains ticket ID');
    assert.ok(rendered.text.includes('Status: OPEN'), 'Plaintext contains status');
  });

  await t.test('Phase 1 & Phase 3: HTML escaping and injection prevention in Ticket Created', () => {
    const maliciousInput = {
      customerName: 'Customer <script>alert("hack")</script>',
      creatorEmail: 'test@evil.com"><script>alert(1)</script>',
      ticketNumber: 'TCK-100"><img src=x onerror=alert(2)>',
      title: 'XSS <b onmouseover=alert(3)>test</b>',
      incidentType: 'Bug <iframe src="evil.com"></iframe>',
      description: 'Line 1\n<script>stealData()</script>\nLine 3 & "quoted"',
      priority: 'High',
      status: 'OPEN',
      assignedAgentName: 'Agent <svg onload=alert(4)>',
    };

    const rendered = renderTicketCreated(maliciousInput);

    assert.ok(!rendered.html.includes('<script>'), 'Unescaped script tags must not be present');
    assert.ok(!rendered.html.includes('<iframe'), 'Unescaped iframe must not be present');
    assert.ok(!rendered.html.includes('<svg onload='), 'Unescaped svg onload must not be present');
    assert.ok(!rendered.html.includes('<img src=x onerror='), 'Unescaped onerror must not be present');
    assert.ok(rendered.html.includes('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;'), 'Must be safely entity-escaped');
  });

  await t.test('Phase 1: Graceful fallback for missing optional fields', () => {
    const minimalInput = {
      ticketNumber: 'HD-101',
      title: 'Network latency',
    };

    const rendered = renderTicketCreated(minimalInput);

    assert.ok(rendered.html.includes('Valued Customer'), 'Fallback customer name');
    assert.ok(rendered.html.includes('#HD-101'), 'Ticket number with hash prefix');
    assert.ok(rendered.html.includes('Network latency'), 'Subject');
    assert.ok(rendered.html.includes('General Support'), 'Fallback incident type');
    assert.ok(rendered.html.includes('Pending Assignment'), 'Fallback assigned representative');
  });

  await t.test('Phase 1 & Phase 2: Registry integration via templatesService.renderTemplate', () => {
    const rendered = templatesService.renderTemplate('ticket_created', {
      ticketNumber: 'HD-202',
      title: 'Server restart requested',
      customerName: 'DevOps Lead',
      customerEmail: 'devops@nexnuv.com',
      priority: 'High',
    });

    assert.ok(rendered.subject.includes('[#HD-202]'), 'Subject has ticket ID prefix');
    assert.ok(rendered.html.includes('Server restart requested'), 'HTML includes title');
    assert.ok(rendered.html.includes('DevOps Lead'), 'HTML includes customer name');
    assert.ok(rendered.html.includes('P2'), 'P2 auto-resolved for High priority');
  });

  await t.test('Scenario A & Technical Requirements: Notification service routes CC to email provider when specialist is assigned', async () => {
    const notificationsService = require('../src/modules/notifications/notifications.service');
    const emailProvider = require('../src/providers/email.provider');
    const Notification = require('../src/modules/notifications/notifications.model');
    const origSendMail = emailProvider.sendMail;
    const origCreate = Notification.create;
    const origFindOne = Notification.findOne;

    Notification.create = async (record) => ({
      ...record,
      toJSON: () => ({ ...record, id: 'notif-mock-1' }),
    });
    Notification.findOne = async () => null;

    let capturedMailOptions = null;
    emailProvider.sendMail = async (options) => {
      capturedMailOptions = options;
      return { sent: true, messageId: 'msg-test-1', previewUrl: null, mode: 'mock' };
    };

    try {
      const orgId = '00000000-0000-0000-0000-000000000001';
      const result = await notificationsService.create(orgId, {
        userId: 'requester-1',
        type: 'TICKET_CREATED',
        recipientEmail: 'support-team@company.com',
        recipientName: 'Support Team',
        cc: 'specialist@company.com',
        sendEmail: true,
        templateParams: {
          ticketId: 'tck-101',
          ticketNumber: 'HD-101',
          title: 'Database connection timeout',
          creatorName: 'Database Admin',
          creatorEmail: 'dba@company.com',
          priority: 'High',
          status: 'OPEN',
          assignedAgentName: 'Specialist John',
          assignedAgentEmail: 'specialist@company.com',
        },
      });

      assert.ok(capturedMailOptions, 'emailProvider.sendMail must be called');
      assert.equal(capturedMailOptions.to, 'support-team@company.com', 'To field must be destination team email');
      assert.equal(capturedMailOptions.cc, 'specialist@company.com', 'CC field must be assigned specialist email');
      assert.equal(result.emailDelivery?.sent, true);
      assert.equal(result.emailDelivery?.recipient, 'support-team@company.com');
      assert.equal(result.emailDelivery?.cc, 'specialist@company.com');
    } finally {
      emailProvider.sendMail = origSendMail;
      Notification.create = origCreate;
      Notification.findOne = origFindOne;
    }
  });

  await t.test('Scenario B: Notification service sends email only to team without CC when no specialist assigned', async () => {
    const notificationsService = require('../src/modules/notifications/notifications.service');
    const emailProvider = require('../src/providers/email.provider');
    const Notification = require('../src/modules/notifications/notifications.model');
    const origSendMail = emailProvider.sendMail;
    const origCreate = Notification.create;
    const origFindOne = Notification.findOne;

    Notification.create = async (record) => ({
      ...record,
      toJSON: () => ({ ...record, id: 'notif-mock-2' }),
    });
    Notification.findOne = async () => null;

    let capturedMailOptions = null;
    emailProvider.sendMail = async (options) => {
      capturedMailOptions = options;
      return { sent: true, messageId: 'msg-test-2', previewUrl: null, mode: 'mock' };
    };

    try {
      const orgId = '00000000-0000-0000-0000-000000000001';
      const result = await notificationsService.create(orgId, {
        userId: 'requester-2',
        type: 'TICKET_CREATED',
        recipientEmail: 'support-team@company.com',
        recipientName: 'Support Team',
        sendEmail: true,
        templateParams: {
          ticketId: 'tck-102',
          ticketNumber: 'HD-102',
          title: 'Storage pool full',
          creatorName: 'Storage Admin',
          creatorEmail: 'storage@company.com',
          priority: 'Critical',
          status: 'OPEN',
        },
      });

      assert.ok(capturedMailOptions, 'emailProvider.sendMail must be called');
      assert.equal(capturedMailOptions.to, 'support-team@company.com');
      assert.equal(capturedMailOptions.cc, undefined, 'CC must not be present when no specialist assigned');
      assert.equal(result.emailDelivery?.sent, true);
      assert.equal(result.emailDelivery?.cc, null);
    } finally {
      emailProvider.sendMail = origSendMail;
      Notification.create = origCreate;
      Notification.findOne = origFindOne;
    }
  });

  await t.test('Scenario C: Notification service prevents duplicate CC when team email and specialist email are identical', async () => {
    const notificationsService = require('../src/modules/notifications/notifications.service');
    const emailProvider = require('../src/providers/email.provider');
    const Notification = require('../src/modules/notifications/notifications.model');
    const origSendMail = emailProvider.sendMail;
    const origCreate = Notification.create;
    const origFindOne = Notification.findOne;

    Notification.create = async (record) => ({
      ...record,
      toJSON: () => ({ ...record, id: 'notif-mock-3' }),
    });
    Notification.findOne = async () => null;

    let capturedMailOptions = null;
    emailProvider.sendMail = async (options) => {
      capturedMailOptions = options;
      return { sent: true, messageId: 'msg-test-3', previewUrl: null, mode: 'mock' };
    };

    try {
      const orgId = '00000000-0000-0000-0000-000000000001';
      const result = await notificationsService.create(orgId, {
        userId: 'requester-3',
        type: 'TICKET_CREATED',
        recipientEmail: 'support-team@company.com',
        recipientName: 'Support Team',
        cc: 'SUPPORT-TEAM@company.com', // Duplicate email with different case
        sendEmail: true,
        templateParams: {
          ticketId: 'tck-103',
          ticketNumber: 'HD-103',
          title: 'Cache eviction spike',
        },
      });

      assert.ok(capturedMailOptions);
      assert.equal(capturedMailOptions.to, 'support-team@company.com');
      assert.equal(capturedMailOptions.cc, undefined, 'Duplicate CC must be suppressed');
      assert.equal(result.emailDelivery?.cc, null);
    } finally {
      emailProvider.sendMail = origSendMail;
      Notification.create = origCreate;
      Notification.findOne = origFindOne;
    }
  });

  await t.test('Scenario D: CC email validation rejects invalid email format', () => {
    const { validateCreate } = require('../src/modules/notifications/notifications.validation');

    const invalid = validateCreate({
      userId: 'user-1',
      type: 'TICKET_CREATED',
      title: 'Ticket Created',
      message: 'Body',
      recipientEmail: 'team@company.com',
      cc: 'not-an-email',
    });
    assert.equal(invalid, 'cc must be a valid email address');

    const valid = validateCreate({
      userId: 'user-1',
      type: 'TICKET_CREATED',
      title: 'Ticket Created',
      message: 'Body',
      recipientEmail: 'team@company.com',
      cc: 'specialist@company.com',
    });
    assert.equal(valid, null);
  });
});
