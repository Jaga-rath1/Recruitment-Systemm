# NEXNUV Recruitment — System Architecture

## 1. Architectural Vision
NEXNUV Recruitment is an independent, multi-tenant, stateless enterprise SaaS recruitment microservice (`recruitment-service`, running on **Port `4007`**) paired with a React single-page application (`client`, running on **Port `5173`**).

It is engineered to:
1. Run independently during local development and automated testing (`INTEGRATION_MODE=standalone`).
2. Integrate seamlessly over synchronous REST HTTP contracts (`INTEGRATION_MODE=live`) with all six shared NEXNUV microservices without modifying them or querying external databases directly:
   - **API Gateway** (`4000`)
   - **Auth Service** (`4001`)
   - **Platform Service** (`4002`)
   - **Organization Service** (`4003`)
   - **Employee Service** (`4004`)
   - **Notification Service** (`4006`)
3. Operate with **zero message brokers** (no RabbitMQ, BullMQ, Kafka, or Redis queues). All cross-service notifications and upstream lookups use centralized HTTP REST calls (`src/integrations/common/httpClient.js`) with explicit timeouts, safe idempotent `GET` retries only, correlation `X-Request-Id` forwarding, and sensitive-data log redaction.

## 2. Backend Layering (`recruitment-service`)
Every feature module strictly follows:
```text
HTTP Request (Direct Port 4007 or API Gateway Port 4000)
  → Security Headers / Request ID / Pino Structured Logger (Redacted) / Rate Limiter
  → Express Router (Zod Validation + Auth Verification + Tenant Isolation + RBAC)
  → Controller (HTTP request/response marshaling only)
  → Service (Business rules, state machines, Sequelize transactions, idempotency, adapter calls, audit logs)
  → Repository (Parameterized Sequelize/PostgreSQL queries scoped by organisation_id)
  → Neon PostgreSQL (Dedicated recruitment database with UUID PKs, FKs, & migrations)
```

## 3. Multi-Tenant Isolation & Identity Verification Model
- **Zero Shared `JWT_SECRET` Assumption**: In `INTEGRATION_MODE=live`, incoming Organisation User & Platform Admin tokens are verified directly against Auth Service (`GET /api/v1/auth/me`), or via trusted API Gateway context (`x-internal-token` verified in [gateway.config.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/gateway/gateway.config.js) + `GET /api/v1/auth/internal/accounts/:id`).
- **Organisation Status & Subscription Gate**: [tenantIsolation.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/tenantIsolation.js) enforces:
  1. Verified tenant `organisationId` from authenticated identity (never trusting mismatched headers, params, or body fields).
  2. Live organisation activation check via Organization Service (`4003`).
  3. Live active subscription / entitlement verification via Platform Service (`4002`) plus local `subscriptions` ledger check.
- **Employee Access & Activation Alignment**: [rbac.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/rbac.js) verifies active Employee Service status (`4004`) alongside Recruitment-specific RBAC roles (`employee_role_assignments`).
- **Identity Deduplication & Candidate Portal Isolation**: [employee.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/employee/employee.adapter.js) and [auth.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/auth/auth.adapter.js) deduplicate existing organisation employees and Auth users (with concurrent `409` race recovery and cross-organisation linking prevention `CROSS_ORG_AUTH_CONFLICT`), while structurally malformed tokens reject locally (`401`). External Careers applicants register/authenticate via rate-limited `/api/v1/auth/candidate/*` ([candidateIdentity.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateIdentity.service.js)) with mandatory CSPRNG 6-digit OTP email verification (`EMAIL_PROVIDER=RESEND|BREVO|SMTP` via [email.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/email/email.adapter.js)), keyed HMAC-SHA256 OTP & reset token storage, explicit org-scoped atomic application claims (`POST /api/v1/portal/claims` in [candidateClaim.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateClaim.service.js)), `tokenVersion` immediate session revocation, and strictly distinct `CANDIDATE_JWT_SECRET` (`aud: 'nexnuv-candidate-portal'`, `HS256`, live `isActive && emailVerified && tokenVersion` check), stripping all internal remarks and interviewer feedback. See [CANDIDATE_IDENTITY_SECURITY_AUDIT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/CANDIDATE_IDENTITY_SECURITY_AUDIT.md).
- **API Gateway Route Separation**: Public careers/apply/download routes, non-admin subscription endpoints, `/api/v1/auth/candidate/*`, and Candidate Portal (`/api/v1/portal/*`) require `stripTrustedHeaders` rather than Gateway Auth-Service JWT middleware when registered on `api-gateway` (`4000`), avoiding collisions with Auth Service's `/api/v1/auth` mount and `JWT_SECRET`.

