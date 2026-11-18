'use strict';

const MIGRATION_SQL = `
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIAL';

CREATE INDEX IF NOT EXISTS "subscriptions_org_domain_status_idx" ON "subscriptions"("organisation_domain", "status");
CREATE INDEX IF NOT EXISTS "subscriptions_admin_email_status_idx" ON "subscriptions"("admin_email", "status");
`;

module.exports = {
  MIGRATION_SQL,

  async up(queryInterface) {
    await queryInterface.sequelize.query(MIGRATION_SQL);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "subscriptions_admin_email_status_idx";
      DROP INDEX IF EXISTS "subscriptions_org_domain_status_idx";
    `);
  }
};
