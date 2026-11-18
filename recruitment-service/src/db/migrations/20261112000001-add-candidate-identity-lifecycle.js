const MIGRATION_SQL = `
ALTER TABLE "candidate_accounts"
  ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "verification_token_hash" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "verification_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "verification_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "verification_locked_until" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "verification_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "reset_token_hash" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "reset_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "reset_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reset_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "last_security_event_at" TIMESTAMPTZ(6);

ALTER TABLE "candidates"
  ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMPTZ(6);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "candidate_accounts"
    GROUP BY LOWER(TRIM("email"))
    HAVING COUNT(*) > 1
  ) THEN
    UPDATE "candidate_accounts"
    SET "email" = LOWER(TRIM("email"))
    WHERE "email" <> LOWER(TRIM("email"));

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'candidate_accounts_email_lower_uq'
    ) THEN
      CREATE UNIQUE INDEX "candidate_accounts_email_lower_uq"
      ON "candidate_accounts" (LOWER("email"));
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "candidate_accounts_verification_token_hash_idx"
  ON "candidate_accounts" ("verification_token_hash")
  WHERE "verification_token_hash" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "candidate_accounts_reset_token_hash_idx"
  ON "candidate_accounts" ("reset_token_hash")
  WHERE "reset_token_hash" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "candidates_org_email_lower_idx"
  ON "candidates" ("organisation_id", LOWER("email"));

CREATE INDEX IF NOT EXISTS "recruitment_audit_logs_entity_created_idx"
  ON "recruitment_audit_logs" ("entity_type", "entity_id", "created_at");
`;

module.exports = {
  MIGRATION_SQL,

  async up(queryInterface) {
    await queryInterface.sequelize.query(MIGRATION_SQL);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "recruitment_audit_logs_entity_created_idx";
      DROP INDEX IF EXISTS "candidates_org_email_lower_idx";
      DROP INDEX IF EXISTS "candidate_accounts_reset_token_hash_idx";
      DROP INDEX IF EXISTS "candidate_accounts_verification_token_hash_idx";
      DROP INDEX IF EXISTS "candidate_accounts_email_lower_uq";

      ALTER TABLE "candidates"
        DROP COLUMN IF EXISTS "claimed_at";

      ALTER TABLE "candidate_accounts"
        DROP COLUMN IF EXISTS "last_security_event_at",
        DROP COLUMN IF EXISTS "last_login_at",
        DROP COLUMN IF EXISTS "locked_until",
        DROP COLUMN IF EXISTS "failed_login_attempts",
        DROP COLUMN IF EXISTS "token_version",
        DROP COLUMN IF EXISTS "password_changed_at",
        DROP COLUMN IF EXISTS "reset_sent_at",
        DROP COLUMN IF EXISTS "reset_attempts",
        DROP COLUMN IF EXISTS "reset_expires_at",
        DROP COLUMN IF EXISTS "reset_token_hash",
        DROP COLUMN IF EXISTS "verification_sent_at",
        DROP COLUMN IF EXISTS "verification_locked_until",
        DROP COLUMN IF EXISTS "verification_attempts",
        DROP COLUMN IF EXISTS "verification_expires_at",
        DROP COLUMN IF EXISTS "verification_token_hash",
        DROP COLUMN IF EXISTS "email_verified_at",
        DROP COLUMN IF EXISTS "email_verified";
    `);
  }
};

