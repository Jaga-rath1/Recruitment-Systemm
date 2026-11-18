# NEXNUV Recruitment — Candidate Identity & Authentication Boundary Audit (Phase 4.2 + Phase 4.4)

**Audit Date**: 2026-11-12  
**Scope**: `recruitment-service/` (`PORT 4007`), `client/` (`PORT 5173`), `docs/`  
**Shared-Service Boundary**: `api-gateway/` (`4000`), `auth-service/` (`4001`), `platform-service/` (`4002`), `organization-service/` (`4003`), `employee-service/` (`4004`), and `notification-service/` (`4006`) remained **strictly read-only** (`LastWriteTime` verified unchanged since `10-11-2026 17:02–17:11`).  
**Brokers Verification**: Confirmed zero RabbitMQ, BullMQ, Kafka, or Redis queues exist anywhere in NEXNUV Recruitment.  
**Final Classification**: **B. CONDITIONALLY PASSED**  
*(All candidate identity, OTP email verification, keyed HMAC hashing, atomic single-use password recovery, immediate `tokenVersion` session revocation, login/OTP lockouts, and explicit org-scoped `POST /api/v1/portal/claims` protections are implemented, migrated cleanly on Neon PostgreSQL, and verified across `40/40` backend tests and `18/18` frontend tests. Classified `B. CONDITIONALLY PASSED` because live external transactional email credentials (`RESEND`/`BREVO`/`SMTP`) are unprovisioned in local dev `.env` — tested via fail-closed `503` checks, mocked HTTPS `fetch`, and `NODE_ENV=test` transport harness — and the six shared NEXNUV microservices `4000–4004, 4006` remain read-only/offline externally.)*

---

## 1. Identity Ownership Model

| Entity / Authority | System of Record | Authoritative Identifier | Responsibilities & Boundaries |
|---|---|---|---|
| **Platform Admin & Internal Users** (`super_admin`, `org_admin`, `hr`, `manager`, `employee`, `service_manager`, `agent`) | Shared **Auth Service** (`4001`) | `Auth User ID` (`users.id`) | Issues & verifies internal/org JWTs via `/api/v1/auth/login` and `/api/v1/auth/me`; owns staff passwords (`bcryptjs`), password resets (`PasswordResetToken`), and user status (`active`/`inactive`/`suspended`). Recruitment **never** becomes a master identity provider for staff. |
| **Employee Directory & Employment Status** | Shared **Employee Service** (`4004`) | `Employee ID` (`employees.id`) | Authoritative HR directory scoped to `organizationId`; determines `isActive` (`!['inactive','terminated'].includes(status)`). Recruitment verifies active org employment in `live` mode ([rbac.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/rbac.js)). |
| **Tenant Organisation Metadata & Activation** | Shared **Organization Service** (`4003`) & **Platform Service** (`4002`) | `Organisation ID` (`organizations.id`) | Authoritative tenant lifecycle and commercial entitlements. Recruitment binds every internal route via server-authoritative [tenantIsolation.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/tenantIsolation.js). |
| **External Candidate Portal Account** | **Recruitment Service** (`4007`) | `CandidateAccount.id` (`candidate_accounts.id`) | Isolated self-service credentials (`scrypt` salt+hash, `is_active`, unique `email`) strictly for external job applicants; zero `organisationId`, zero `employeeId`, zero access to internal org workspaces or shared Auth Service accounts. |
| **Candidate Recruitment Profile** | **Recruitment Service** (`4007`) | `Candidate.id` (`candidates.id`) | Tenant-scoped application profile (`UNIQUE(organisation_id, email)`) storing `auth_user_id` (linked strictly to verified `CandidateAccount.id` when email matches). |
| **Recruitment Staff RBAC Assignment** | **Recruitment Service** (`4007`) | `EmployeeRoleAssignment.id` (`employee_role_assignments.id`) | Per-organisation Recruitment role assignment (`UNIQUE(organisation_id, employee_id)`), storing optional cached `auth_user_id`, custom/revoked permissions, and Recruitment-specific `is_active`. |

