# NEXNUV Recruitment — Phase 4 Production Readiness Report

**Report Date**: 2026-11-12  
**Target Service**: `nexnuv-recruitment-service` (`PORT 4007`) & `client` (`PORT 5173`)  
**Decision**: **B. CONDITIONALLY READY** *(Recruitment codebase passes its own audit and security regression suites through Phase 4.4; **BLOCKED / DO NOT DEPLOY FOR LIVE TRAFFIC** until mandatory external shared-service startup, API Gateway registration, live Cloudinary/ClamAV, and live transactional email provider credentials are configured and live-verified.)*

---

## 1. Architecture Audit Summary
- Recruitment maintains strict modular layering (`Routes → Controllers → Services → Repositories → Sequelize/PostgreSQL`) on its dedicated Neon PostgreSQL schema (`recruitment_service`, 21 models, 5 applied migrations through `20261112000001`).
- Zero message brokers exist (no RabbitMQ, BullMQ, Kafka, or Redis queues). All cross-service communication is synchronous REST over HTTP (`src/integrations/common/httpClient.js`).
- All six shared service repositories (`api-gateway`, `auth-service`, `platform-service`, `organization-service`, `employee-service`, `notification-service`) remained 100% unmodified (`LastWriteTime` verified `2026-11-10`).

## 2. Authentication Audit Findings
- **Verified**: In `INTEGRATION_MODE=live`, Org/Admin bearer tokens are verified remotely via `GET ${AUTH_SERVICE_URL}/api/v1/auth/me` (never assuming `JWT_SECRET`, `iss`, or `aud` are shared with Auth Service).
- **Verified**: Trusted API Gateway requests require constant-time `x-internal-token` validation (`gateway.config.js`), followed by live session check (`GET /api/v1/auth/internal/accounts/:id`). Spoofed internal headers are rejected (`401`).
- **Fixed**: Structurally invalid non-JWT tokens reject fast with `401` (`auth.adapter.js`); existing Org Auth users are resolved via `GET /api/v1/auth/internal/users` before invoking `/provision` (`409`-safe, zero duplicate Auth identities).

## 3. Candidate Identity Isolation Findings
- **Need Verified**: `auth-service` defines only 7 seeded roles (`super_admin`, `org_admin`, `service_manager`, `hr`, `manager`, `employee`, `agent`) and `ALLOW_BOOTSTRAP_REGISTRATION=false`; external public applicants have no shared Auth account type. Dedicated `candidate_accounts` (`CANDIDATE_JWT_SECRET` strictly distinct from `JWT_SECRET`, `iss: nexnuv-recruitment-candidate`, `aud: nexnuv-candidate-portal`, pinned `HS256`, live `isActive` check) is architecturally justified and strictly isolated.
- **Boundary Enforcement**: Candidate JWTs always carry `organisationId: null`, `employeeId: null`, `userType: 'CANDIDATE'`, and are blocked from all org/admin routes (`403`); Org/Admin tokens are blocked from `/api/v1/portal/*` (`403`). Auth rate limiting (`authRateLimiter`, 25/15min) guards login, candidate signup, and activation endpoints.
- **Fixed**: Unauthenticated or mismatched repeat public applications cannot overwrite an existing registered candidate's profile (`candidate.repository.js`), cannot inject applications onto a claimed profile (`409 CANDIDATE_ACCOUNT_SIGN_IN_REQUIRED`), and cannot bind attacker/employee `userId` values (`application.controller.js`); Phase 4.4 removed implicit `{ email, authUserId: null }` fallback matching across portal queries and file downloads, added mandatory 6-digit HMAC-hashed OTP email verification via [email.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/email/email.adapter.js) (fail-closed `DISABLED` | `RESEND` | `BREVO` | `SMTP`), explicit atomic `POST /api/v1/portal/claims` ([candidateClaim.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateClaim.service.js)), forgot/reset/change-password flows, brute-force lockouts, and immediate live DB `tokenVersion` session revocation (`401 SESSION_REVOKED`, fail closed `503`); concurrent org activations claim single-use tokens atomically (`subscription.service.js`). See [CANDIDATE_IDENTITY_SECURITY_AUDIT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/CANDIDATE_IDENTITY_SECURITY_AUDIT.md).

