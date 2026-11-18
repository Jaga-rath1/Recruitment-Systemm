'use strict';

const { randomUUID } = require('crypto');

// Canonical product catalog. The HRMS services authorize requests against
// these codes, so they must exist exactly once and keep these spellings.
const MODULE = { code: 'HRMS', name: 'HRMS', description: 'Human resource management' };
const SUBMODULES = [
  { code: 'EMPLOYEES', name: 'Employees', description: 'Employee records, hierarchy and logins' },
  { code: 'ATTENDANCE', name: 'Attendance', description: 'Attendance configuration, check-in/out and records' },
  { code: 'LEAVE', name: 'Leave', description: 'Leave types, balances, requests and approvals' },
  { code: 'TIMESHEET', name: 'Timesheet', description: 'Timesheet entry, submission and review' },
];

module.exports = {
  async up(queryInterface) {
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements }).then((r) => r[0]);
    const now = new Date();

    let [mod] = await q('SELECT id FROM modules WHERE code = :code', { code: MODULE.code });
    if (!mod) {
      mod = { id: randomUUID() };
      await queryInterface.bulkInsert('modules', [{
        id: mod.id, ...MODULE, status: 'active', created_at: now, updated_at: now,
      }]);
    }

    const submoduleIds = [];
    for (const sub of SUBMODULES) {
      let [row] = await q('SELECT id FROM submodules WHERE module_id = :moduleId AND code = :code', { moduleId: mod.id, code: sub.code });
      if (!row) {
        row = { id: randomUUID() };
        await queryInterface.bulkInsert('submodules', [{
          id: row.id, module_id: mod.id, ...sub, status: 'active', created_at: now, updated_at: now,
        }]);
      }
      submoduleIds.push(row.id);
    }

    // Until now no service checked entitlements, so every organization could
    // use all of HRMS. Attach the catalog to every existing plan so turning
    // enforcement on does not take access away from current customers.
    const plans = await q('SELECT id FROM plans');
    for (const plan of plans) {
      const [hasModule] = await q('SELECT id FROM plan_modules WHERE plan_id = :planId AND module_id = :moduleId', { planId: plan.id, moduleId: mod.id });
      if (!hasModule) {
        await queryInterface.bulkInsert('plan_modules', [{ id: randomUUID(), plan_id: plan.id, module_id: mod.id, created_at: now }]);
      }
      for (const submoduleId of submoduleIds) {
        const [hasSub] = await q('SELECT id FROM plan_submodules WHERE plan_id = :planId AND submodule_id = :submoduleId', { planId: plan.id, submoduleId });
        if (!hasSub) {
          await queryInterface.bulkInsert('plan_submodules', [{ id: randomUUID(), plan_id: plan.id, submodule_id: submoduleId, created_at: now }]);
        }
      }
    }
  },

  // Plans may have been edited since; removing catalog rows would silently
  // revoke access, so the rollback intentionally leaves data in place.
  async down() {},
};
