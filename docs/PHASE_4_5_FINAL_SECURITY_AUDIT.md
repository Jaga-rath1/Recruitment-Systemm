# Phase 4.5 Final End-to-End Security Audit — NEXNUV Recruitment Microservice

**Audit Date:** 2026-11-12  
**Service Scope:** `recruitment-service/` (Port `4007`), `client/` (Port `5173`), `infrastructure/`, `docs/`  
**Read-Only Boundary Verified:** `api-gateway/`, `auth-service/`, `platform-service/`, `organization-service/`, `employee-service/`, `notification-service/` remain untouched (verified via file `LastWriteTime` across all 6 shared directories: no files modified after 2026-11-11).

---

## 1. Executive Summary & Audit Methodology

Phase 4.5 performed an independent source-code, configuration, schema, dependency, frontend, Docker, and live-runtime audit across all Recruitment-owned layers rather than relying on prior phase summaries. Every claim below is backed by direct code inspection and re-executed verification commands conducted after the final edits.

### Architecture Constraints Verified Clean
- **Forbidden Technologies Scan**: Zero instances of `bullmq`, `amqplib`, `kafkajs`, `ioredis`, `aws-sdk`, `S3_COMPATIBLE`, `s3Client`, `dangerouslySetInnerHTML`, or `eval(` exist in `recruitment-service/src/`, `client/src/`, `client/vite.config.js`, or `infrastructure/`.
- **Core Stack Preserved**: Node.js + Express (`recruitment-service/`), React + Vite + Tailwind CSS + React Router (`client/`), Sequelize ORM + PostgreSQL / Neon, Cloudinary authenticated asset delivery (`cloudinary@^2.11.0`) + dev-gated `LOCAL_SECURE` storage.

---

## 2. Backend Security & Confidentiality Verification

### 2.1 Authentication & Middleware Hardening
- [auth.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/auth.js), [env.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/config/env.js): Enforces strict cryptographic separation between Org/Platform Admin JWTs (`JWT_SECRET`) and Candidate Portal JWTs (`CANDIDATE_JWT_SECRET`), rejects shared secrets in `NODE_ENV=production`, and validates `CANDIDATE_TOKEN_HASH_SECRET`.
- [validate.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/validate.js): Rejects prototype pollution keys (`__proto__`, `constructor`, `prototype`) recursively across body/query/params before handler execution and enforces strict Zod schemas.
- [securityHeaders.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/securityHeaders.js), [app.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/app.js): Strips `X-Powered-By`, sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, strict CORS allowlist, request ID correlation, and separate auth/upload/general rate limiters.

### 2.2 Tenant Isolation, RBAC & Field-Level Confidentiality
- [tenantIsolation.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/tenantIsolation.js), [rbac.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/rbac.js): Every tenant route requires valid `tenantId` (`organisationId`), live active-organisation + `RECRUITMENT` feature-entitlement checks in `live` mode ([platform.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/platform/platform.adapter.js)), and live employee-role permission resolution.
- **Technical / Senior Interviewer Confidentiality** ([interview.repository.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/interview/interview.repository.js), [interview.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/interview/interview.service.js)):
  - `listAssignedInterviews` queries `InterviewAssignment` scoped to `interviewerEmployeeId: employeeId`.
  - Candidate projection in `listInterviews` is restricted to `['id', 'fullName', 'email', 'totalExperienceYears', 'skills']`, withholding `currentSalary`, `expectedSalary`, `offer`, `screeningNotes`, and `finalDecisionNotes`.
  - Interviewer roles (`TECHNICAL_INTERVIEWER`, `SENIOR_INTERVIEWER`) lack `application:view`, `candidate:view`, `application:final_decision`, `offer:view`, `offer:manage`, and `joining:view` ([rbacDefinitions.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/role/rbacDefinitions.js)).
- **Candidate Portal Confidentiality** ([tracking.repository.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/tracking/tracking.repository.js), [tracking.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/tracking.service.js)):
  - `buildCandidateOwnerWhere` fails closed when `userId` is falsy (`{ id: null }`) and scopes strictly by `authUserId`.
  - `findCandidateApplications` omits `screeningNotes`, `finalDecisionNotes`, `ApplicationStageHistory.internalRemark`, `InterviewFeedback`, and `InterviewAssignment` from candidate-visible API payloads.
- **Unauthenticated Public Jobs** ([job.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/job/job.service.js)): `listPublicCareersJobs` and `getPublicCareersJobDetail` expose only published public job metadata (`isPublic: true`, `status: 'PUBLISHED'`) and screening questions.

### 2.3 Candidate Identity Verification, Claim & Password Recovery
- Inspected [candidateIdentity.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateIdentity.service.js), [candidateClaim.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateClaim.service.js), and [candidateSecurity.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/utils/candidateSecurity.js):
  - Candidate sign-up does not issue an active session until OTP email ownership is verified (`verifyCandidateEmail`).
  - Pre-account applications are never auto-bound at registration or login; ownership requires verified email plus explicit `POST /api/v1/portal/claims`.
  - Password changes/resets increment `tokenVersion` and reject previously issued candidate JWTs; brute-force lockouts guard OTP, login, and password-reset endpoints.
  - Transactional email ([email.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/email/email.adapter.js)) supports `RESEND`, `BREVO`, `SMTP` (TLS enforced unless explicit non-prod override), and fails closed in production when `DISABLED`.