### Entity Relationship & Same-Email Dual Role Safety
- `CandidateAccount.id` links logically (not across tenants) via `Candidate.authUserId` (`candidates.auth_user_id`), bound ONLY on verified-email `POST /api/v1/applications/public/jobs/:jobId/apply` OR explicit conditional `POST /api/v1/portal/claims` (no implicit unverified email fallback).
- A legitimate internal employee (`alice@acme.io` in Auth Service + `employee_role_assignments`) can also apply externally and register a separate `CandidateAccount` (`alice@acme.io` in `candidate_accounts`) without creating duplicate Employee/Auth users or elevating `CANDIDATE` permissions into internal workspaces:
  - `/api/v1/auth/candidate/register` writes only to `candidate_accounts` (`emailVerified: false`, no session JWT returned).
  - `/api/v1/auth/candidate/login` authenticates only against `candidate_accounts` (`emailVerified === true` required) and issues a `CANDIDATE` token (`organisationId: null`, `userType: 'CANDIDATE'`, `roles: ['CANDIDATE']`, `tokenVersion`).
  - Public job application with an internal Employee Bearer token **never** binds `req.auth.userId` onto `candidates.auth_user_id`.

---

## 2. Candidate Identity Lifecycle

1. **Public Application (`POST /api/v1/applications/public/jobs/:jobId/apply`)**:
   - Protected by `publicSubmissionLimiter` & optional auth (`optionalAuthenticate`).
   - Only binds `candidates.auth_user_id` when `req.auth.userType === 'CANDIDATE'`, `emailVerified === true`, **and** normalized `req.auth.email === req.body.email` ([application.controller.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/application/application.controller.js)).
   - If `candidates(organisation_id, email)` already exists with `auth_user_id` owned by a candidate, unauthenticated or mismatched repeat applications to another job are blocked (`409 CANDIDATE_ACCOUNT_SIGN_IN_REQUIRED`) and never overwrite stored profile fields ([candidate.repository.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidate.repository.js)).
2. **Registration & Mandatory OTP Email Verification (`POST /api/v1/auth/candidate/register`, `/verify-email`, `/resend-verification`)**:
   - Protected by `authRateLimiter` / `candidateVerificationLimiter` and strong password validation (`strongPasswordSchema`).
   - Normalizes email (`trim().toLowerCase()`), creates `candidate_accounts` with `emailVerified: false`, random 16-byte salt + `crypto.scryptSync`, keyed HMAC-SHA256 hashed 6-digit CSPRNG OTP (`CANDIDATE_TOKEN_HASH_SECRET`, 10-minute TTL), inside a Sequelize transaction that rolls back atomically (`503 EMAIL_DELIVERY_UNAVAILABLE`) if email dispatch fails via [email.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/email/email.adapter.js). Returns **no JWT**.
   - `verify-email` checks lockout (`5` attempts -> `15m` lock invalidating active OTP), validates HMAC digest with `crypto.timingSafeEqual`, and atomically promotes `emailVerified: true` in one conditional SQL update (`409`/`400` on replay). `resend-verification` enforces `60s` cooldown across both DB and memory and overwrites/invalidates prior OTPs.
3. **Authentication, Brute-Force Lockout & Password Recovery (`/login`, `/forgot-password`, `/reset-password`, `/change-password`)**:
   - `/api/v1/auth/candidate/login` enforces `scrypt` verification against a constant-time dummy hash when missing, tracks `failed_login_attempts` (locks `15m` at `5` failures -> `429 ACCOUNT_LOCKED`), blocks unverified accounts (`403 EMAIL_NOT_VERIFIED`), and signs JWT carrying `tokenVersion`.
   - `forgot-password` returns uniform generic `200` regardless of account state and emails a 32-byte URL-safe token stored only as keyed HMAC-SHA256 (`30m` TTL).
   - `reset-password` and `change-password` increment `token_version` atomically inside DB updates, invalidating all prior JWTs immediately (`401 SESSION_REVOKED`).
