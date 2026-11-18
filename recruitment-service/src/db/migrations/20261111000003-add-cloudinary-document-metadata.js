'use strict';

const MIGRATION_SQL = `
ALTER TABLE "application_documents"
  ADD COLUMN IF NOT EXISTS "cloudinary_public_id" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "cloudinary_resource_type" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "cloudinary_format" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "cloudinary_version" VARCHAR(60),
  ADD COLUMN IF NOT EXISTS "storage_visibility" VARCHAR(30) NOT NULL DEFAULT 'AUTHENTICATED';

ALTER TABLE "offer_documents"
  ADD COLUMN IF NOT EXISTS "cloudinary_public_id" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "cloudinary_resource_type" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "cloudinary_format" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "cloudinary_version" VARCHAR(60),
  ADD COLUMN IF NOT EXISTS "storage_visibility" VARCHAR(30) NOT NULL DEFAULT 'AUTHENTICATED';

ALTER TABLE "joining_records"
  ADD COLUMN IF NOT EXISTS "joining_letter_file_size_bytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "joining_letter_storage_provider" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "joining_letter_cloudinary_public_id" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "joining_letter_cloudinary_resource_type" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "joining_letter_cloudinary_format" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "joining_letter_cloudinary_version" VARCHAR(60),
  ADD COLUMN IF NOT EXISTS "joining_letter_visibility" VARCHAR(30) NOT NULL DEFAULT 'AUTHENTICATED';

ALTER TABLE "subscription_payments"
  ADD COLUMN IF NOT EXISTS "proof_file_size_bytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "proof_storage_provider" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "proof_cloudinary_public_id" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "proof_cloudinary_resource_type" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "proof_cloudinary_format" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "proof_cloudinary_version" VARCHAR(60),
  ADD COLUMN IF NOT EXISTS "proof_visibility" VARCHAR(30) NOT NULL DEFAULT 'AUTHENTICATED';
`;

module.exports = {
  MIGRATION_SQL,

  async up(queryInterface) {
    await queryInterface.sequelize.query(MIGRATION_SQL);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "subscription_payments"
        DROP COLUMN IF EXISTS "proof_visibility",
        DROP COLUMN IF EXISTS "proof_cloudinary_version",
        DROP COLUMN IF EXISTS "proof_cloudinary_format",
        DROP COLUMN IF EXISTS "proof_cloudinary_resource_type",
        DROP COLUMN IF EXISTS "proof_cloudinary_public_id",
        DROP COLUMN IF EXISTS "proof_storage_provider",
        DROP COLUMN IF EXISTS "proof_file_size_bytes";

      ALTER TABLE "joining_records"
        DROP COLUMN IF EXISTS "joining_letter_visibility",
        DROP COLUMN IF EXISTS "joining_letter_cloudinary_version",
        DROP COLUMN IF EXISTS "joining_letter_cloudinary_format",
        DROP COLUMN IF EXISTS "joining_letter_cloudinary_resource_type",
        DROP COLUMN IF EXISTS "joining_letter_cloudinary_public_id",
        DROP COLUMN IF EXISTS "joining_letter_storage_provider",
        DROP COLUMN IF EXISTS "joining_letter_file_size_bytes";

      ALTER TABLE "offer_documents"
        DROP COLUMN IF EXISTS "storage_visibility",
        DROP COLUMN IF EXISTS "cloudinary_version",
        DROP COLUMN IF EXISTS "cloudinary_format",
        DROP COLUMN IF EXISTS "cloudinary_resource_type",
        DROP COLUMN IF EXISTS "cloudinary_public_id";

      ALTER TABLE "application_documents"
        DROP COLUMN IF EXISTS "storage_visibility",
        DROP COLUMN IF EXISTS "cloudinary_version",
        DROP COLUMN IF EXISTS "cloudinary_format",
        DROP COLUMN IF EXISTS "cloudinary_resource_type",
        DROP COLUMN IF EXISTS "cloudinary_public_id";
    `);
  }
};