## 4. Shared-Service Integration Adapters (`src/integrations/`)
| Module | Port | Purpose | Internal Auth & Contract |
|---|---|---|---|
| `common/httpClient.js` | — | Centralized REST transport | `AbortController` timeouts, safe GET-only retries, `x-internal-token`, `x-service-name`, `X-Request-Id`, normalized `AppError` / `503` mapping |
| `gateway/gateway.config.js` | `4000` | API Gateway compatibility | Validates `x-internal-token`, parses Gateway `x-user-*` / `x-organization-id`, maps shared roles, exports `/api/v1/gateway/manifest` |
| `auth/auth.adapter.js` | `4001` | Identity & session verification | `GET /api/v1/auth/me`, `/internal/accounts/:id`, `POST /api/v1/auth/login`, `/internal/provision-agent`, `/provision`, `/setup-password`, `PATCH /users/:id/status` |
| `platform/platform.adapter.js` | `4002` | Subscriptions & entitlements | `GET /api/v1/platform/plans`, `/entitlements/organizations/:id`, `/organizations/:id/subscription`, `POST /api/v1/platform/subscriptions` |
| `organisation/organisation.adapter.js` | `4003` | Tenant metadata & active status | `GET /api/v1/organizations/:id`, `POST /api/v1/organizations`, `PATCH /api/v1/organizations/:id/status`, `/departments` |
| `employee/employee.adapter.js` | `4004` | Shared employee records & status | `GET /api/v1/employees`, `/employees/:id`, `POST /api/v1/employees` |
| `notification/notification.adapter.js` | `4006` | Async-safe REST notifications | `POST /api/v1/notifications` with idempotency keys, delivery state taxonomy (`DELIVERED` / `ACCEPTED` / `PARTIAL_FAILURE` / `UNKNOWN` / `FAILED`), and non-fatal catch |
| `hrms/hrms.adapter.js` | Optional | HRMS job requisition sync | Configurable external `HRMS_SERVICE_URL`; standalone dev fixtures strictly isolated from `live` mode |
| `storage/storage.adapter.js` | `LOCAL_SECURE` / `CLOUDINARY` | Resumes, proofs, letters | Official `cloudinary` Node SDK authenticated client (`cloudinaryClient.js`, `type: 'authenticated'`, backend-only credentials, server-signed `private_download_url` proxying) + `LOCAL_SECURE`, synchronous ClamAV TCP scanner & quarantine (`malwareScanner.js`), live PostgreSQL record & `InterviewAssignment` download authorization, transaction-rollback orphan cleanup, magic-byte & multi-extension checks |

## 5. Production Guard & Scaling Guarantees
- **Startup & Readiness Guards**: `NODE_ENV=production` strictly requires `INTEGRATION_MODE=live`, `INTERNAL_SERVICE_TOKEN`, dedicated `CANDIDATE_JWT_SECRET` (distinct from `JWT_SECRET` & `INTERNAL_SERVICE_TOKEN`), `STORAGE_SIGNED_URL_SECRET`, validated `STORAGE_DRIVER` (`CLOUDINARY` or explicit `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true`, blocking incomplete Cloudinary config or unsupported drivers such as `S3_COMPATIBLE`), and `DATABASE_URL` (`env.js` & `db/config.js`). `GET /ready` in `live` mode checks Neon PostgreSQL plus mandatory upstream service health (`auth`, `platform`, `organisation`, `employee`) and returns `503` when any mandatory dependency is unreachable.
- **Query Optimization & Sanitization**: Grouped SQL counts (`COUNT(id) GROUP BY job_id`), batched unique `organisationId` resolution (`Promise.all`), composite indexes (`applications(organisation_id, created_at)`, `interviews(organisation_id, scheduled_at)`, `jobs(organisation_id, status)`), Sequelize transaction boundaries, pre-parse JSON prototype-key blocking (`validate.js`), and query-token log omission (`req.path`).

---

## Phase 4.5 Final Security & Production Readiness Alignment (2026-11-12)
- Fixed Vite dev `/api` proxy target in [vite.config.js](file:///c:/Users/rathj/NEXNUV-Recruitment/client/vite.config.js) (`4005` -> `4007`).
- Added `CANDIDATE_TOKEN_HASH_SECRET` and transactional `EMAIL_PROVIDER` / SMTP / Resend / Brevo env variables to [docker-compose.yml](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/docker-compose.yml), and added service-level `.dockerignore` files ([recruitment-service/.dockerignore](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/.dockerignore), [client/.dockerignore](file:///c:/Users/rathj/NEXNUV-Recruitment/client/.dockerignore)).
- Verified post-edit results: `40/40` backend Vitest tests, `18/18` frontend Vitest tests, `2159` module Vite build, `5/5` Neon migrations `up`, live `/health` (`200`) + `/ready` (`503 not_ready` when offline), and `8/8` production fail-fast guards. See [PHASE_4_5_FINAL_SECURITY_AUDIT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/PHASE_4_5_FINAL_SECURITY_AUDIT.md) and [FINAL_PRODUCTION_READINESS_REPORT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/FINAL_PRODUCTION_READINESS_REPORT.md).