## 4. Tenant Isolation Findings
- **Verified**: All tenant repositories scope queries strictly by `req.auth.organisationId` (`req.tenantId`); mismatched `x-organisation-id` headers, route params, or payload fields return `403 CROSS_TENANT_DENIED`. Query `?organisationId=` tampering on `/applications/:id` & `/jobs/:id` cannot escape tenant scope (`404`).
- **Fixed**: Local `Subscription.expiresAt < now` now returns `403 SUBSCRIPTION_INACTIVE` even if row `status` is still `'ACTIVE'` (`tenantIsolation.js`).

## 5. RBAC Findings
- **Verified**: Live DB RBAC (`EmployeeRoleAssignment` + custom/revoked overrides) enforces 29 permissions across routes. Interviewers (`TECHNICAL_INTERVIEWER`, `SENIOR_INTERVIEWER`) see only assigned interviews, cannot modify compensation or create offers (`403`), and cannot view org-wide audit logs or reports (`403`). Platform Admins cannot access tenant employee routes or tenant resumes (`403`).
- **Fixed**: Deleted Employee Service records (`404` -> `null`) now immediately revoke Recruitment RBAC access in `live` mode (`rbac.js`).

## 6. Database Integrity Findings
- **Verified Live on Neon PostgreSQL**: Both migrations ([20261110000001](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/db/migrations/20261110000001-init-recruitment-schema.js) & [20261111000001](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/db/migrations/20261111000001-add-candidate-accounts-and-indexes.js)) verified `up`. PgBouncer compatibility (`normalizePostgresConnection` stripping `channel_binding`), connection pool bounds, transaction rollbacks, unique application `(job_id, candidate_id)` prevention, and unique payment reference blocking verified.
- **Fixed**: `src/db/config.js` now fails fast if `NODE_ENV=production` without `DATABASE_URL`; `errorHandler.js` suppresses raw SQL constraint details in 400 responses.

## 7. API Security Findings
- **Verified**: Helmet security headers, strict JSON size limit (`2mb`), CORS allowlist, Zod param/query/body validation (`422`), rate limiting (`apiRateLimiter` & `publicSubmissionLimiter`), and Pino secret redaction.
- **Fixed**: Query string tokens are stripped from access logs (`req.path`); prototype-pollution keys (`__proto__`, `constructor`, `prototype`) are blocked globally before Zod parsing (`validate.js`); unsafe URI schemes (`javascript:`, `data:`, `vbscript:`) rejected cleanly (`validationHelpers.js`).

