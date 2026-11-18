'use strict';

const { randomUUID } = require('crypto');

const DEFAULT_ROLES = [
  { id: randomUUID(), name: 'super_admin', description: 'Full system access' },
  { id: randomUUID(), name: 'org_admin', description: 'Full access within an organization' },
  { id: randomUUID(), name: 'manager', description: 'Department and team management access' },
  { id: randomUUID(), name: 'employee', description: 'Basic employee access' },
];

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    await queryInterface.bulkInsert('roles', DEFAULT_ROLES.map((r) => ({
      ...r,
      created_at: now,
      updated_at: now,
    })));
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('roles', {
      name: DEFAULT_ROLES.map((r) => r.name),
    });
  },
};