### 2.4 Storage, Cloudinary & Malware Security
- Inspected [storage.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/storage/storage.adapter.js), [cloudinaryClient.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/storage/cloudinaryClient.js), [malwareScanner.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/storage/malwareScanner.js), [upload.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/upload.js), and [storage.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/storage/storage.routes.js):
  - Uploads enforce extension/MIME consistency, binary magic-byte inspection (blocking disguised PE/ELF/HTML/SVG/PHP payloads), double-extension prevention, 10 MB limit (`upload.js`), SHA-256 checksums, and optional fail-closed ClamAV `zINSTREAM` scanning + quarantine storage.
  - Cloudinary uploads strictly set `type: 'authenticated'`, `access_mode: 'authenticated'`, and stream-proxy downloads via authenticated HMAC tokens (`/api/v1/files/download?token=...`) after verifying DB scan status, tenant ownership, interviewer assignment, or candidate `authUserId` ownership. Public Cloudinary URLs are never returned.

### 2.5 Payment Proof Integrity & Downstream HTTP Resilience
- [subscription.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/subscription/subscription.service.js): Calculates invoice `amountCents` server-side from `PLAN_PRICING`, rejects `AMOUNT_MISMATCH` (`400`) and duplicate `paymentReference` (`409`), enforces `idempotencyKey`, and uses an in-memory flight lock plus atomic SQL `WHERE status = 'APPROVED' AND activation_token_hash = ...` guard on single-use org activation.
- [httpClient.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/common/httpClient.js): Applies `AbortController` timeouts, retries safe `GET` requests only on `502/503/504`/network failure (never mutating `POST/PATCH/PUT/DELETE`), forwards correlation `x-request-id`, and maps upstream outages to `503 SERVICE_UNAVAILABLE`.

---

## 3. Phase 4.5 Remediations Applied

Three real deployment/development defects discovered during Phase 4.5 independent inspection were resolved inside Recruitment-owned files:

| ID | File | Defect Found | Remediation Applied |
|---|---|---|---|
| `REC-P45-001` | [vite.config.js](file:///c:/Users/rathj/NEXNUV-Recruitment/client/vite.config.js#L19-L24) | Dev `/api` proxy targeted `http://localhost:4005` instead of Recruitment Service port `4007`. | Updated `server.proxy['/api'].target` to `http://localhost:4007`. |
| `REC-P45-002` | [docker-compose.yml](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/docker-compose.yml#L46-L60) | `recruitment-service` ran with `NODE_ENV: production` without passing `CANDIDATE_TOKEN_HASH_SECRET`, `EMAIL_PROVIDER`, `ALLOW_UNCONFIGURED_EMAIL_IN_PRODUCTION`, or email provider env vars, causing immediate crash on startup. | Added `CANDIDATE_TOKEN_HASH_SECRET` required var plus `EMAIL_PROVIDER`, `ALLOW_UNCONFIGURED_EMAIL_IN_PRODUCTION`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `RESEND_API_KEY`, `BREVO_API_KEY`, and `SMTP_*` env vars. |
| `REC-P45-003` | [recruitment-service/.dockerignore](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/.dockerignore) & [client/.dockerignore](file:///c:/Users/rathj/NEXNUV-Recruitment/client/.dockerignore) | Compose build contexts (`../recruitment-service`, `../client`) bypassed root `.dockerignore`, risking bundling `.env`, `node_modules/`, `storage/`, and `.pglite-data/`. | Added dedicated `.dockerignore` files in both service directories excluding `.env`, `.env.*`, `node_modules`, build/runtime artifacts, and `.git`. |

---

## 4. Verification Summary After Final Code Edits

- **Backend Syntax Check**: `node --check` on all `.js` files under `recruitment-service/src/` -> `SyntaxCheckErrors=0`.
- **Backend Automated Suite (`npm --prefix recruitment-service test`)**: **10/10 files passed, 40/40 tests passed** (0 failures, 0 skipped). *(Executed outside Windows terminal sandbox due to PGlite local socket `EACCES` restriction inside sandbox.)*
- **Frontend Automated Suite (`npm --prefix client test`)**: **1/1 file passed, 18/18 tests passed** (0 failures, 0 skipped).
- **Frontend Production Build (`npm --prefix client run build`)**: **Passed** (`2159 modules transformed`, clean bundle output).
- **Neon PostgreSQL Migrations (`npx --prefix recruitment-service sequelize-cli db:migrate:status`)**: **5/5 migrations `up`** (`20261110000001` through `20261112000001`).
- **Production Fail-Fast Configuration Probes**: **8/8 misconfigurations rejected**, valid production live baseline (`CLOUDINARY` + `RESEND` + distinct secrets) passed.
- **Live Server Boot & Readiness Probes (`recruitment-service/src/server.js`)**:
  - Standalone mode against Neon DB: `GET /health` -> `200 ok`; `GET /ready` -> `200 ready` (`database: "up"`).
  - Live mode against Neon DB with offline shared ports: `GET /health` -> `200 ok`; `GET /ready` -> `503 not_ready` (`database: "up"`, `authService: "down"`, `organisationService: "down"`, `platformService: "down"`, `employeeService: "down"`, `notificationService: "degraded"`).
- **Dependency Audits**:
  - `client/` (`npm audit` & `npm audit --omit=dev`): **0 vulnerabilities**.
  - `recruitment-service/` (`npm audit` & `npm audit --omit=dev`): **5 moderate upstream advisories** (`glob`, `minimatch` via `sequelize-cli@6.6.3 -> js-beautify -> editorconfig`), **0 critical**, **0 high**, **0 low**.