## 8. File & Storage Security Findings (Phase 4.3.1 Cloudinary Alignment)
- **Fixed (HIGH — Download AuthZ & Record Integrity)**: `GET /api/v1/files/download` verifies live PostgreSQL document rows BEFORE reading storage, blocks deleted (`404`) or quarantined/failed (`403 DOCUMENT_QUARANTINED`) rows, enforces `InterviewAssignment` ownership for scoped interviewers (`403 INTERVIEW_ASSIGNMENT_REQUIRED`), narrows `OFFER` (`offer:view`) / `JOINING` (`joining:view`) / `SUBSCRIPTION_PROOF` (`PLATFORM_ADMIN`), passes stored `cloudinaryPublicId`, `cloudinaryResourceType`, `cloudinaryFormat`, and `storageProvider` to `storageAdapter.readFileBuffer`, sanitizes filenames/headers (`Cache-Control: private, no-store, no-cache`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`), and avoids leaking query tokens in Pino logs ([storage.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/storage/storage.routes.js)).
- **Fixed (HIGH — Upload Validation, Malware Scan & Orphan Cleanup)**: Enforced mandatory non-empty extension & multi-extension segment checks (`upload.js`), magic-byte/script payload checks (`storage.adapter.js`), synchronous ClamAV TCP `zINSTREAM` fail-closed scanning + `_quarantine` isolation ([malwareScanner.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/storage/malwareScanner.js)), SHA-256 checksum & `scan_status` persistence (`20261111000002`), Cloudinary `public_id` / `resource_type` / `format` / `version` / `storage_visibility` persistence (`20261111000003`), and transaction-rollback `deleteFile` orphan cleanup across all upload services.
- **Fixed (HIGH — Official Cloudinary SDK & Fail-Fast Guards)**: Removed S3 configuration (`s3Client.js` deleted) and aligned production object storage on **Cloudinary** via the official `cloudinary` Node SDK ([cloudinaryClient.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/storage/cloudinaryClient.js)) using `type: 'authenticated'` and `access_mode: 'authenticated'`, backend-only credentials, short-lived server-signed `private_download_url` proxying, and startup validation (`env.js`) blocking invalid drivers (including `S3_COMPATIBLE`), incomplete Cloudinary config, and unacknowledged `LOCAL_SECURE` in `production`. See [STORAGE_SECURITY_AUDIT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/STORAGE_SECURITY_AUDIT.md).
- **Deployment Prerequisites Remaining (Classification B)**: Provision live `CLOUDINARY_*` credentials (`STORAGE_DRIVER=CLOUDINARY`) & optional external `clamd` sidecar before horizontal production go-live ([PRODUCTION_STORAGE_DEPLOYMENT_GUIDE.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/PRODUCTION_STORAGE_DEPLOYMENT_GUIDE.md)).

## 9. Subscription Enforcement Findings
- **Verified**: Active status, trial/subscription expiration, and optional `RECRUITMENT` feature checks happen strictly server-side (`requireTenant` + Platform Service `/entitlements/organizations/:id`); offline Platform Service returns `503` (never unrestricted access).
- **Fixed**: `submitPaymentProof` rejects client-supplied `amountCents` mismatches against server `sub.amountCents` and forbids raw `proofFileKey` submission.
- **Documented Gap**: Shared `platform-service` `plans` model lacks numeric `maxJobs`/`maxEmployees` fields (`REC-RSK-004`).

## 10. Shared-Service Integration Status (Phase 4 Classification)

| Integration Target | Port | Classification | Actual Evidence & Dependencies |
|---|---|---|---|
| **Recruitment Service** (`recruitment-service/`) + Neon DB | `4007` | **LIVE VERIFIED** (boot, Neon DB, `live`-mode `401`/`503` probes, fail-fast) · Ecosystem E2E **BLOCKED** | Probed on live port `4017` (`INTEGRATION_MODE=live`, Neon connected) + port `4007` checked; offline deps returned real `ECONNREFUSED` / `503`. |
| **API Gateway** (`api-gateway/`) | `4000` | **BLOCKED** (Offline, no `.env`/`node_modules`, routes unregistered) · Adapter **IMPLEMENTED, NOT LIVE VERIFIED** | Port `4000` `ECONNREFUSED`; contract verified in [sharedServiceIntegration.test.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/tests/integration/sharedServiceIntegration.test.js). |
| **Auth Service** (`auth-service/`) | `4001` | **BLOCKED** (Offline, no `.env`/`node_modules`) · Adapter **IMPLEMENTED, NOT LIVE VERIFIED** | Port `4001` `ECONNREFUSED`; live offline failure (`503`) verified; contract & identity deduplication verified via HTTP mock harness. |
| **Platform Service** (`platform-service/`) | `4002` | **BLOCKED** (Offline, no `.env`/`node_modules`) · Adapter **IMPLEMENTED, NOT LIVE VERIFIED** | Port `4002` `ECONNREFUSED`; contract verified via HTTP mock harness. |
| **Organization Service** (`organization-service/`) | `4003` | **BLOCKED** (Offline, no `.env`/`node_modules`) · Adapter **IMPLEMENTED, NOT LIVE VERIFIED** | Port `4003` `ECONNREFUSED`; contract & GET retries verified via HTTP mock harness. |
| **Employee Service** (`employee-service/`) | `4004` | **BLOCKED** (Offline, no `.env`/`node_modules`) · Adapter **IMPLEMENTED, NOT LIVE VERIFIED** | Port `4004` `ECONNREFUSED`; contract & deleted-employee revocation verified via HTTP mock harness. |
| **Notification Service** (`notification-service/`) | `4006` | **BLOCKED** (Offline, no `.env`/`node_modules`) · Adapter **IMPLEMENTED, NOT LIVE VERIFIED** | Port `4006` `ECONNREFUSED`; `DELIVERED` / `ACCEPTED` / `PARTIAL_FAILURE` / `UNKNOWN` / `FAILED` states verified cleanly. |

## 11. Gateway Route Registration Blockers
- External Gateway maintainer must add `RECRUITMENT_SERVICE_URL=http://localhost:4007` and mount public & Candidate Portal paths (`/api/v1/auth/candidate`, `/api/v1/portal`, `/api/v1/files/download`, `/api/v1/jobs/public/careers`, `/api/v1/applications/public`, non-admin `/api/v1/subscriptions`) with `stripTrustedHeaders` BEFORE protected paths (`...protect`). See Section 6 of [SHARED_SERVICE_INTEGRATION.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/SHARED_SERVICE_INTEGRATION.md).

## 12. Frontend Security Findings
- **Verified**: Zero secrets in `client/.env*`; only JWT stored in `localStorage`; zero `dangerouslySetInnerHTML` / `eval`; `ProtectedRoute` handles `401` (clears session, redirects `/login`), role mismatch (`CANDIDATE` -> `/portal`, `ORG_USER` -> `/app` cleanly before rendering protected JSX), and `503` outages (preserves token, renders retryable `ErrorState`).
- **Fixed**: Updated document links in [ApplicationDetailModal.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/modules/applications/ApplicationDetailModal.jsx), [CandidateOffersPage.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/modules/candidate-portal/CandidateOffersPage.jsx), [OffersPage.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/modules/offers/OffersPage.jsx), and [JoiningPage.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/modules/joining/JoiningPage.jsx) to use Bearer-authenticated Blob download (`downloadAuthenticatedFile`).

## 13. DevOps & Dependency Audit Readiness
- **Containers & Nginx**: Multi-stage Dockerfiles run as non-root `appuser` (`recruitment-service.Dockerfile`), `.dockerignore` blocks `.env`/`storage`/`logs`/`node_modules`, Nginx includes `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy`.
- **Fail-Fast Guards**: `NODE_ENV=production` aborts immediately on `INTEGRATION_MODE=standalone`, missing `INTERNAL_SERVICE_TOKEN`, missing/reused `CANDIDATE_JWT_SECRET` (must differ from `JWT_SECRET` & `INTERNAL_SERVICE_TOKEN`), missing/insecure `CANDIDATE_TOKEN_HASH_SECRET`, disabled/misconfigured `EMAIL_PROVIDER` (unless explicit dev override `ALLOW_UNCONFIGURED_EMAIL_IN_PRODUCTION=true`), missing `STORAGE_SIGNED_URL_SECRET`, invalid `STORAGE_DRIVER`, or missing `DATABASE_URL` (`env.js` + `db/config.js`).
- **Dependency Audit (Verified Post-Phase-4.4)**:
  - `client`: **0 vulnerabilities** (`npm audit --omit=dev` & `npm audit`, `vitest@4.1.12`, unused `@testing-library/user-event` removed).
  - `recruitment-service`: **0 critical, 0 high, 0 dev, 5 moderate upstream advisories** (`npm audit --omit=dev` & `npm audit`, including `nodemailer@^10.5.0`, `cloudinary@^2.11.0`, `zod@4.6.7`, deduped `uuid@11.1.1`, `vitest@^4.1.12`, `nodemon@3.1.11`). Remaining 5 moderate advisories sit exclusively inside `sequelize-cli@6.6.5 -> js-beautify@1.15.4` (not invoked at HTTP runtime or `db:migrate`). See [DEPENDENCY_SECURITY_REMEDIATION.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/DEPENDENCY_SECURITY_REMEDIATION.md).

## 14. Automated & Live Verification Results
- **Backend Syntax**: `node --check` passed on all `.js` files in `recruitment-service/src/`.
- **Backend Vitest (`npm --prefix recruitment-service test`)**: **10 test files passed (10), 40 tests passed (40)**, zero failures/skips (includes Phase 4.2 [candidateIdentityBoundary.test.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/tests/integration/candidateIdentityBoundary.test.js), Phase 4.3.1 [storageAndDocumentSecurity.test.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/tests/integration/storageAndDocumentSecurity.test.js), and Phase 4.4 [candidateIdentityVerificationAndRecovery.test.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/tests/integration/candidateIdentityVerificationAndRecovery.test.js)).
- **Frontend Vitest (`npm --prefix client test`)**: **1 test file passed (1), 18 tests passed (18)**, zero failures/skips.
- **Frontend Vite Build (`npm --prefix client run build`)**: Passed cleanly.
- **Neon Migrations (`sequelize-cli db:migrate:status`)**: All 5 migrations (`20261110000001` through `20261112000001`) verified `up`.
- **Startup & Production Fail-Fast Probes**: Verified fatal exit on unsupported `STORAGE_DRIVER` (`S3_COMPATIBLE` rejected), incomplete `CLOUDINARY` credentials, unacknowledged `LOCAL_SECURE`, missing `CANDIDATE_TOKEN_HASH_SECRET`, disabled `EMAIL_PROVIDER`, and insecure `SMTP_REQUIRE_TLS=false` in `NODE_ENV=production`.

## 15. Fixed Vulnerabilities Summary
Resolved `REC-SEC-001` through `REC-SEC-015` (and Phase 4.2 `REC-ID-001`..`009`) inside Recruitment (see full trace tables in [FINAL_SECURITY_AUDIT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/FINAL_SECURITY_AUDIT.md), [CANDIDATE_IDENTITY_SECURITY_AUDIT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/CANDIDATE_IDENTITY_SECURITY_AUDIT.md), and [STORAGE_SECURITY_AUDIT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/STORAGE_SECURITY_AUDIT.md)).

## 16. Unresolved Risks
- Shared microservices offline / unregistered (`REC-BLK-001`, `REC-BLK-002`).
- External ClamAV daemon (`REC-RSK-001`), live Cloudinary credentials (`REC-RSK-002` — Classification B), and live transactional email credentials (`REC-RSK-007`: `EMAIL_PROVIDER=RESEND|BREVO|SMTP`) await production provisioning.
- `sequelize-cli >=6.6.3` (installed `6.6.5`) `-> js-beautify -> editorconfig / glob / minimatch` upstream CLI moderate advisories (`REC-RSK-003` — 5 moderate advisories under both `npm audit` and `npm audit --omit=dev`, 0 critical, 0 high, 0 advisories in `cloudinary` or `nodemailer`).
- Absence of numeric plan quota caps in shared Platform Service (`REC-RSK-004`).

## 17. Required External Actions Before Go-Live
1. Provision PostgreSQL databases, `.env` configs, `npm install`, migrations, seeds, and aligned `INTERNAL_SERVICE_TOKEN` across all six shared repositories and start services `4003 -> 4001 -> 4002 -> 4006 -> 4004 -> 4000`.
2. Register `RECRUITMENT_SERVICE_URL=http://localhost:4007` and exact public / Candidate Portal bypass + protected mounts inside `api-gateway/`.
3. Execute full 16-step live E2E verification across actual running services `4000–4007` + `5173`.
4. Provision Cloudinary production credentials (`STORAGE_DRIVER=CLOUDINARY`), transactional email provider (`EMAIL_PROVIDER=RESEND|BREVO|SMTP`, `EMAIL_FROM`, `CANDIDATE_TOKEN_HASH_SECRET`), and optional `clamd` daemon (`MALWARE_SCANNER_MODE=CLAMAV`, `MALWARE_SCAN_REQUIRED=true`).

## 18. Final Production-Readiness Decision
**Decision: B. CONDITIONALLY READY** *(Code-hardened inside Recruitment; **LIVE DEPLOYMENT BLOCKED** until Required External Actions 1–3 succeed cleanly against live processes.)*


---

## 19. Phase 4.5 Final Addendum (2026-11-12)
Independent end-to-end audit completed in Phase 4.5:
- Resolved `REC-P45-001` (`client/vite.config.js` `4005` -> `4007`), `REC-P45-002` (`infrastructure/docker-compose.yml` Phase 4.4 required secrets/email vars), and `REC-P45-003` (`recruitment-service/.dockerignore` & `client/.dockerignore`).
- Verified `40/40` backend tests, `18/18` frontend tests, `2159` module production Vite build, `5/5` Neon migrations `up`, `8/8` production fail-fast guards, live `/health` (`200`) + `/ready` (`503 not_ready` when shared services offline), and confirmed zero modifications across all 6 read-only shared service repositories.
- Full Phase 4.5 deliverables: [FINAL_PRODUCTION_READINESS_REPORT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/FINAL_PRODUCTION_READINESS_REPORT.md), [PHASE_4_5_FINAL_SECURITY_AUDIT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/PHASE_4_5_FINAL_SECURITY_AUDIT.md), [END_TO_END_VERIFICATION_MATRIX.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/END_TO_END_VERIFICATION_MATRIX.md), [SECURITY_FINDINGS_REGISTER.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/SECURITY_FINDINGS_REGISTER.md), [PRODUCTION_DEPLOYMENT_CHECKLIST.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md), and [SHARED_SERVICE_INTEGRATION_BLOCKERS.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/SHARED_SERVICE_INTEGRATION_BLOCKERS.md).
