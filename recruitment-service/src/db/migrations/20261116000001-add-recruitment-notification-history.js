'use strict';

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS "recruitment_notification_history" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "notification_id" VARCHAR(128) NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "category" VARCHAR(100) NOT NULL DEFAULT 'RECRUITMENT',
  "recipient_email" VARCHAR(255) NOT NULL,
  "recipient_name" VARCHAR(255),
  "recipient_type" VARCHAR(50) NOT NULL DEFAULT 'ORGANISATION_ADMIN',
  "organisation_id" UUID,
  "organisation_name" VARCHAR(255),
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "delivery_status" VARCHAR(50) NOT NULL DEFAULT 'ACCEPTED',
  "provider" VARCHAR(50) NOT NULL DEFAULT 'STANDALONE',
  "provider_message_id" VARCHAR(255),
  "delivery_error" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_by" UUID,
  "deleted_at" TIMESTAMP WITH TIME ZONE,
  "delete_reason" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "recruitment_notification_history_notif_id_idx" 
  ON "recruitment_notification_history"("notification_id");

CREATE INDEX IF NOT EXISTS "recruitment_notification_history_event_type_idx" 
  ON "recruitment_notification_history"("event_type");

CREATE INDEX IF NOT EXISTS "recruitment_notification_history_recipient_email_idx" 
  ON "recruitment_notification_history"("recipient_email");

CREATE INDEX IF NOT EXISTS "recruitment_notification_history_organisation_id_idx" 
  ON "recruitment_notification_history"("organisation_id");

CREATE INDEX IF NOT EXISTS "recruitment_notification_history_delivery_status_idx" 
  ON "recruitment_notification_history"("delivery_status");

CREATE INDEX IF NOT EXISTS "recruitment_notification_history_created_at_idx" 
  ON "recruitment_notification_history"("created_at");

CREATE INDEX IF NOT EXISTS "recruitment_notification_history_is_deleted_idx" 
  ON "recruitment_notification_history"("is_deleted");
`;

module.exports = {
  MIGRATION_SQL,

  async up(queryInterface) {
    await queryInterface.sequelize.query(MIGRATION_SQL);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS "recruitment_notification_history";
    `);
  }
};
