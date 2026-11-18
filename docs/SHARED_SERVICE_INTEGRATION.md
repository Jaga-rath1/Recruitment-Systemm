# NEXNUV Recruitment — Shared Microservices Integration Contracts & Architecture

**Last Verified**: 2026-11-11  
**Mode**: Read-only inspection of all six existing NEXNUV shared-service repositories under the workspace root. Zero modifications were made to any shared service.

---

## 1. Service Topology & Port Alignment

| Service | Folder (Read-Only) | Default Port | Health Endpoints | API Prefix |
|---|---|---|---|---|
| **API Gateway** | `api-gateway/` | `4000` | `GET /`, `GET /health`, `GET /healthy`, `GET /ready` | `/api/v1/*` (also selected root aliases) |
| **Auth Service** | `auth-service/` | `4001` | `GET /`, `GET /health`, `GET /healthy`, `GET /ready` | `/api/v1/auth/*` (also `/auth/*`, `/*`) |
| **Platform Service** | `platform-service/` | `4002` | `GET /health` | `/api/v1/platform/*` |
| **Organization Service** | `organization-service/` | `4003` | `GET /health` | `/api/v1/organizations/*` |
| **Employee Service** | `employee-service/` | `4004` | `GET /health` | `/api/v1/employees/*` |
| **Notification Service** | `notification-service/` | `4006` | `GET /`, `GET /health`, `GET /healthy`, `GET /ready` | `/api/v1/notifications/*`, `/api/v1/templates/*` |
| **Recruitment Service** | `recruitment-service/` | **`4007`** | `GET /health`, `GET /ready` | `/api/v1/*` |

> **Port Correction Fixed in Recruitment**: Recruitment previously defaulted to `PORT=4005`, mapped `EMPLOYEE_SERVICE_URL` to `4003`, `NOTIFICATION_SERVICE_URL` to `4004`, and `HRMS_SERVICE_URL` to `4006`. These conflicted with Attendance/Leave (`4005`), Organization (`4003`), Employee (`4004`), and Notification (`4006`). Recruitment now strictly runs on `PORT=4007` with exact target service ports (`4000–4004`, `4006`).

---

## 2. Shared Cross-Service Authentication, Headers & Error Format

### Verified Transport Conventions
1. **Internal Service Authentication Header**:
   - All downstream shared microservices authenticate gateway and service-to-service calls using:
     - `x-internal-token: <INTERNAL_SERVICE_TOKEN>`
     - `x-service-name: recruitment-service`
   - *Correction Applied*: Recruitment previously sent `X-Service-Key` (not recognized by any shared service). All adapters now send `x-internal-token` and `x-service-name` via the centralized HTTP client ([httpClient.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/common/httpClient.js)).
2. **Gateway-Forwarded Identity Headers**:
   - When requests pass through `api-gateway` (`serviceProxy.js` + `middlewares/auth.js`), untrusted client copies of trusted headers (`x-user-id`, `x-user-role`, `x-user-email`, `x-user-name`, `x-industry-id`, `x-internal-token`, `x-service-name`) are stripped first, then populated from verified JWT claims:
     - `x-user-id`
     - `x-user-role` (`super_admin`, `org_admin`, `service_manager`, `hr`, `manager`, `employee`, `agent`)
     - `x-user-email`
     - `x-user-name`
     - `x-organization-id` *(US `'z'` spelling in shared services)*
     - `x-tenant-id`
     - `x-industry-id`
     - `x-internal-token`
3. **Standard JSON Error Response**:
   - Shared services return `{ success: false, message: string, code?: string }` (Gateway proxy/404 responses may nest `error: { code, message, details }`).
   - Recruitment normalizes downstream HTTP errors and network timeouts into `AppError` subclasses (`503 DEPENDENCY_UNAVAILABLE` on unreachable/timed-out dependencies in `live` mode).

---

## 3. Verified Shared-Service Contracts

### A. API Gateway (`api-gateway`, Port `4000`)
- **Verified Features**:
  - CORS reflects caller `Origin` with `credentials: true`.
  - Protected routes run `verifyToken` -> `verifySession` (calls Auth Service `GET /api/v1/auth/internal/accounts/:id`, cached for `SESSION_CHECK_TTL_MS=30000`) -> `resolveOrganization`.
  - Rejects `mustChangePassword === true` tokens (`403 PASSWORD_CHANGE_REQUIRED`).
  - Forwards request path prefixed with `/api/v1` via `http-proxy` (10s timeout).
