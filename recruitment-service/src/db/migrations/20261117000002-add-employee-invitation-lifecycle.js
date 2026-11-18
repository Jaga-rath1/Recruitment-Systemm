'use strict';

const MIGRATION_SQL = `
ALTER TABLE "employee_role_assignments" ADD COLUMN IF NOT EXISTS "invitation_status" VARCHAR(50) NOT NULL DEFAULT 'EMPLOYEE_CREATED';
ALTER TABLE "employee_role_assignments" ADD COLUMN IF NOT EXISTS "invitation_token_hash" VARCHAR(64);
ALTER TABLE "employee_role_assignments" ADD COLUMN IF NOT EXISTS "invitation_expires_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "employee_role_assignments" ADD COLUMN IF NOT EXISTS "invitation_sent_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "employee_role_assignments" ADD COLUMN IF NOT EXISTS "invitation_delivery_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING';
ALTER TABLE "employee_role_assignments" ADD COLUMN IF NOT EXISTS "invitation_error" TEXT;
ALTER TABLE "employee_role_assignments" ADD COLUMN IF NOT EXISTS "invitation_resend_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "employee_role_assignments" ADD COLUMN IF NOT EXISTS "account_activated_at" TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS "employee_role_assignments_inv_token_hash_idx" ON "employee_role_assignments"("invitation_token_hash");
CREATE INDEX IF NOT EXISTS "employee_role_assignments_inv_status_idx" ON "employee_role_assignments"("invitation_status");
`;

module.exports = {
  MIGRATION_SQL,

  async up(queryInterface) {
    await queryInterface.sequelize.query(MIGRATION_SQL);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "employee_role_assignments_inv_status_idx";
      DROP INDEX IF EXISTS "employee_role_assignments_inv_token_hash_idx";
      ALTER TABLE "employee_role_assignments" DROP COLUMN IF EXISTS "account_activated_at";
      ALTER TABLE "employee_role_assignments" DROP COLUMN IF EXISTS "invitation_resend_count";
      ALTER TABLE "employee_role_assignments" DROP COLUMN IF EXISTS "invitation_error";
      ALTER TABLE "employee_role_assignments" DROP COLUMN IF EXISTS "invitation_delivery_status";
      ALTER TABLE "employee_role_assignments" DROP COLUMN IF EXISTS "invitation_sent_at";
      ALTER TABLE "employee_role_assignments" DROP COLUMN IF EXISTS "invitation_expires_at";
      ALTER TABLE "employee_role_assignments" DROP COLUMN IF EXISTS "invitation_token_hash";
      ALTER TABLE "employee_role_assignments" DROP COLUMN IF EXISTS "invitation_status";
    `);
  }
};
