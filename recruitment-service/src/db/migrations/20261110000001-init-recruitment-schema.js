'use strict';

const INIT_SQL = `
-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('SUBMITTED', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "JobSourceType" AS ENUM ('HRMS', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ScreeningStatus" AS ENUM ('PENDING', 'SHORTLISTED', 'REJECTED', 'ON_HOLD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ApplicationStage" AS ENUM ('APPLIED', 'SCREENING', 'TECHNICAL_INTERVIEW', 'MANAGERIAL_INTERVIEW', 'FINAL_SELECTION', 'OFFER_PROCESSING', 'OFFER_ACCEPTED', 'JOINING', 'HIRED', 'REJECTED', 'ON_HOLD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ApplicationDocumentType" AS ENUM ('RESUME', 'COVER_LETTER', 'PORTFOLIO', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InterviewRoundType" AS ENUM ('TECHNICAL', 'MANAGERIAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MeetingMode" AS ENUM ('VIDEO', 'IN_PERSON', 'PHONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InterviewerRoleType" AS ENUM ('TECHNICAL_INTERVIEWER', 'SENIOR_INTERVIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'COMPLETED', 'REASSIGNED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InterviewRecommendation" AS ENUM ('SELECTED', 'REJECTED', 'ON_HOLD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OfferDocumentType" AS ENUM ('OFFER_LETTER', 'SIGNED_OFFER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "JoiningStatus" AS ENUM ('INITIATED', 'LETTER_SENT', 'CONFIRMED', 'JOINED', 'NO_SHOW', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID,
    "organisation_name" VARCHAR(200) NOT NULL,
    "organisation_domain" VARCHAR(255) NOT NULL,
    "industry" VARCHAR(120) NOT NULL,
    "company_size" VARCHAR(60) NOT NULL,
    "admin_name" VARCHAR(160) NOT NULL,
    "admin_email" VARCHAR(255) NOT NULL,
    "plan_code" VARCHAR(80) NOT NULL DEFAULT 'RECRUITMENT_PREMIUM',
    "billing_cycle" VARCHAR(30) NOT NULL DEFAULT 'ANNUAL',
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "payment_instructions" JSONB NOT NULL,
    "activation_token_hash" VARCHAR(128),
    "activation_expires_at" TIMESTAMPTZ(6),
    "activated_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejected_reason" TEXT,
    "starts_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "idempotency_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "payment_reference" VARCHAR(160) NOT NULL,
    "payment_method" VARCHAR(60) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "proof_file_key" VARCHAR(500),
    "proof_file_name" VARCHAR(255),
    "proof_mime_type" VARCHAR(120),
    "submitted_by_email" VARCHAR(255) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "notes" TEXT,
    "idempotency_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recruitment_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recruitment_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recruitment_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "module" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recruitment_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recruitment_role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recruitment_role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_role_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "auth_user_id" UUID,
    "role_id" UUID NOT NULL,
    "custom_permissions" JSONB NOT NULL DEFAULT '[]',
    "revoked_permissions" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_by" UUID,
    "deactivated_by" UUID,
    "deactivated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "source_type" "JobSourceType" NOT NULL,
    "external_hrms_job_id" VARCHAR(120),
    "raw_payload" JSONB,
    "last_synced_at" TIMESTAMPTZ(6),
    "sync_status" VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "job_source_id" UUID NOT NULL,
    "source_type" "JobSourceType" NOT NULL,
    "hrms_job_id" VARCHAR(120),
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "department" VARCHAR(120) NOT NULL,
    "skills" JSONB NOT NULL DEFAULT '[]',
    "experience_min_years" INTEGER NOT NULL DEFAULT 0,
    "experience_max_years" INTEGER,
    "experience_label" VARCHAR(80) NOT NULL,
    "salary_min" INTEGER,
    "salary_max" INTEGER,
    "salary_currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "salary_display" VARCHAR(120) NOT NULL,
    "location" VARCHAR(160) NOT NULL,
    "employment_type" VARCHAR(60) NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "application_deadline" TIMESTAMPTZ(6),
    "hrms_job_status" VARCHAR(60),
    "recruitment_config" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(6),
    "unpublished_by" UUID,
    "unpublished_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_publications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "auth_user_id" UUID,
    "full_name" VARCHAR(180) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "mobile_number" VARCHAR(40) NOT NULL,
    "location" VARCHAR(160) NOT NULL,
    "total_experience_years" DOUBLE PRECISION NOT NULL,
    "current_company" VARCHAR(160),
    "current_salary" VARCHAR(80),
    "expected_salary" VARCHAR(80),
    "notice_period_days" INTEGER NOT NULL DEFAULT 0,
    "skills" JSONB NOT NULL DEFAULT '[]',
    "headline" VARCHAR(255),
    "linkedin_url" VARCHAR(300),
    "portfolio_url" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "application_reference" VARCHAR(60) NOT NULL,
    "cover_letter" TEXT,
    "screening_status" "ScreeningStatus" NOT NULL DEFAULT 'PENDING',
    "screening_notes" TEXT,
    "screened_by" UUID,
    "screened_at" TIMESTAMPTZ(6),
    "current_stage" "ApplicationStage" NOT NULL DEFAULT 'APPLIED',
    "final_decision_by" UUID,
    "final_decision_at" TIMESTAMPTZ(6),
    "final_decision_notes" TEXT,
    "source_channel" VARCHAR(60) NOT NULL DEFAULT 'CAREERS_PORTAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "application_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "document_type" "ApplicationDocumentType" NOT NULL DEFAULT 'RESUME',
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "storage_provider" VARCHAR(40) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "checksum_sha256" VARCHAR(128) NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "application_stage_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "from_stage" VARCHAR(60),
    "to_stage" VARCHAR(60) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "actor_user_id" UUID,
    "actor_role" VARCHAR(80),
    "internal_remark" TEXT,
    "candidate_visible_note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "application_stage_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "round_type" "InterviewRoundType" NOT NULL,
    "round_number" INTEGER NOT NULL DEFAULT 1,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "meeting_mode" "MeetingMode" NOT NULL DEFAULT 'VIDEO',
    "meeting_link_or_location" VARCHAR(500) NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_by" UUID NOT NULL,
    "reschedule_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interview_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "interviewer_employee_id" UUID NOT NULL,
    "interviewer_role" "InterviewerRoleType" NOT NULL,
    "assigned_by" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "interview_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interview_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "interviewer_employee_id" UUID NOT NULL,
    "round_type" "InterviewRoundType" NOT NULL,
    "overall_rating" INTEGER NOT NULL,
    "technical_skills_rating" INTEGER,
    "communication_rating" INTEGER,
    "behavioural_rating" INTEGER,
    "problem_solving_rating" INTEGER,
    "leadership_rating" INTEGER,
    "strengths" TEXT NOT NULL,
    "weaknesses" TEXT NOT NULL,
    "detailed_feedback" TEXT NOT NULL,
    "recommendation" "InterviewRecommendation" NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "interview_feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "offered_salary" INTEGER NOT NULL,
    "salary_currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "designation" VARCHAR(160) NOT NULL,
    "department" VARCHAR(120) NOT NULL,
    "joining_date" TIMESTAMPTZ(6) NOT NULL,
    "offer_valid_until" TIMESTAMPTZ(6) NOT NULL,
    "terms_summary" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "sent_by" UUID,
    "sent_at" TIMESTAMPTZ(6),
    "candidate_responded_at" TIMESTAMPTZ(6),
    "candidate_response_note" TEXT,
    "idempotency_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offer_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "document_type" "OfferDocumentType" NOT NULL DEFAULT 'OFFER_LETTER',
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "storage_provider" VARCHAR(40) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "offer_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "joining_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "expected_joining_date" TIMESTAMPTZ(6) NOT NULL,
    "actual_joining_date" TIMESTAMPTZ(6),
    "joining_location" VARCHAR(200) NOT NULL,
    "reporting_manager" VARCHAR(160),
    "onboarding_notes" TEXT,
    "joining_letter_file_name" VARCHAR(255),
    "joining_letter_mime_type" VARCHAR(120),
    "joining_letter_storage_key" VARCHAR(500),
    "status" "JoiningStatus" NOT NULL DEFAULT 'INITIATED',
    "initiated_by" UUID NOT NULL,
    "confirmed_by" UUID,
    "hired_at" TIMESTAMPTZ(6),
    "idempotency_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "joining_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recruitment_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID,
    "actor_user_id" UUID,
    "actor_employee_id" UUID,
    "actor_role" VARCHAR(80),
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(120),
    "action" VARCHAR(120) NOT NULL,
    "request_id" VARCHAR(120),
    "ip_address" VARCHAR(80),
    "user_agent" VARCHAR(400),
    "before_state" JSONB,
    "after_state" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recruitment_audit_logs_pkey" PRIMARY KEY ("id")
);

-- Indexes & Uniques
CREATE UNIQUE INDEX "subscriptions_activation_token_hash_key" ON "subscriptions"("activation_token_hash");
CREATE UNIQUE INDEX "subscriptions_idempotency_key_key" ON "subscriptions"("idempotency_key");
CREATE INDEX "subscriptions_organisation_id_idx" ON "subscriptions"("organisation_id");
CREATE INDEX "subscriptions_admin_email_idx" ON "subscriptions"("admin_email");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

CREATE UNIQUE INDEX "subscription_payments_payment_reference_key" ON "subscription_payments"("payment_reference");
CREATE UNIQUE INDEX "subscription_payments_idempotency_key_key" ON "subscription_payments"("idempotency_key");
CREATE INDEX "subscription_payments_subscription_id_idx" ON "subscription_payments"("subscription_id");
CREATE INDEX "subscription_payments_status_idx" ON "subscription_payments"("status");

CREATE INDEX "recruitment_roles_organisation_id_idx" ON "recruitment_roles"("organisation_id");
CREATE UNIQUE INDEX "recruitment_roles_organisation_id_code_key" ON "recruitment_roles"("organisation_id", "code");

CREATE UNIQUE INDEX "recruitment_permissions_code_key" ON "recruitment_permissions"("code");
CREATE INDEX "recruitment_permissions_module_idx" ON "recruitment_permissions"("module");

CREATE INDEX "recruitment_role_permissions_organisation_id_idx" ON "recruitment_role_permissions"("organisation_id");
CREATE UNIQUE INDEX "recruitment_role_permissions_role_id_permission_id_key" ON "recruitment_role_permissions"("role_id", "permission_id");

CREATE INDEX "employee_role_assignments_organisation_id_is_active_idx" ON "employee_role_assignments"("organisation_id", "is_active");
CREATE INDEX "employee_role_assignments_auth_user_id_idx" ON "employee_role_assignments"("auth_user_id");
CREATE UNIQUE INDEX "employee_role_assignments_organisation_id_employee_id_key" ON "employee_role_assignments"("organisation_id", "employee_id");

CREATE INDEX "job_sources_organisation_id_idx" ON "job_sources"("organisation_id");
CREATE UNIQUE INDEX "job_sources_organisation_id_source_type_external_hrms_job_i_key" ON "job_sources"("organisation_id", "source_type", "external_hrms_job_id");

CREATE INDEX "jobs_organisation_id_status_idx" ON "jobs"("organisation_id", "status");
CREATE INDEX "jobs_organisation_id_source_type_idx" ON "jobs"("organisation_id", "source_type");
CREATE INDEX "jobs_hrms_job_id_idx" ON "jobs"("hrms_job_id");

CREATE UNIQUE INDEX "job_publications_job_id_key" ON "job_publications"("job_id");
CREATE UNIQUE INDEX "job_publications_slug_key" ON "job_publications"("slug");
CREATE INDEX "job_publications_organisation_id_is_public_idx" ON "job_publications"("organisation_id", "is_public");

CREATE INDEX "candidates_organisation_id_idx" ON "candidates"("organisation_id");
CREATE INDEX "candidates_auth_user_id_idx" ON "candidates"("auth_user_id");
CREATE INDEX "candidates_email_idx" ON "candidates"("email");
CREATE UNIQUE INDEX "candidates_organisation_id_email_key" ON "candidates"("organisation_id", "email");

CREATE UNIQUE INDEX "applications_application_reference_key" ON "applications"("application_reference");
CREATE INDEX "applications_organisation_id_current_stage_idx" ON "applications"("organisation_id", "current_stage");
CREATE INDEX "applications_organisation_id_screening_status_idx" ON "applications"("organisation_id", "screening_status");
CREATE INDEX "applications_candidate_id_idx" ON "applications"("candidate_id");
CREATE UNIQUE INDEX "applications_job_id_candidate_id_key" ON "applications"("job_id", "candidate_id");

CREATE UNIQUE INDEX "application_documents_storage_key_key" ON "application_documents"("storage_key");
CREATE INDEX "application_documents_organisation_id_application_id_idx" ON "application_documents"("organisation_id", "application_id");

CREATE INDEX "application_stage_history_organisation_id_application_id_cr_idx" ON "application_stage_history"("organisation_id", "application_id", "created_at");

CREATE INDEX "interviews_organisation_id_round_type_status_idx" ON "interviews"("organisation_id", "round_type", "status");
CREATE INDEX "interviews_application_id_idx" ON "interviews"("application_id");

CREATE INDEX "interview_assignments_organisation_id_interviewer_employee__idx" ON "interview_assignments"("organisation_id", "interviewer_employee_id");
CREATE UNIQUE INDEX "interview_assignments_interview_id_interviewer_employee_id_key" ON "interview_assignments"("interview_id", "interviewer_employee_id");

CREATE INDEX "interview_feedback_organisation_id_application_id_idx" ON "interview_feedback"("organisation_id", "application_id");
CREATE UNIQUE INDEX "interview_feedback_interview_id_interviewer_employee_id_key" ON "interview_feedback"("interview_id", "interviewer_employee_id");

CREATE UNIQUE INDEX "offers_application_id_key" ON "offers"("application_id");
CREATE UNIQUE INDEX "offers_idempotency_key_key" ON "offers"("idempotency_key");
CREATE INDEX "offers_organisation_id_status_idx" ON "offers"("organisation_id", "status");

CREATE UNIQUE INDEX "offer_documents_storage_key_key" ON "offer_documents"("storage_key");
CREATE INDEX "offer_documents_organisation_id_offer_id_idx" ON "offer_documents"("organisation_id", "offer_id");

CREATE UNIQUE INDEX "joining_records_application_id_key" ON "joining_records"("application_id");
CREATE UNIQUE INDEX "joining_records_offer_id_key" ON "joining_records"("offer_id");
CREATE UNIQUE INDEX "joining_records_idempotency_key_key" ON "joining_records"("idempotency_key");
CREATE INDEX "joining_records_organisation_id_status_idx" ON "joining_records"("organisation_id", "status");

CREATE INDEX "recruitment_audit_logs_organisation_id_created_at_idx" ON "recruitment_audit_logs"("organisation_id", "created_at");
CREATE INDEX "recruitment_audit_logs_entity_type_entity_id_idx" ON "recruitment_audit_logs"("entity_type", "entity_id");

-- Foreign Keys
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_role_permissions" ADD CONSTRAINT "recruitment_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "recruitment_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recruitment_role_permissions" ADD CONSTRAINT "recruitment_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "recruitment_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_role_assignments" ADD CONSTRAINT "employee_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "recruitment_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_job_source_id_fkey" FOREIGN KEY ("job_source_id") REFERENCES "job_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "job_publications" ADD CONSTRAINT "job_publications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_assignments" ADD CONSTRAINT "interview_assignments_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offers" ADD CONSTRAINT "offers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offer_documents" ADD CONSTRAINT "offer_documents_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "joining_records" ADD CONSTRAINT "joining_records_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "joining_records" ADD CONSTRAINT "joining_records_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
`;

module.exports = {
  INIT_SQL,
  async up(queryInterface) {
    await queryInterface.sequelize.query(INIT_SQL);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS
        "recruitment_audit_logs",
        "joining_records",
        "offer_documents",
        "offers",
        "interview_feedback",
        "interview_assignments",
        "interviews",
        "application_stage_history",
        "application_documents",
        "applications",
        "candidates",
        "job_publications",
        "jobs",
        "job_sources",
        "employee_role_assignments",
        "recruitment_role_permissions",
        "recruitment_permissions",
        "recruitment_roles",
        "subscription_payments",
        "subscriptions"
      CASCADE;
    `);
  }
};