4. **Portal Reads, Explicit Application Claim (`POST /api/v1/portal/claims`), Profile Updates & File Downloads**:
   - `/api/v1/portal/*` requires `authenticate` + `requireCandidate`.
   - `verifyRequestAuth` validates candidate JWT (`HS256`, `CANDIDATE_JWT_SECRET`, `iss`, `aud`, `userType === 'CANDIDATE'`) **and** queries `CandidateAccount.findByPk(sub)` (`isActive === true`, `emailVerified === true`, `decoded.tokenVersion === account.tokenVersion`), failing closed (`503 SESSION_STORE_UNAVAILABLE`) if PostgreSQL is unreachable ([auth.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/auth/auth.adapter.js)).
   - [tracking.repository.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/tracking/tracking.repository.js) and [storage.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/storage/storage.routes.js) enforce strict `authUserId === auth.userId` ownership with **zero** implicit email fallback.
   - Prior anonymous applications (`auth_user_id IS NULL`) must be explicitly bound via rate-limited `POST /api/v1/portal/claims` ([candidateClaim.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateClaim.service.js)), scoped to `(organisationId, verifiedEmail, authUserId IS NULL)` with non-disclosing `404 CLAIM_NOT_ELIGIBLE` responses and `APPLICATION_CLAIM_*` audit logging.

---

## 3. Employee Identity Lifecycle

1. **Organisation Admin Activation**:
   - Platform Admin verifies payment proof -> Recruitment generates 32-byte `generateSecureToken(32)`, stores only SHA-256 `activation_token_hash` with 48-hour `activation_expires_at`.
   - On `POST /api/v1/subscriptions/activate` (guarded by `authRateLimiter`): verifies unexpired `APPROVED` subscription, acquires an in-flight lock (`activationInFlight`), creates/reuses active Employee in Employee Service, provisions `org_admin` + sets password on Auth Service (`/internal/provision-agent` -> `/login` -> `/setup-password`), seeds org RBAC roles, atomically clears `activationTokenHash = null` via conditional `Subscription.update(..., { where: { id, status: 'APPROVED', activationTokenHash } })`, and verifies `affected === 1` (`409` on concurrent replay).
2. **Employee Invitation (`POST /api/v1/organisations/employees`)**:
   - `resolveTargetRole` rejects assigning `CANDIDATE` role to employees (`400`).
   - `employeeAdapter.createEmployee` searches same-org employees by normalized email, rejects `inactive`/`terminated` employees (`403 EMPLOYEE_INACTIVE`), and recovers cleanly on `409` concurrency races within the same `organisationId`.
   - `authAdapter.inviteEmployeeAccount` checks `findOrgAuthUserByEmail` (`GET /api/v1/auth/internal/users` filtered strictly by `organizationId`), reuses existing org Auth users, handles `409` provision race by re-checking org membership, and blocks cross-organisation Auth account linking with `409 CROSS_ORG_AUTH_CONFLICT`.
   - `organisationRepo.upsertEmployeeAssignment` handles `(organisation_id, employee_id)` unique races cleanly inside Sequelize transactions without leaving partial Recruitment records if upstream onboarding fails.
3. **Ongoing Enforcement (`verifyRequestAuth` + `requireTenant` + `rbac.js`)**:
   - `live` bearer requests delegate cryptographic verification & active-status check to Auth Service `GET /api/v1/auth/me` (never assuming shared `JWT_SECRET`); `mustChangePassword` blocks access (`403 PASSWORD_CHANGE_REQUIRED`).
   - Gateway requests require constant-time `x-internal-token` validation + live `/api/v1/auth/internal/accounts/:id` active check (and reject `role === 'candidate'`).
   - `rbac.js` verifies active `EmployeeRoleAssignment`, active `RecruitmentRole`, **and** live Employee Service status (`!extEmployee || !extEmployee.isActive` -> `403 ACCESS_REVOKED`).

---

## 4. JWT Separation Matrix

