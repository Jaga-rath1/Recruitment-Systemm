'use strict';

const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE name = 'service_manager' LIMIT 1"
    );
    if (existing.length) return;
    const now = new Date();
    await queryInterface.bulkInsert('roles', [{
      id: randomUUID(),
      name: 'service_manager',
      description: 'Organization Service Manager with helpdesk operational management authority',
      created_at: now,
      updated_at: now,
    }]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('roles', { name: 'service_manager' });
  },
};

