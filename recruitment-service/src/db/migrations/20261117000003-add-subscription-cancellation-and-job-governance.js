'use strict';

/**
 * Migration: Add subscription cancellation and job governance metadata
 * - Adds cancelled_at, cancelled_by, cancellation_reason to subscriptions
 * - Adds is_discarded, discarded_at, discarded_by, discard_reason, unpublish_reason to jobs
 * - Adds unpublish_reason to job_publications
 * - Adds performance & governance indexes
 */

const MIGRATION_SQL = `
-- Subscription cancellation metadata
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancelled_by" UUID;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT;

-- Job soft-discard & unpublish metadata
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "is_discarded" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "discarded_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "discarded_by" UUID;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "discard_reason" TEXT;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "unpublish_reason" TEXT;

-- Job publication unpublish metadata
ALTER TABLE "job_publications" ADD COLUMN IF NOT EXISTS "unpublish_reason" TEXT;

-- Indexes for performance & governance queries
CREATE INDEX IF NOT EXISTS "subscriptions_cancelled_at_idx" ON "subscriptions"("cancelled_at");
CREATE INDEX IF NOT EXISTS "jobs_is_discarded_idx" ON "jobs"("is_discarded");
CREATE INDEX IF NOT EXISTS "jobs_organisation_status_idx" ON "jobs"("organisation_id", "status");
CREATE INDEX IF NOT EXISTS "jobs_status_is_discarded_idx" ON "jobs"("status", "is_discarded");
`;

module.exports = {
  MIGRATION_SQL,

  async up(queryInterface) {
    await queryInterface.sequelize.query(MIGRATION_SQL);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "jobs_status_is_discarded_idx";
      DROP INDEX IF EXISTS "jobs_organisation_status_idx";
      DROP INDEX IF EXISTS "jobs_is_discarded_idx";
      DROP INDEX IF EXISTS "subscriptions_cancelled_at_idx";

      ALTER TABLE "job_publications" DROP COLUMN IF EXISTS "unpublish_reason";

      ALTER TABLE "jobs" DROP COLUMN IF EXISTS "unpublish_reason";
      ALTER TABLE "jobs" DROP COLUMN IF EXISTS "discard_reason";
      ALTER TABLE "jobs" DROP COLUMN IF EXISTS "discarded_by";
      ALTER TABLE "jobs" DROP COLUMN IF EXISTS "discarded_at";
      ALTER TABLE "jobs" DROP COLUMN IF EXISTS "is_discarded";

      ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "cancellation_reason";
      ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "cancelled_by";
      ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "cancelled_at";
    `);
  }
};