| Control | Candidate Portal JWT | Organisation / Platform JWT (Live) | Standalone / Test Admin JWT |
|---|---|---|---|
| **Issuer (`iss`)** | `nexnuv-recruitment-candidate` | Issued by **Auth Service** (`4001`) | `env.jwt.issuer` (`nexnuv-auth-service`) |
| **Audience (`aud`)** | `nexnuv-candidate-portal` | Auth Service token validated remotely via `/me` | `env.jwt.audience` (`nexnuv-recruitment`) |
| **Signing Secret** | `CANDIDATE_JWT_SECRET` (**strictly distinct** from `JWT_SECRET` & `INTERNAL_SERVICE_TOKEN` enforced in `env.js`) | Auth Service private signing secret (`JWT_SECRET` in Auth Service, not assumed shared in Recruitment) | `JWT_SECRET` / `JWT_PUBLIC_KEY` (standalone/test only) |
| **Algorithm Constraint** | Pinned `algorithms: ['HS256']` (`alg: none` rejected) | Validated by Auth Service `/me` | Pinned `['HS256']` or asymmetric key allowlist (`RS*/ES*`) |
| **Claim Guard** | `userType === 'CANDIDATE'`, `organisationId == null`, `!employeeId` | Mapped from Auth Service `role`, `organizationId`, `employeeId` | Rejects `userType === 'CANDIDATE'` or candidate `aud` |
| **Live Account Active Check** | `CandidateAccount.findByPk(sub)` (`isActive === true`) | `GET /api/v1/auth/me` + `EmployeeService` `isActive` + `EmployeeRoleAssignment.isActive` | `standaloneUsersById` `isActive` + `EmployeeRoleAssignment.isActive` |

---

## 5. Account Linking & Duplicate Identity Prevention Rules

- **Verified Same-Email Public Apply Linking**: Only when `req.auth.userType === 'CANDIDATE'` AND `req.auth.email.toLowerCase() === req.body.email.toLowerCase()` is `Candidate.authUserId` bound on creation or unclaimed `Candidate` updates.
- **Immutable `authUserId`**: `upsertCandidateForOrg` never overwrites an existing `Candidate.authUserId`; `tracking.repository.js` matches `{ authUserId }` or unowned `{ email, authUserId: null }`.
- **Database Uniqueness Constraints**:
  - `candidate_accounts`: `UNIQUE("email")` (`candidate_accounts_email_key`)
  - `candidates`: `UNIQUE("organisation_id", "email")` (`candidates_organisation_id_email_key`)
  - `applications`: `UNIQUE("job_id", "candidate_id")` (`applications_job_id_candidate_id_key`)
  - `employee_role_assignments`: `UNIQUE("organisation_id", "employee_id")` (`employee_role_assignments_organisation_id_employee_id_key`)
  - `subscriptions`: `UNIQUE("activation_token_hash")` (`subscriptions_activation_token_hash_key`)

---

## 6. Password Security & Auth Rate Limiting

