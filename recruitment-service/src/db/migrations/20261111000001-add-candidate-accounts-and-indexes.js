'use strict';

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS "candidate_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(180) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "candidate_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "candidate_accounts_email_key" ON "candidate_accounts"("email");
CREATE INDEX IF NOT EXISTS "applications_org_created_idx" ON "applications"("organisation_id", "created_at");
CREATE INDEX IF NOT EXISTS "interviews_org_scheduled_idx" ON "interviews"("organisation_id", "scheduled_at");
CREATE INDEX IF NOT EXISTS "jobs_org_status_idx" ON "jobs"("organisation_id", "status");
`;

module.exports = {
  MIGRATION_SQL,

  async up(queryInterface) {
    await queryInterface.sequelize.query(MIGRATION_SQL);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "jobs_org_status_idx";
      DROP INDEX IF EXISTS "interviews_org_scheduled_idx";
      DROP INDEX IF EXISTS "applications_org_created_idx";
      DROP INDEX IF EXISTS "candidate_accounts_email_key";
      DROP TABLE IF EXISTS "candidate_accounts";
    `);
  }
};

