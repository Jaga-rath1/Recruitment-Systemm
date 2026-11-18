'use strict';

const MIGRATION_SQL = `
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "provisioning_status" VARCHAR(40) NOT NULL DEFAULT 'PENDING';
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "provisioning_error" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "invitation_sent_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "invitation_resend_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "subscriptions_provisioning_status_idx" ON "subscriptions"("provisioning_status");
`;

module.exports = {
  MIGRATION_SQL,

  async up(queryInterface) {
    await queryInterface.sequelize.query(MIGRATION_SQL);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "subscriptions_provisioning_status_idx";
      ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "invitation_resend_count";
      ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "invitation_sent_at";
      ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "provisioning_error";
      ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "provisioning_status";
    `);
  }
};
