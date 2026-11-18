'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const templatesService = require('../src/modules/templates/templates.service');

describe('Agent Onboarding Notification Template Suite', () => {
  test('agent_onboarding template is registered in templates service', () => {
    assert.equal(templatesService.hasTemplate('agent_onboarding'), true);
  });

  test('renders agent onboarding email with exact specifications', () => {
    const rendered = templatesService.renderTemplate('agent_onboarding', {
      agentName: 'Jordan Miller',
      tenantName: 'Nexnuv Enterprise IT',
      email: 'pparsuram420@gmail.com',
      tempPassword: 'TempPassword#2026',
      loginUrl: 'https://nexnuv-helpdesk.vercel.app/login',
    });

    assert.equal(rendered.subject, 'Your Nexnuv Orbit Agent Account Is Ready');
    assert.ok(rendered.html.includes('Jordan Miller'), 'Must contain agent name');
    assert.ok(rendered.html.includes('Nexnuv Enterprise IT'), 'Must contain tenant name');
    assert.ok(rendered.html.includes('pparsuram420@gmail.com'), 'Must contain email');
    assert.ok(rendered.html.includes('TempPassword#2026'), 'Must contain temp password');
    assert.ok(rendered.html.includes('https://nexnuv-helpdesk.vercel.app/login'), 'Must contain login URL');
    assert.ok(rendered.html.includes('Welcome to Nexnuv Orbit'), 'Must contain product brand heading');
    assert.ok(!rendered.html.includes('undefined'), 'Must not have undefined placeholders');
    assert.ok(!rendered.html.includes('null'), 'Must not have null placeholders');

    assert.ok(rendered.text.includes('Jordan Miller'));
    assert.ok(rendered.text.includes('Nexnuv Enterprise IT'));
    assert.ok(rendered.text.includes('pparsuram420@gmail.com'));
    assert.ok(rendered.text.includes('TempPassword#2026'));
  });
});