- **Verified Registered Routes**:
  - Auth: `/api/v1/auth`, `/auth` -> `4001`
  - Platform: `/api/v1/platform` -> `4002`
  - Organizations: `/api/v1/organizations` -> `4003`
  - Employees: `/api/v1/employees` -> `4004`
  - Attendance/Leave: `/api/v1/attendance*`, `/api/v1/timesheets`, `/api/v1/leave-*`, `/api/v1/device-attendance` -> `4005`
  - Notifications: `/api/v1/notifications`, `/notifications` -> `4006`
  - Helpdesk: `/api/v1/tickets`, `/teams`, `/agents`, `/service-managers`, `/sla`, `/attachments`, `/knowledge-base`, `/industries`, `/incident-*` -> `4002`
- **Deployment Dependency (Gateway Registration Required)**:
  - `api-gateway` does **not** currently declare `RECRUITMENT_SERVICE_URL=http://localhost:4007` or mount Recruitment endpoints (`/api/v1/jobs`, `/api/v1/applications`, `/api/v1/candidates`, `/api/v1/interviews`, `/api/v1/offers`, `/api/v1/joining`, `/api/v1/subscriptions`, `/api/v1/organisations`, `/api/v1/roles`, `/api/v1/portal`, `/api/v1/reports`, `/api/v1/audit-logs`, `/api/v1/files`).
  - Because `api-gateway` is strictly read-only, Gateway proxy route registration is documented as an external deployment dependency.
  - Meanwhile:
    - Recruitment's Gateway config ([gateway.config.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/gateway/gateway.config.js)) handles trusted Gateway headers (`x-internal-token` verified) whenever requests are routed through Gateway.
    - Frontend (`client`) uses `VITE_API_BASE_URL` (default `http://localhost:4007/api/v1`) and supports `VITE_API_GATEWAY_URL=http://localhost:4000/api/v1` when `VITE_USE_GATEWAY=true` once the Gateway registers Recruitment routes.