- **Candidate Hashing**: `crypto.scryptSync(password, salt, 64)` with per-user 16-byte CSPRNG salt + `crypto.timingSafeEqual` ([auth.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/auth/auth.adapter.js#L26-L38)).
- **Staff / Admin Passwords**: Managed exclusively by shared `auth-service` (`bcryptjs` cost 10, temporary password rotation via `/setup-password`, SHA-256 `PasswordResetToken` with 1h expiry & `usedAt` invalidation).
- **Secret Redaction**: [logger.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/config/logger.js) censors `password`, `*.password`, `temporaryPassword`, `tempPassword`, `activationToken`, `token`, `secret`, `candidateSecret`, `req.headers.authorization`, `req.headers["x-internal-token"]`.
- **Anti-Enumeration**: Candidate & unified login endpoints return identical `401 Invalid email or password` messages regardless of whether the account exists, password mismatches, or the account is inactive. (`POST /api/v1/auth/candidate/register` intentionally returns `409` on duplicate email for registration UX.)
- **Rate Limiting**: Dedicated `authRateLimiter` (25 req / 15 min) applied to `/api/v1/auth/login`, `/api/v1/auth/candidate/register`, `/api/v1/auth/candidate/login`, and `/api/v1/subscriptions/activate` ([rateLimiter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/rateLimiter.js)).

---

## 7. Session, Refresh, Logout & Frontend Boundary Behavior

- **Token Transport & Storage**: React SPA stores JWT in `localStorage` (`nexnuv_token`) and sends it solely in the `Authorization: Bearer` header ([httpClient.js](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/api/httpClient.js)); zero cookies, zero refresh tokens, zero JWTs in URLs (activation links carry a single-use random `activationToken`; file downloads fetch via Bearer-authenticated `Blob` requests).
- **Frontend Route Guards**: [ProtectedRoute.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/components/layout/ProtectedRoute.jsx) renders only loading skeletons until `AuthContext` completes `/auth/me`, handles `503` upstream outages safely without losing valid sessions, clears `localStorage` on `401`/`403` `/auth/me` or `'nexnuv:unauthorized'` API events, syncs across browser tabs via `'storage'` events, and redirects mismatched roles cleanly (`/portal` <-> `/app` <-> `/platform-admin/subscriptions`) before mounting protected pages.
- **Stateless JWT Logout Limitation**: Neither shared Auth Service (`auth-service/src/modules/auth/auth.controller.js`) nor Recruitment maintains a JWT blocklist/revocation table on client logout (`Sign Out` drops `nexnuv_token` from browser storage). Previously captured non-expired JWTs stay cryptographically valid until `exp` unless the account is disabled (`CandidateAccount.isActive = false`, Auth `User.status !== 'active'`, `Employee.status`, or `EmployeeRoleAssignment.isActive = false`), which revokes subsequent API calls immediately.

---

## 8. Findings Identified & Remediated in Phase 4.2

| Finding ID | Severity | Area | Evidence Before Fix | Fix Implemented | Status |
|---|---|---|---|---|---|
| **REC-ID-001** | **HIGH** | [env.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/config/env.js) | `jwt.candidateSecret` fell back to `JWT_SECRET` and identical dev default string; production check did not forbid `CANDIDATE_JWT_SECRET === JWT_SECRET`. | Separated `candidateSecret` default fallback cleanly from `JWT_SECRET`; production startup now aborts fatally if `CANDIDATE_JWT_SECRET` is missing, default, equal to `JWT_SECRET`, or equal to `INTERNAL_SERVICE_TOKEN`. | **FIXED & VERIFIED** |
| **REC-ID-002** | **HIGH** | [auth.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/auth/auth.adapter.js) | Candidate JWT verification omitted `algorithms: ['HS256']`, did not verify claim invariants (`userType === 'CANDIDATE'`, `organisationId == null`), did not check live `CandidateAccount.isActive`, and standalone candidate auth shared `standaloneUsersByEmail` / `JWT_SECRET`. | Added `HS256` pinning, claim boundary enforcement, cross-token rejection, live `CandidateAccount.isActive` check in `verifyRequestAuth`, and unified `CandidateAccount` DB persistence + `CANDIDATE_JWT_SECRET` across both modes. | **FIXED & VERIFIED** |
| **REC-ID-003** | **HIGH** | [application.controller.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/application/application.controller.js), [candidate.repository.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidate.repository.js), [tracking.repository.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/tracking/tracking.repository.js), [storage.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/storage/storage.routes.js) | `applyPublic` bound `req.auth.userId` without checking `userType === 'CANDIDATE'` or email match (allowing an Employee ID or authenticated Candidate A applying with Victim B's email to claim unclaimed Victim B rows); `tracking.repository` matched `email` even if `authUserId` belonged to another user; `storage.routes` allowed email fallback when `candidateAuthUserId` differed. | Restricted `applyPublic` binding strictly to `CANDIDATE` + exact email match; restricted email fallback in `tracking.repository` to `authUserId: null`; refused overwriting non-null `authUserId`; enforced `candidateAuthUserId === auth.userId` when present on download tokens. | **FIXED & VERIFIED** |
| **REC-ID-004** | **MEDIUM** | [auth.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/auth/auth.routes.js), [subscription.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/subscription/subscription.routes.js), [rateLimiter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/rateLimiter.js) | `/api/v1/auth/login`, `/auth/candidate/register`, and `/auth/candidate/login` lacked strict brute-force rate limiting below global `300/15min`. | Added dedicated `authRateLimiter` (25 req / 15 min) on all auth credential endpoints and `/subscriptions/activate`. | **FIXED & VERIFIED** |
| **REC-ID-005** | **MEDIUM** | [employee.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/employee/employee.adapter.js), [auth.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/auth/auth.adapter.js), [organisation.repository.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/organisation/organisation.repository.js), [organisation.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/organisation/organisation.service.js), [subscription.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/subscription/subscription.service.js) | Concurrent duplicate employee onboarding or org activation could throw unhandled 409/unique errors or attempt duplicate provisioning; `findOrgAuthUserByEmail` lacked org-id match validation and cross-org 409 conflict distinction. | Added `409` race recovery with org scoping in `createEmployee` & `inviteEmployeeAccount`, explicit `CROSS_ORG_AUTH_CONFLICT` rejection across orgs, `SequelizeUniqueConstraintError` catch in `upsertEmployeeAssignment` & `upsertCandidateForOrg`, atomic `activationInFlight` + conditional SQL `Subscription.update` in `activateOrganisationAdmin`. | **FIXED & VERIFIED** |
| **REC-ID-006** | **LOW** | [httpClient.js](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/api/httpClient.js), [AuthContext.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/context/AuthContext.jsx) | Mid-session `401` API failures did not proactively clear `localStorage` until manual reload or `/auth/me` re-run; multi-tab logout/role switch did not sync across open browser tabs. | Added `'nexnuv:unauthorized'` auto-logout event on protected `401` responses and cross-tab `'storage'` listener in `AuthContext`. | **FIXED & VERIFIED** |
| **REC-ID-007** | **HIGH** | [candidateIdentity.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateIdentity.service.js), [email.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/email/email.adapter.js), [20261112000001](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/db/migrations/20261112000001-add-candidate-identity-lifecycle.js) | `POST /api/v1/auth/candidate/register` minted an active portal JWT immediately without verifying email ownership; notification-service (`4006`) lacked tenantless/fail-closed OTP support. | Required CSPRNG 6-digit OTP stored as keyed HMAC-SHA256 (`10m` TTL, `5`-attempt lock, `60s` resend cooldown, atomic consume), direct fail-closed `RESEND`/`BREVO`/`SMTP` email adapter, no pre-verify JWT, and OTP-pending signup UI. | **FIXED & VERIFIED (Phase 4.4)** |
| **REC-ID-008** | **HIGH** | [candidateClaim.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateClaim.service.js), [tracking.repository.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/tracking/tracking.repository.js), [storage.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/storage/storage.routes.js) | Portal queries & download auth matched `{ email, authUserId: null }` implicitly before email ownership verification. | Removed implicit email fallback in `tracking.repository.js` & `storage.routes.js`; added explicit org-scoped conditional SQL `POST /api/v1/portal/claims` (with non-disclosing `404 CLAIM_NOT_ELIGIBLE` and post-rollback audit persistence). | **FIXED & VERIFIED (Phase 4.4)** |
| **REC-ID-009** | **HIGH** | [candidateIdentity.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateIdentity.service.js), [auth.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/auth/auth.adapter.js) | Candidate portal lacked forgot/reset/change-password flows and stateless JWTs remained valid until expiry even after credential changes. | Added strong-password forgot/reset/change-password flows, dummy-hash constant-time login checks + 5-fail lockout (`429 ACCOUNT_LOCKED`), live DB `tokenVersion` + `emailVerified` + `isActive` verification (`401 SESSION_REVOKED`, fail closed `503`), and immediate session revocation. | **FIXED & VERIFIED (Phase 4.4)** |

---

## 9. Unresolved / Documented Risks & Missing Controls

| ID | Severity | Description & Honest Architectural Status | Recommendation |
|---|---|---|---|
| **REC-ID-RSK-01** | **RESOLVED (Phase 4.4)** | **Email Verification & Account Claim Protection Implemented**: Registration mandates 6-digit OTP verification prior to session issuance, and `tracking.repository.js`/`storage.routes.js` require verified `authUserId` ownership with explicit atomic `POST /api/v1/portal/claims`. See [CANDIDATE_EMAIL_VERIFICATION_GUIDE.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/CANDIDATE_EMAIL_VERIFICATION_GUIDE.md) & [CANDIDATE_ACCOUNT_CLAIM_SECURITY.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/CANDIDATE_ACCOUNT_CLAIM_SECURITY.md). | Configure `EMAIL_PROVIDER` (`RESEND`, `BREVO`, or `SMTP`) in production deployment. |
| **REC-ID-RSK-02** | **RESOLVED (Phase 4.4)** | **Self-Service Recovery & `tokenVersion` Session Revocation Implemented**: Candidate forgot/reset/change-password flows increment `token_version` atomically, revoking prior candidate JWTs immediately across all clients. See [CANDIDATE_PASSWORD_RECOVERY_SECURITY.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/CANDIDATE_PASSWORD_RECOVERY_SECURITY.md). | Completed inside Recruitment without mutating shared `auth-service`. |
| **REC-ID-RSK-03** | **LOW (Candidate Mitigated via `tokenVersion`)** | **Client Logout Statelessness Until Password Change / Deactivation**: Candidate password change/reset and deactivation revoke all issued candidate JWTs immediately via `tokenVersion` DB checks; explicit `Sign Out` clears `nexnuv_token` on client browsers (`localStorage`), whereas staff logout remains coordinated upstream with shared Auth Service (`4001`). | Optional future enhancement: shared logout `jti` blocklist coordinated with Auth Service & API Gateway. |
| **REC-ID-RSK-04** | **CRITICAL (Deployment Blocker)** | **Live Shared Services Offline Externally**: `api-gateway` (`4000`), `auth-service` (`4001`), `platform-service` (`4002`), `organization-service` (`4003`), `employee-service` (`4004`), and `notification-service` (`4006`) remain read-only and offline; live-mode checks ran against local HTTP contract harnesses, not live shared Auth Service processes. | Configure shared services `.env`, databases, matching `INTERNAL_SERVICE_TOKEN`, mount Gateway routes, and run 16-step live ecosystem E2E verification before go-live. |
| **REC-ID-RSK-05** | **MEDIUM (Deployment Prereq)** | **Transactional Email Provider Credentials Pending in Dev**: Local `.env` leaves `EMAIL_PROVIDER=DISABLED` (`503 EMAIL_DELIVERY_UNAVAILABLE` in non-test fail-closed mode); automated suite verified Resend/Brevo via mocked `fetch` and `NODE_ENV=test` transport harness, plus startup fail-fast validation in `NODE_ENV=production`. | Provision verified `RESEND_API_KEY`, `BREVO_API_KEY`, or TLS `SMTP_*` credentials before staging/production launch. |

---

## 10. Actual Verification Evidence

- **Backend Identity & Security Regression Tests (`npm --prefix recruitment-service test`)**: **10 test files passed (10), 40 tests passed (40)** (Vitest `4.1.12` + PGlite + isolated local HTTP contract harnesses):
  - [candidateIdentityVerificationAndRecovery.test.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/tests/integration/candidateIdentityVerificationAndRecovery.test.js): **4/4** passing (unverified signup isolation, HMAC OTP verification, `5`-attempt lockout, `60s` cooldown, email delivery rollback `503`, explicit org-scoped atomic `POST /api/v1/portal/claims` & non-disclosing `404 CLAIM_NOT_ELIGIBLE`, login lockout `429 ACCOUNT_LOCKED`, single-use reset token, change-password `tokenVersion` revocation `401 SESSION_REVOKED`, DB-down fail-closed `503`, fail-fast config validation, mocked HTTPS Resend/Brevo delivery, `setTestEmailTransport` prod guard, and `/verify-email` `429` rate limiter).
  - [candidateIdentityBoundary.test.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/tests/integration/candidateIdentityBoundary.test.js): **4/4** passing.
  - Other integration & unit suites (`storageAndDocumentSecurity.test.js`, `securityRegressionAudit.test.js`, `sharedServiceIntegration.test.js`, `fullRecruitmentLifecycle.test.js`, `rbacAndEmployeeManagement.test.js`, `subscriptionAndActivation.test.js`, `validationAndSecurity.test.js`, `utilsAndAdapters.test.js`): **32/32** passing.
- **Frontend Regression & Build (`npm --prefix client test` & `npm --prefix client run build`)**: **1 test file passed (1), 18 tests passed (18)** (including Candidate Signup OTP verification without pre-verify JWT, Forgot Password, Reset Password, Explicit Claim Card, Profile Security Change-Password auto-logout, `ORG_USER` -> `/app` redirect, and `503` retryable outage UI) + Vite production build passed.
- **Neon PostgreSQL Migrations (`db:migrate:status`)**: All **5** migrations (`20261110000001` through `20261112000001`) verified `up`.
- **Shared Services Unmodified**: `LastWriteTime` verified unchanged across all six shared service directories (`10-11-2026 17:02–17:11`).

