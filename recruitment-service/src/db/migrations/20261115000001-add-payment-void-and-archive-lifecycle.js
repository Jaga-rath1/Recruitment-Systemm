'use strict';

const MIGRATION_SQL = `
DO $$ BEGIN
  ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'VOIDED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "voided_by" UUID;
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "void_reason" TEXT;

CREATE INDEX IF NOT EXISTS "subscription_payments_status_idx" ON "subscription_payments"("status");
CREATE INDEX IF NOT EXISTS "subscription_payments_created_at_idx" ON "subscription_payments"("created_at");
`;

module.exports = {
  MIGRATION_SQL,

  async up(queryInterface) {
    await queryInterface.sequelize.query(MIGRATION_SQL);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "subscription_payments_created_at_idx";
      DROP INDEX IF EXISTS "subscription_payments_status_idx";
      ALTER TABLE "subscription_payments" DROP COLUMN IF EXISTS "void_reason";
      ALTER TABLE "subscription_payments" DROP COLUMN IF EXISTS "voided_at";
      ALTER TABLE "subscription_payments" DROP COLUMN IF EXISTS "voided_by";
    `);
  }
};
