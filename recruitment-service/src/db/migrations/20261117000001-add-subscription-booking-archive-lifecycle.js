'use strict';

const MIGRATION_SQL = `
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "archived_by" UUID;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "archive_reason" TEXT;

CREATE INDEX IF NOT EXISTS "subscriptions_is_archived_idx" ON "subscriptions"("is_archived");
`;

module.exports = {
  MIGRATION_SQL,

  async up(queryInterface) {
    await queryInterface.sequelize.query(MIGRATION_SQL);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "subscriptions_is_archived_idx";
      ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "archive_reason";
      ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "archived_by";
      ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "archived_at";
      ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "is_archived";
    `);
  }
};
