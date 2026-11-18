'use strict';

const MIGRATION_SQL = `
ALTER TABLE "application_documents"
  ADD COLUMN IF NOT EXISTS "scan_status" VARCHAR(40) NOT NULL DEFAULT 'NOT_SCANNED',
  ADD COLUMN IF NOT EXISTS "scan_checked_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "scan_engine" VARCHAR(80);

ALTER TABLE "offer_documents"
  ADD COLUMN IF NOT EXISTS "checksum_sha256" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "scan_status" VARCHAR(40) NOT NULL DEFAULT 'NOT_SCANNED',
  ADD COLUMN IF NOT EXISTS "scan_checked_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "scan_engine" VARCHAR(80);

ALTER TABLE "joining_records"
  ADD COLUMN IF NOT EXISTS "joining_letter_checksum_sha256" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "joining_letter_scan_status" VARCHAR(40) NOT NULL DEFAULT 'NOT_SCANNED',
  ADD COLUMN IF NOT EXISTS "joining_letter_scan_checked_at" TIMESTAMPTZ(6);

ALTER TABLE "subscription_payments"
  ADD COLUMN IF NOT EXISTS "proof_checksum_sha256" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "proof_scan_status" VARCHAR(40) NOT NULL DEFAULT 'NOT_SCANNED',
  ADD COLUMN IF NOT EXISTS "proof_scan_checked_at" TIMESTAMPTZ(6);
`;

module.exports = {
  MIGRATION_SQL,

  async up(queryInterface) {
    await queryInterface.sequelize.query(MIGRATION_SQL);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "subscription_payments"
        DROP COLUMN IF EXISTS "proof_scan_checked_at",
        DROP COLUMN IF EXISTS "proof_scan_status",
        DROP COLUMN IF EXISTS "proof_checksum_sha256";

      ALTER TABLE "joining_records"
        DROP COLUMN IF EXISTS "joining_letter_scan_checked_at",
        DROP COLUMN IF EXISTS "joining_letter_scan_status",
        DROP COLUMN IF EXISTS "joining_letter_checksum_sha256";

      ALTER TABLE "offer_documents"
        DROP COLUMN IF EXISTS "scan_engine",
        DROP COLUMN IF EXISTS "scan_checked_at",
        DROP COLUMN IF EXISTS "scan_status",
        DROP COLUMN IF EXISTS "checksum_sha256";

      ALTER TABLE "application_documents"
        DROP COLUMN IF EXISTS "scan_engine",
        DROP COLUMN IF EXISTS "scan_checked_at",
        DROP COLUMN IF EXISTS "scan_status";
    `);
  }
};

