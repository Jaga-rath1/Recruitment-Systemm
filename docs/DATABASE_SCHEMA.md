# NEXNUV Recruitment — Database Schema Documentation

Database Engine: **PostgreSQL 16+ / Neon Serverless PostgreSQL** (dedicated recruitment microservice database)  
ORM & Migrations: **Sequelize ORM (`sequelize` + `sequelize-cli`)** with SQL migrations in `recruitment-service/src/db/migrations/`  
Primary Keys: **UUID (`gen_random_uuid()`)** across all 20 tables  
Tenant Isolation: **`organisation_id` (UUID)** indexed on all tenant-owned tables

## Tables Summary

| # | Table | Purpose | Key Constraints & Indexes |
|---|---|---|---|
| 1 | `subscriptions` | Tracks SaaS subscription lifecycle (`PENDING_PAYMENT` → `PENDING_VERIFICATION` → `APPROVED` → `ACTIVE`, plus `REJECTED`/`EXPIRED`/`SUSPENDED`/`CANCELLED`) | PK `id`, unique `activation_token_hash`, unique `idempotency_key`, indexes on `organisation_id`, `admin_email`, `status` |
| 2 | `subscription_payments` | Separate payment proof & verification ledger preventing duplicate verification | PK `id`, FK `subscription_id`, unique `payment_reference`, unique `idempotency_key`, indexes on `subscription_id`, `status` |
| 3 | `recruitment_roles` | Tenant-scoped recruitment roles (`ORGANISATION_ADMIN`, `RECRUITER`, `TECHNICAL_INTERVIEWER`, `SENIOR_INTERVIEWER`, `CANDIDATE`, custom roles) | PK `id`, unique `(organisation_id, code)`, index `organisation_id` |
| 4 | `recruitment_permissions` | Canonical granular permission catalog across all modules | PK `id`, unique `code`, index `module` |
| 5 | `recruitment_role_permissions` | Maps roles to permissions within a tenant | PK `id`, FKs `role_id`, `permission_id`, unique `(role_id, permission_id)`, index `organisation_id` |
| 6 | `employee_role_assignments` | Links external Employee/Auth IDs to Recruitment roles, per-user permission overrides, and recruitment access status | PK `id`, FK `role_id`, unique `(organisation_id, employee_id)`, indexes `(organisation_id, is_active)`, `auth_user_id` |
| 7 | `job_sources` | Preserves raw HRMS job payloads & sync timestamps alongside manual job source records | PK `id`, unique `(organisation_id, source_type, external_hrms_job_id)`, index `organisation_id` |
| 8 | `jobs` | Unified job catalog (`HRMS` and `MANUAL`) with recruitment-specific configuration JSONB | PK `id`, FK `job_source_id`, indexes `(organisation_id, status)`, `(organisation_id, source_type)`, `hrms_job_id` |
| 9 | `job_publications` | Public Careers visibility state, SEO slug, publish/unpublish/close timestamps, view counters | PK `id`, unique FK `job_id`, unique `slug`, index `(organisation_id, is_public)` |
| 10 | `candidates` | Tenant-scoped candidate profiles linked optionally to Auth Service `auth_user_id` | PK `id`, unique `(organisation_id, email)`, indexes `organisation_id`, `auth_user_id`, `email` |
| 11 | `applications` | Candidate applications with screening status, current pipeline stage, and internal remarks | PK `id`, FKs `job_id`, `candidate_id`, unique `(job_id, candidate_id)` preventing duplicates, unique `application_reference` |
| 12 | `application_documents` | Metadata, SHA-256 checksums, and object storage keys for resumes & attachments | PK `id`, FKs `application_id`, `candidate_id`, unique `storage_key`, index `(organisation_id, application_id)` |
| 13 | `application_stage_history` | Immutable timeline separating internal remarks from candidate-visible notes | PK `id`, FK `application_id`, index `(organisation_id, application_id, created_at)` |
| 14 | `interviews` | Technical & Managerial interview rounds, schedules, meeting modes, reschedule audit | PK `id`, FK `application_id`, indexes `(organisation_id, round_type, status)`, `application_id` |
| 15 | `interview_assignments` | Assigns specific `TECHNICAL_INTERVIEWER` or `SENIOR_INTERVIEWER` employees to rounds | PK `id`, FK `interview_id`, unique `(interview_id, interviewer_employee_id)`, index `(organisation_id, interviewer_employee_id)` |
| 16 | `interview_feedback` | Structured 1–10 scorecards, strengths, weaknesses, recommendation (`SELECTED`/`REJECTED`/`ON_HOLD`) — strictly confidential from candidates | PK `id`, FKs `interview_id`, `application_id`, unique `(interview_id, interviewer_employee_id)` |
| 17 | `offers` | Compensation, designation, joining date, validity, status (`DRAFT`/`SENT`/`ACCEPTED`/`REJECTED`) | PK `id`, unique FK `application_id`, unique `idempotency_key`, index `(organisation_id, status)` |
| 18 | `offer_documents` | Object storage references for uploaded offer letters and signed offers | PK `id`, FK `offer_id`, unique `storage_key`, index `(organisation_id, offer_id)` |
| 19 | `joining_records` | Post-acceptance joining initiation, joining letter storage, confirmation, and `HIRED` timestamp | PK `id`, unique FKs `application_id`, `offer_id`, unique `idempotency_key`, index `(organisation_id, status)` |
| 20 | `recruitment_audit_logs` | Security and compliance audit trail with request ID, actor context, and before/after JSONB state | PK `id`, indexes `(organisation_id, created_at)`, `(entity_type, entity_id)` |

## Multi-Tenant & Shared Service Boundaries
- **No Shared DB Joins**: `employee_id`, `auth_user_id`, `organisation_id`, and `hrms_job_id` are stored as immutable UUID/string references without cross-database foreign keys.
- **Confidentiality Isolation**: `applications.screening_notes`, `applications.final_decision_notes`, `application_stage_history.internal_remark`, and the entire `interview_feedback` table are stripped at the repository/service boundary on all Candidate Portal endpoints.