### B. Auth Service (`auth-service`, Port `4001`)
- **Verified JWT Contract**:
  - Claims signed by `auth-service`: `{ userId, employeeId, email, firstName, lastName, name, role, organizationId, tenantId, industryId, mustChangePassword? }`.
  - **No `iss` or `aud` claims** are set on `auth-service` JWTs (Recruitment's old `jwt.verify(..., { issuer, audience })` check rejected real Auth Service tokens; now fixed!).
  - **Zero Shared `JWT_SECRET` Assumption**: In `INTEGRATION_MODE=live`, Recruitment validates bearer tokens by calling `GET ${AUTH_SERVICE_URL}/api/v1/auth/me` (passing the caller's `Authorization: Bearer <token>`), which validates both signature and active DB user/tenant status inside Auth Service itself. When routed via API Gateway with valid `x-internal-token`, Recruitment can verify gateway-supplied identity against `GET /api/v1/auth/internal/accounts/:id`.
- **Verified Endpoints**:
  - `POST /api/v1/auth/login` (`{ email, password }` -> `{ success: true, token, user }`)
  - `GET /api/v1/auth/me` (`Authorization: Bearer` -> `{ success: true, user }`)
  - `GET /api/v1/auth/internal/accounts/:id` (`x-internal-token` -> `{ success: true, data: { status, role, organizationId } }`)
  - `POST /api/v1/auth/provision` (`Authorization: Bearer` org_admin/hr/super_admin -> `{ success: true, user, emailDelivered, tempPassword? }`)
  - `POST /api/v1/auth/internal/provision-agent` (`x-internal-token`, `{ email, name, firstName, lastName, role, organizationId }` -> `{ success: true, data: { user, tempPassword, isNew } }`)
  - `POST /api/v1/auth/setup-password` (`Authorization: Bearer` -> clears `mustChangePassword` & returns `{ token, user }`)
  - `PATCH /api/v1/auth/users/:id/status` (`Authorization: Bearer`, `{ status: 'active' | 'inactive' | 'suspended' }`)
  - `GET /api/v1/auth/industries`, `POST /api/v1/auth/register-tenant`, `GET /api/v1/auth/internal/tenants/:id`, `GET /api/v1/auth/internal/users`
- **Gaps / Blocker Notes**:
  - `auth-service` seeded roles are strictly: `super_admin`, `org_admin`, `service_manager`, `hr`, `manager`, `employee`, `agent`.
  - `auth-service` has **no** `candidate` role and `ALLOW_BOOTSTRAP_REGISTRATION=false` blocks self-registration (`403`). External Careers applicants therefore register/sign into the Candidate Portal via Recruitment's isolated `candidate_accounts` credential store (`aud: 'nexnuv-candidate-portal'`, locked strictly to `CANDIDATE` scope and incapable of accessing any organisation/admin route).
  - `auth-service` has no `/api/v1/internal/invitations/org-admin`, `/invitations/employee`, or `/users/activate`. Recruitment's `authAdapter` maps organisation admin activation in `live` mode to `POST /api/v1/auth/internal/provision-agent` (`role: 'org_admin'`) followed by temp-login + `POST /api/v1/auth/setup-password` so the user's chosen password is stored directly in `auth-service`.

### C. Platform Service (`platform-service`, Port `4002`)
- **Verified Auth**: Checks `x-internal-token`, `x-user-id`, `x-user-role`, `x-organization-id`. Admin routes require `x-user-role === 'super_admin'`.
- **Verified Endpoints**:
  - `GET /api/v1/platform/plans`
  - `GET /api/v1/platform/modules`, `GET /api/v1/platform/submodules`
  - `GET /api/v1/platform/subscriptions`, `POST /api/v1/platform/subscriptions`, `PATCH /api/v1/platform/subscriptions/:id`
  - `GET /api/v1/platform/organizations/:organizationId/subscription`
  - `GET /api/v1/platform/entitlements/me` (caller headers `x-user-id`, `x-user-role`, `x-organization-id`, `x-internal-token`) -> `{ success: true, data: { organizationId, active, reason, subscription, modules, features } }`
  - `GET /api/v1/platform/entitlements/organizations/:organizationId` (`x-user-role: super_admin`, `x-internal-token`)
- **Gap / Blocker Notes**:
  - `platform-service` manages plans, trial/active subscriptions, and module entitlements (`HRMS`, `EMPLOYEES`, etc.), not Recruitment wire-proof uploads (`PENDING_PAYMENT` / `PENDING_VERIFICATION` proof ledger). Recruitment retains ownership of `subscriptions` + `subscription_payments` proof review ledger and integrates with `organization-service` + `platform-service` upon verification approval and on every tenant entitlement check (`requireTenant`).
  - `platform-service` catalog migration currently seeds `HRMS` and submodules (`EMPLOYEES`, `ATTENDANCE`, `LEAVE`, `TIMESHEET`). Until a `RECRUITMENT` module/submodule is added to Platform plans, `platformAdapter.checkOrganisationAccess()` requires `entitlements.active === true` (active org + non-expired active/trial subscription) and optionally checks feature code `RECRUITMENT` if `PLATFORM_REQUIRE_RECRUITMENT_FEATURE=true`.

### D. Organization Service (`organization-service`, Port `4003`)
- **Verified Auth**: Checks `x-internal-token`, `x-user-id`, `x-user-role`, `x-organization-id`.
- **Verified Endpoints**:
  - `GET /api/v1/organizations` (`super_admin` list)
  - `POST /api/v1/organizations` (`super_admin` create `{ name, code, email?, phone?, address?, city?, state?, country?, timezone?, status? }`)
  - `GET /api/v1/organizations/:id` -> `{ success: true, data: { id, name, code, email, phone, address, city, state, country, timezone, status } }` (`status`: `'active' | 'inactive'`)
  - `PATCH /api/v1/organizations/:id`, `PATCH /api/v1/organizations/:id/status`
  - Sub-resources: `/api/v1/organizations/:organizationId/{settings,branches,departments,designations,working-hours,shifts,holidays,teams}`
- **Integration Behavior**:
  - New [organisation.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/organisation/organisation.adapter.js) resolves org metadata/status in `live` mode from port `4003` and enforces `status === 'active'` in `requireTenant` (returning `403 ORGANISATION_INACTIVE` if inactive/suspended, `404`/`403` if unknown, `503` if unavailable).

### E. Employee Service (`employee-service`, Port `4004`)
- **Verified Auth**: Checks `x-internal-token`, `x-user-id`, `x-user-role`, `x-organization-id`, `x-service-name` (`isService: !!req.headers['x-service-name']`), plus `requireFeature('EMPLOYEES')` (which service calls bypass when `x-service-name` is set) and `requireManagerOrAbove` / `requireHrOrAdmin`.
- **Verified Endpoints**:
  - `GET /api/v1/employees` (`page, limit, search, status, branchId, departmentId, ...`) -> `{ success: true, data: [...], pagination: {...} }`
  - `GET /api/v1/employees/:id` -> `{ success: true, data: employee }`
  - `GET /api/v1/employees/me`, `GET /api/v1/employees/scope`
  - `POST /api/v1/employees` -> requires `{ employeeCode, firstName, lastName, ... }` (`status`: `'draft' | 'onboarding' | 'active' | 'inactive' | 'on_leave' | 'terminated'`)
  - `PATCH /api/v1/employees/:id/status`, `POST /api/v1/employees/:id/provision`
- **Integration Behavior**:
  - Recruitment normalizes Employee Service entities (`id -> employeeId`, `[firstName, lastName] -> fullName`, `workEmail || email -> email`, `status` active check) without duplicating master employee records.

### F. Notification Service (`notification-service`, Port `4006`)
- **Verified Auth**: `x-internal-token`, `x-service-name` (`isService: true` passes `requireNotifier`), `x-user-id`, `x-user-role`, `x-organization-id` (REQUIRED UUID for all routes due to `requireOrgContext`).
- **Verified Endpoints**:
  - `POST /api/v1/notifications`
  - Required JSON body fields (`validateCreate`):
    - `userId`: non-empty string (`<=255` chars; Recruitment resolves target `authUserId`/`employeeId`/candidate reference or email identifier)
    - `type`: optional string (`<=100` chars)
    - `title`: required string (`<=255` chars) unless `templateParams` supplied
    - `message`: required string (`<=5000` chars) unless `templateParams` supplied
    - `recipientEmail`: optional email (triggers SMTP / Resend delivery when `sendEmail !== false`)
    - `recipientName`: optional string
    - `data`: optional plain object (includes `idempotencyKey` support for 5-minute deduplication)
    - `sendEmail`: boolean
- **Failure Isolation**:
  - Notification dispatch uses bounded timeout (`5000ms`), never exposes secrets or tokens in logs, and catches HTTP/network errors safely so failed notification delivery never fails Recruitment state transitions.
  - Events occurring before an organisation UUID exists (`SUBSCRIPTION_SUBMITTED` prior to org provisioning) cannot pass `requireOrgContext` on `notification-service` and are safely skipped/logged cleanly in `live` mode.
  - **Candidate Security OTP & Password Reset Blocker (`notification-service` Left Read-Only)**: `POST /api/v1/notifications` requires tenant `x-organization-id` (`requireOrgContext` -> `403` for tenantless external candidates), persists message payloads & `data` in PostgreSQL, and silently falls back to `ethereal`/`jsonTransport` returning `sent: true` instead of failing closed. Recruitment therefore implements direct fail-closed transactional email delivery in [email.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/email/email.adapter.js) (`RESEND` | `BREVO` | `SMTP` | `DISABLED`) exclusively for candidate email verification OTPs and password reset tokens while leaving `notification-service` (`4006`) untouched.

---

## 4. Integration Modes (`standalone` vs `live`)

| Feature | `INTEGRATION_MODE=standalone` (Dev/Test Only) | `INTEGRATION_MODE=live` |
|---|---|---|
| **Auth / JWT** | Built-in dev credential store + local HS256 JWT verification | Verifies `ORG_USER`/`PLATFORM_ADMIN` tokens live via Auth Service `/api/v1/auth/me` (or verified Gateway headers); candidate portal tokens strictly scoped to `CANDIDATE` |
| **Organization Lookup** | In-memory standalone org fixture store | HTTP `GET /api/v1/organizations/:id` on Port `4003`; rejects inactive/unknown orgs; fails `503` if offline |
| **Employees** | In-memory standalone employee fixture store | HTTP `/api/v1/employees` on Port `4004`; enforces active status & org association |
| **Platform Subscription** | Local `subscriptions` table + standalone ticket stub | Local payment proof verification + HTTP sync to Organization Service (`4003`) & Platform Service (`4002`) entitlements |
| **Notifications** | In-memory spy array + structured log | HTTP `POST /api/v1/notifications` on Port `4006` with fail-safe error handling (`delivered: false`, never fails tx) |
| **HRMS Job Sync** | `DEV_FIXTURE_HRMS_JOBS` (if `HRMS_SERVICE_URL` unset) | HTTP call when `HRMS_SERVICE_URL` configured; explicit error (`503` / `501`) if unconfigured/unreachable |

**Production Safeguard**: `env.js` explicitly throws a fatal startup error when `NODE_ENV=production` if `INTEGRATION_MODE !== 'live'` or `INTERNAL_SERVICE_TOKEN` is missing. Mock/standalone adapters can never execute in production.

---

## 5. Shared Service Startup Readiness Checklist (Developer Runbook)

Because all six shared NEXNUV service folders under the workspace root are strictly read-only, none currently contain `.env` or `node_modules/` (verified 2026-11-11: `.env: False`, `node_modules: False` across all six folders), and ports `4000–4004, 4006` all returned `ECONNREFUSED`.

### Recommended Startup Order & Service Inventory

Start services in dependency order after configuring each service's `.env` from its `.env.example` (do **not** reuse uninitialized placeholder tokens; align `INTERNAL_SERVICE_TOKEN` identically across all services):

1. **Organization Service (`organization-service/`) — Port `4003`** *(No upstream service dependencies)*
   - Required env: `PORT=4003`, `SERVICE_NAME=organization-service`, `DATABASE_URL` (PostgreSQL with SSL; schema `organization`), `INTERNAL_SERVICE_TOKEN`
   - Prepare & start: `npm install`, `npm run db:migrate` (10 migrations), optionally `npm run db:seed`, then `npm run dev` (or `npm start`)
   - Health check: `GET http://localhost:4003/health`
2. **Auth Service (`auth-service/`) — Port `4001`** *(Independent; serves JWT/account verification)*
   - Required env: `PORT=4001`, `SERVICE_NAME=auth-service`, `DATABASE_URL` (PostgreSQL with SSL; schema `auth`; also supports `AUTH_DATABASE_URL`), `JWT_SECRET`, `JWT_EXPIRES_IN=1d`, `INTERNAL_SERVICE_TOKEN`, `APP_URL`, `ALLOW_BOOTSTRAP_REGISTRATION=false`, SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`) / `RESEND_API_KEY`
   - Prepare & start: `npm install`, `npm run db:migrate` (11 migrations), `npm run db:seed`, seed platform admin via `SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... node scripts/create-super-admin.js`, then `npm run dev`
   - Health checks: `GET http://localhost:4001/health`, `GET http://localhost:4001/healthy`, `GET http://localhost:4001/ready`
3. **Platform Service (`platform-service/`) — Port `4002`** *(Depends on Organization Service `4003`)*
   - Required env: `PORT=4002`, `SERVICE_NAME=platform-service`, `DATABASE_URL` (PostgreSQL with SSL; schema `platform`), `ORGANIZATION_SERVICE_URL=http://localhost:4003`, `INTERNAL_SERVICE_TOKEN`
   - Prepare & start: `npm install`, `npm run db:migrate` (8 migrations), `npm run db:seed`, then `npm run dev`
   - Health check: `GET http://localhost:4002/health`
4. **Notification Service (`notification-service/`) — Port `4006`** *(Independent DB + SMTP/Resend delivery)*
   - Required env: `PORT=4006`, `SERVICE_NAME=notification-service`, `DATABASE_URL` (or `NOTIFICATION_DATABASE_URL`, schema `notification`), `INTERNAL_SERVICE_TOKEN`, SMTP/`RESEND_API_KEY`, `FRONTEND_APP_URL`
   - Prepare & start: `npm install`, `npm run db:migrate` (2 migrations), `npm run db:seed`, then `npm run dev`
   - Health checks: `GET http://localhost:4006/health`, `GET http://localhost:4006/healthy`, `GET http://localhost:4006/ready`
5. **Employee Service (`employee-service/`) — Port `4004`** *(Depends on Auth `4001`, Platform `4002`, Organization `4003`, Notification `4006`)*
   - Required env: `PORT=4004`, `SERVICE_NAME=employee-service`, `DATABASE_URL` (PostgreSQL with SSL; schema `employee`), `AUTH_SERVICE_URL=http://localhost:4001`, `PLATFORM_SERVICE_URL=http://localhost:4002`, `ORGANIZATION_SERVICE_URL=http://localhost:4003`, `NOTIFICATION_SERVICE_URL=http://localhost:4006`, `INTERNAL_SERVICE_TOKEN`, `ENTITLEMENT_CACHE_TTL_MS=15000`
   - Prepare & start: `npm install`, `npm run db:migrate` (3 migrations), `npm run db:seed`, then `npm run dev`
   - Health check: `GET http://localhost:4004/health`
6. **API Gateway (`api-gateway/`) — Port `4000`** *(Depends on `4001`, `4002`, `4003`, `4004`, `4006`; see Section 6 for Recruitment registration)*
   - Required env: `PORT=4000`, `SERVICE_NAME=api-gateway`, `JWT_SECRET` (must match Auth Service!), `INTERNAL_SERVICE_TOKEN` (must match all services!), `SESSION_CHECK_TTL_MS=30000`, `CORS_ORIGINS=http://localhost:5173,http://localhost:3000`, `AUTH_SERVICE_URL=http://localhost:4001`, `PLATFORM_SERVICE_URL=http://localhost:4002`, `ORGANIZATION_SERVICE_URL=http://localhost:4003`, `EMPLOYEE_SERVICE_URL=http://localhost:4004`, `ATTENDANCE_LEAVE_SERVICE_URL=http://localhost:4005`, `NOTIFICATION_SERVICE_URL=http://localhost:4006`
   - Prepare & start: `npm install`, `npm run dev`
   - Health checks: `GET http://localhost:4000/health`, `GET http://localhost:4000/healthy`, `GET http://localhost:4000/ready`
7. **Recruitment Service (`recruitment-service/`, Port `4007`) & Frontend (`client/`, Port `5173`)**
   - Switch `INTEGRATION_MODE=live` in `recruitment-service/.env`, set matching `INTERNAL_SERVICE_TOKEN`, keep `HRMS_SERVICE_URL` empty unless a real HRMS service exists, run `npm run db:migrate` (already verified `up` on Neon), and start `npm run dev` (`GET http://localhost:4007/health` + `GET http://localhost:4007/ready`).
   - Start frontend (`client/`): `npm run dev` (`http://localhost:5173`; keep `VITE_USE_GATEWAY=false` until Gateway registration below is completed externally).

---

## 6. External API Gateway Registration Specification (Do Not Modify `api-gateway/`)

Inspection of `api-gateway/src/config/env.js`, `api-gateway/src/config/services.js`, `api-gateway/src/app.js`, and `api-gateway/src/proxy/serviceProxy.js` confirms the exact external changes needed in `api-gateway` by the Gateway maintainer:

1. **Upstream Environment & Service Map**:
   - Add `RECRUITMENT_SERVICE_URL=http://localhost:4007` to `api-gateway` config (`services.RECRUITMENT = normalizeUrl(env.RECRUITMENT_SERVICE_URL, "http://127.0.0.1:4007")`).
2. **Route Ordering & Auth Middleware Classification** *(Specific public/candidate mounts MUST precede general protected prefixes in Express)*:
   - **Public bypass routes (`stripTrustedHeaders, createProxy(services.RECRUITMENT)`)**:
     - `/api/v1/jobs/public/careers`
     - `/api/v1/applications/public` *(forwards optional `Authorization` Bearer candidate token untouched)*
     - `/api/v1/subscriptions` *(POST request, GET status, POST payment proof, POST activate)* — must sit **after** `/api/v1/subscriptions/platform-admin` with `...protect`!
   - **Candidate Auth, Portal & Authenticated Document Download bypass routes (`stripTrustedHeaders, createProxy(services.RECRUITMENT)`)**:
     - `/api/v1/auth/candidate` *(must mount **before** `app.use(["/api/v1/auth", "/auth"], ... createProxy(services.AUTH))`; covers `POST /register`, `/verify-email`, `/resend-verification`, `/login`, `/forgot-password`, `/reset-password`, and `/change-password` listed in `gateway.config.js` `candidateAuthBypassPaths` without colliding with Auth Service's `/api/v1/auth/login`)*
     - `/api/v1/portal` *(including `POST /api/v1/portal/claims`; critical: Candidate JWTs use Recruitment's `CANDIDATE_JWT_SECRET`, `candidate_accounts`, and live `tokenVersion`/`emailVerified`/`isActive` checks, NOT Auth Service's `JWT_SECRET` or `users` table; applying Gateway `protect = [verifyToken, verifySession, resolveOrganization]` would wrongly reject Candidate Portal tokens with `401`)*
     - `/api/v1/files/download` *(now requires authentication inside Recruitment for **both** Org Users and Candidates; must use `stripTrustedHeaders` so valid Candidate JWTs in `Authorization: Bearer` reach Recruitment without failing Gateway `verifyToken`)*
   - **Protected Tenant & Platform Admin routes (`...protect, createProxy(services.RECRUITMENT)`)**:
     - `/api/v1/subscriptions/platform-admin`
     - `/api/v1/jobs`, `/api/v1/candidates`, `/api/v1/applications`, `/api/v1/interviews`, `/api/v1/offers`, `/api/v1/joining`, `/api/v1/organisations`, `/api/v1/roles`, `/api/v1/reports`, `/api/v1/audit-logs`
3. **Auth `/me` Collision Note**:
   - `api-gateway` routes `/api/v1/auth/me` to Auth Service (`4001`), whereas Recruitment's `GET /api/v1/auth/me` enriches `{ user, organisation, permissions }`. When running `VITE_USE_GATEWAY=true`, mount an explicit Gateway alias (e.g., `/api/v1/recruitment/auth/me` -> `services.RECRUITMENT`) or resolve Recruitment profile after Gateway `/api/v1/auth/me`.
4. **Forwarded Headers Confirmed on `proxyReq` + `verifyToken`**:
   - `x-user-id`, `x-user-role`, `x-user-email`, `x-user-name`, `x-organization-id`, `x-tenant-id`, `x-industry-id`, `x-internal-token`, `x-service-name` (stripped cleanly from untrusted callers first).

---

## 7. Phase 3 Live Verification, Failure Probes & Readiness Classification

### Service-by-Service Classification (As of 2026-11-11)

| Service / Component | Port | Classification | Verification Evidence & Unresolved Dependencies |
|---|---|---|---|
| **Recruitment Service** (`recruitment-service/`) + Neon DB | `4007` | **Live verified** (process boot, Neon DB, `live`-mode fail-closed & `/ready` probes) · **Blocked** (full 16-step live ecosystem E2E) | Live `node src/server.js` (`INTEGRATION_MODE=live`) on Neon PostgreSQL verified: `/health` (`200`), `/ready` (`503 not_ready` with `database: "up"` & mandatory upstream deps `"down"`), `/api/v1/gateway/manifest` (`200`), `/api/v1/jobs/public/careers` (`200`), unauthenticated `/files/download` (`401`), missing/malformed/expired Candidate JWT (`401`), spoofed `x-internal-token` (`401`), Auth Service offline on `/api/v1/jobs` & `/api/v1/auth/login` (`503 DEPENDENCY_UNAVAILABLE`). `NODE_ENV=production` fail-fast (env & DB CLI) verified. Neon migrations `20261110000001` & `20261111000001` both `up`. |
| **API Gateway** (`api-gateway/`) | `4000` | **Blocked** (External config/process offline) · Adapter **Implemented but not live verified** | Port `4000` returned `ECONNREFUSED`; no `.env` or `node_modules`; does not register Recruitment routes. Gateway header/spoofing & manifest verified via `[Local HTTP Contract Test Harness]`. |
| **Auth Service** (`auth-service/`) | `4001` | **Blocked** (External config/process offline) · Adapter **Implemented but not live verified** | Port `4001` returned `ECONNREFUSED`; no `.env` or `node_modules`. Live fail-closed `503` verified against real offline port `4001`; async `/api/v1/auth/me`, `/internal/accounts/:id`, duplicate-identity guard & invalid/expired JWT rejection verified in `[Local HTTP Contract Test Harness]`. |
| **Platform Service** (`platform-service/`) | `4002` | **Blocked** (External config/process offline) · Adapter **Implemented but not live verified** | Port `4002` returned `ECONNREFUSED`; no `.env` or `node_modules`. Subscription entitlement, inactive-plan denial, and offline `503` verified in `[Local HTTP Contract Test Harness]`. |
| **Organization Service** (`organization-service/`) | `4003` | **Blocked** (External config/process offline) · Adapter **Implemented but not live verified** | Port `4003` returned `ECONNREFUSED`; no `.env` or `node_modules`. Active/inactive org gate, GET `503` retry, timeout `503`, and offline `503` verified in `[Local HTTP Contract Test Harness]`. |
| **Employee Service** (`employee-service/`) | `4004` | **Blocked** (External config/process offline) · Adapter **Implemented but not live verified** | Port `4004` returned `ECONNREFUSED`; no `.env` or `node_modules`. Directory lookup, active/terminated guard, cross-org isolation, email deduplication, and offline `503` verified in `[Local HTTP Contract Test Harness]`. |
| **Notification Service** (`notification-service/`) | `4006` | **Blocked** (External config/process offline) · Adapter **Implemented but not live verified** | Port `4006` returned `ECONNREFUSED`; no `.env` or `node_modules`. REST delivery (`POST /api/v1/notifications`) and non-fatal HTTP-500 tolerance verified in `[Local HTTP Contract Test Harness]`. |
| **Frontend Client** (`client/`) | `5173` | **Implemented but not live verified** (live Gateway/Auth offline) | Vitest (`10/10`, including `503` outage `ErrorState` & token preservation in `ProtectedRoute`) and `vite build` passed. Full browser E2E requires live shared services. |

> **Production Readiness Decision**: **B. CONDITIONALLY READY** — **LIVE DEPLOYMENT BLOCKED UNTIL EXTERNAL ACTIONS COMPLETE.** Recruitment-side security hardening, fail-closed guards, Neon migrations, duplicate-identity safeguards, contract tests (`26/26` backend, `12/12` frontend at Phase 3; expanded to `36/36` backend, `14/14` frontend through Phase 4.3.1), `vite build`, and live-mode fail-closed HTTP probes passed; however, the 6 shared NEXNUV services remain offline without `.env`/`node_modules` (`ECONNREFUSED`), `api-gateway` does not yet mount Recruitment routes, and live Cloudinary / ClamAV credentials remain deployment prerequisites. See [FINAL_SECURITY_AUDIT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/FINAL_SECURITY_AUDIT.md), [STORAGE_SECURITY_AUDIT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/STORAGE_SECURITY_AUDIT.md), and [PRODUCTION_READINESS_REPORT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/PRODUCTION_READINESS_REPORT.md).


---

## 8. Phase 4.5 Re-Verification (2026-11-12)
- Verified all 6 shared service repositories remain strictly unmodified (`LastWriteTime` unchanged; ports `4000–4004, 4006` offline `CLOSED/REFUSED`).
- Fixed local Vite `/api` proxy target (`4005` -> `4007`), added Phase 4.4 runtime variables to [docker-compose.yml](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/docker-compose.yml), and added service-level `.dockerignore` files.
- Re-verified `40/40` backend tests, `18/18` frontend tests, `5/5` Neon migrations `up`, and live `/health` `200` + `/ready` `503 not_ready`. See [SHARED_SERVICE_INTEGRATION_BLOCKERS.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/SHARED_SERVICE_INTEGRATION_BLOCKERS.md) and [END_TO_END_VERIFICATION_MATRIX.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/END_TO_END_VERIFICATION_MATRIX.md).
