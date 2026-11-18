'use strict';
const { createNotification } = require('../clients/notificationClient');

function fullName(e) {
  return [e.firstName, e.lastName].filter(Boolean).join(' ') || e.employeeCode || 'An employee';
}

async function safe(fn) {
  try { await fn(); } catch (err) { console.warn('[employee-service] notification trigger error:', err.message); }
}

const STATUS_COPY = {
  active:     { title: 'Employee activated',   verb: 'activated' },
  inactive:   { title: 'Employee deactivated', verb: 'deactivated' },
  terminated: { title: 'Employee terminated',  verb: 'terminated' },
  onboarding: { title: 'Onboarding started',   verb: 'moved to onboarding' },
  on_leave:   { title: 'Employee on leave',    verb: 'marked as on leave' },
};

// The admin who made the change gets a confirmation; the employee is told
// when they have a login to read it with.
async function employeeCreated(orgId, emp, actingUserId) {
  await safe(async () => {
    if (!actingUserId) return;
    await createNotification(orgId, {
      userId: actingUserId, type: 'employee', title: 'Employee created',
      message: `${fullName(emp)} was added to your organization.`,
      data: { employeeId: emp.id, status: emp.status },
    });
  });
}

// First thing a newly provisioned employee sees after signing in.
async function loginProvisioned(orgId, emp) {
  await safe(async () => {
    if (!emp.authUserId) return;
    await createNotification(orgId, {
      userId: emp.authUserId, type: 'employee', title: 'Welcome aboard',
      message: 'Your account is ready. You can now use your workspace.',
      data: { employeeId: emp.id },
    });
  });
}

async function employeeStatusChanged(orgId, emp, actingUserId) {
  await safe(async () => {
    const copy = STATUS_COPY[emp.status] || { title: 'Employee status updated', verb: `set to ${emp.status}` };
    const data = { employeeId: emp.id, status: emp.status };
    if (actingUserId) {
      await createNotification(orgId, {
        userId: actingUserId, type: 'employee', title: copy.title,
        message: `${fullName(emp)} was ${copy.verb}.`, data,
      });
    }
    if (emp.authUserId && emp.authUserId !== actingUserId) {
      await createNotification(orgId, {
        userId: emp.authUserId, type: 'employee', title: copy.title,
        message: `Your employee record was ${copy.verb}.`, data,
      });
    }
  });
}

module.exports = { employeeCreated, loginProvisioned, employeeStatusChanged };
