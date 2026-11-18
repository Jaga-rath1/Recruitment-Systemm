'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ticketTemplates = require('../src/modules/templates/ticket.templates');
const templatesService = require('../src/modules/templates/templates.service');
const notificationsService = require('../src/modules/notifications/notifications.service');
const Notification = require('../src/modules/notifications/notifications.model');
const sequelize = require('../src/config/database');

test('NexnuvTKT Ticket Assignment Email Integration Tests', async (t) => {
  t.after(async () => {
    try {
      await sequelize.close();
    } catch {}
  });

  await t.test('Phase 2 & Phase 3: Template renders with exact NexnuvTKT branding and 13 approved fields', () => {
    const sampleInput = {
      agentName: 'Parsuram Panda',
      ticketId: 'TCK-20251023-0017',
      ticketNumber: '#TCK-20251023-0017',
      title: 'Login not working in production',
      category: 'Software Issue',
      description: 'I am unable to login to the application in the production environment. It shows an error after entering valid credentials.',
      priority: 'High',
      creatorName: 'Parsuram Panda',
      creatorEmail: 'parsuram.panda@company.com',
      createdAt: '2025-10-23T16:48:00.000Z',
      slaPriorityLabel: 'P2',
      slaResponseTarget: '2 hours',
      link: 'https://nexnuv-helpdesk.vercel.app/app/tickets/TCK-20251023-0017',
    };

    const rendered = ticketTemplates.ticket_assigned(sampleInput);

    assert.ok(rendered.html, 'HTML output must be present');
    assert.ok(rendered.subject, 'Subject must be present');
    assert.ok(rendered.text, 'Plaintext fallback must be present');

    // 1. Branding checks
    const headerHtml = rendered.html.split('<!-- 2. Main Content Card Area -->')[0] || '';
    assert.ok(headerHtml.includes('NexnuvTKT'), 'Must include NexnuvTKT branding in header');
    assert.ok(headerHtml.includes('Better Support, Faster Solution'), 'Must include tagline in header');
    assert.ok(!headerHtml.includes('Help Desk'), 'Header must not include Help Desk subtitle');
    assert.ok(!rendered.html.includes('Orbit'), 'Must not contain legacy Orbit branding');
    assert.ok(!rendered.html.includes('NexNuv Orbit'), 'Must not contain NexNuv Orbit');

    // 2. Exact 13 Approved Fields
    assert.ok(rendered.html.includes('Hello Parsuram Panda,'), 'Field 1: Agent greeting');
    assert.ok(rendered.html.includes('#TCK-20251023-0017'), 'Field 2: Ticket ID');
    assert.ok(rendered.html.includes('Login not working in production'), 'Field 3: Ticket subject');
    assert.ok(rendered.html.includes('Software Issue'), 'Field 4: Incident type');
    assert.ok(rendered.html.includes('I am unable to login to the application in the production environment.'), 'Field 5: Ticket description');
    assert.ok(rendered.html.includes('High'), 'Field 6: Ticket priority');
    assert.ok(rendered.html.includes('Parsuram Panda'), 'Field 7: Creator name');
    assert.ok(rendered.html.includes('parsuram.panda@company.com'), 'Field 8: Creator email');
    assert.ok(rendered.html.includes('Oct 23, 2025 • 04:48 PM') || rendered.html.includes('Oct 23, 2025'), 'Field 9: Formatted creation date');
    assert.ok(rendered.html.includes('P2'), 'Field 10: SLA priority code');
    assert.ok(rendered.html.includes('2 hours'), 'Field 11: SLA response target');
    assert.ok(rendered.html.includes('https://nexnuv-helpdesk.vercel.app/app/tickets/TCK-20251023-0017'), 'Field 12: View Ticket URL');
    const currentYear = new Date().getFullYear();
    assert.ok(rendered.html.includes(String(currentYear)), 'Field 13: Footer current year');

    // Static presentation elements from screenshot
    assert.ok(rendered.html.includes('Assigned to You'), 'Static assignment badge');
    assert.ok(rendered.html.includes('Ticket Details'), 'Static Ticket Details header');
    assert.ok(rendered.html.includes('SLA Reminder'), 'Static SLA Reminder header');
    assert.ok(rendered.html.includes('View Ticket'), 'CTA button text');
    assert.ok(rendered.html.includes('Need help? Contact your team lead or reach out to the Help Desk channel.'), 'Footer support notice');
  });

  await t.test('Phase 3: Strict Allowlist - ensures disallowed fields are excluded from output', () => {
    const rendered = ticketTemplates.ticket_assigned({
      agentName: 'Agent John',
      ticketNumber: 'HD-999',
      title: 'Database connection lag',
      priority: 'Normal',
      status: 'IN_PROGRESS', // Should not be displayed
      internalNotes: 'Secret internal agent discussion',
      comments: 'Customer replied: please hurry',
      accountCredentials: 'password123',
      rawDatabaseUuid: '00000000-0000-0000-0000-000000000000',
    });

    assert.ok(!rendered.html.includes('IN_PROGRESS'), 'Status must not be displayed in assignment email');
    assert.ok(!rendered.html.includes('Secret internal agent discussion'), 'Internal notes must not be displayed');
    assert.ok(!rendered.html.includes('Customer replied: please hurry'), 'Comments must not be displayed');
    assert.ok(!rendered.html.includes('password123'), 'Credentials must not be displayed');
  });

  await t.test('Phase 3 & Phase 6: HTML Injection and XSS Prevention', () => {
    const maliciousPayload = {
      agentName: 'Agent <script>alert("xss")</script>',
      ticketNumber: 'HD-100"><img src=x onerror=alert(1)>',
      title: 'Fix <svg onload=alert(2)> bug',
      category: 'Issue <b>bold</b>',
      description: 'Line 1\n<script>stealCookies()</script>\nLine 3 & "quoted"',
      priority: 'High',
      creatorName: 'Hacker <iframe src="evil.com"></iframe>',
      creatorEmail: 'evil@test.com"><script>',
      link: 'javascript:alert("exploit")',
    };

    const rendered = ticketTemplates.ticket_assigned(maliciousPayload);

    // Verify all active HTML tags are escaped and neutralized
    assert.ok(!rendered.html.includes('<script>'), 'Must escape script tags');
    assert.ok(!rendered.html.includes('<iframe'), 'Must escape iframe tags');
    assert.ok(!rendered.html.includes('<svg onload'), 'Must escape svg onload tags');
    assert.ok(!rendered.html.includes('<img src=x'), 'Must escape img error handlers');
    assert.ok(rendered.html.includes('&lt;script&gt;'), 'Must encode < and >');
    assert.ok(rendered.html.includes('&lt;svg'), 'Must encode svg opening tag');
    assert.ok(rendered.html.includes('&lt;iframe'), 'Must encode iframe opening tag');
    assert.ok(rendered.html.includes('<br/>'), 'Must convert newlines safely to <br/>');
    assert.ok(!rendered.html.includes('href="javascript:'), 'Must reject malicious javascript: links');
    assert.ok(rendered.html.includes('https://nexnuv-helpdesk.vercel.app/app/tickets/'), 'Must fall back to trusted configured application URL');
  });

  await t.test('Phase 3: Fallback handling for missing optional values', () => {
    const minimal = ticketTemplates.ticket_assigned({});

    assert.ok(renderedWithoutCrash(minimal));
    assert.ok(minimal.html.includes('Hello Agent,'), 'Defaults to Hello Agent,');
    assert.ok(minimal.html.includes('Software Issue'), 'Defaults incident type cleanly');
    assert.ok(!minimal.html.includes('undefined'), 'No undefined placeholders in HTML');
    assert.ok(!minimal.html.includes('null'), 'No null placeholders in HTML');
  });

  await t.test('Phase 4 & Phase 7: Templates Service renders ticket_assigned through registry', () => {
    assert.ok(templatesService.hasTemplate('ticket_assigned'), 'Template registry has ticket_assigned');
    assert.ok(templatesService.hasTemplate('TICKET_ASSIGNED'), 'Case-insensitive registry lookup works');

    const result = templatesService.renderTemplate('ticket_assigned', {
      agentName: 'Maria Silva',
      ticketNumber: 'HD-2026-0099',
      title: 'Payment gateway timeout',
      priority: 'High',
    });

    assert.ok(result.html.includes('Maria Silva'));
    assert.ok(result.html.includes('Payment gateway timeout'));
    assert.ok(result.html.includes('P2'), 'Resolves High priority to P2');
    assert.ok(result.html.includes('2 hours'), 'Resolves High priority target to 2 hours');
  });

  await t.test('Phase 5: Notification Service deduplication and idempotency protection', async () => {
    await sequelize.authenticate();

    const orgId = '00000000-0000-0000-0000-000000000001';
    const testAgentId = `test-agent-${Date.now()}`;
    const testTicketId = `ticket-${Date.now()}`;

    // First dispatch
    const firstNotification = await notificationsService.create(orgId, {
      userId: testAgentId,
      type: 'TICKET_ASSIGNED',
      recipientEmail: 'agent.test@nexnuv.local',
      recipientName: 'Test Agent',
      sendEmail: false, // In-memory/test only
      data: { ticketId: testTicketId },
      templateParams: {
        ticketId: testTicketId,
        ticketNumber: 'HD-TEST-1',
        title: 'Network latency spike',
        priority: 'High',
      },
    });

    assert.ok(firstNotification.id, 'First notification must be created');
    assert.equal(firstNotification.duplicateSuppressed, undefined);

    // Second dispatch with same ticketId and recipient
    const secondNotification = await notificationsService.create(orgId, {
      userId: testAgentId,
      type: 'TICKET_ASSIGNED',
      recipientEmail: 'agent.test@nexnuv.local',
      recipientName: 'Test Agent',
      sendEmail: false,
      data: { ticketId: testTicketId },
      templateParams: {
        ticketId: testTicketId,
        ticketNumber: 'HD-TEST-1',
        title: 'Network latency spike',
        priority: 'High',
      },
    });

    assert.equal(secondNotification.id, firstNotification.id, 'Duplicate returns existing notification');
    assert.equal(secondNotification.duplicateSuppressed, true, 'Duplicate notification is safely suppressed');

    // Clean up test rows
    await Notification.destroy({ where: { id: firstNotification.id } });
  });
});

function renderedWithoutCrash(result) {
  return Boolean(result && result.html && result.subject && result.text);
}
