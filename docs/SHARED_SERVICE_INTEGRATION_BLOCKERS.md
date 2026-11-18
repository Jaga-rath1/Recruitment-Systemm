# Shared Service Integration Blockers — NEXNUV Recruitment Microservice

**Audit Date:** 2026-11-12  
**Boundary Policy:** All six shared microservices (`api-gateway/`, `auth-service/`, `platform-service/`, `organization-service/`, `employee-service/`, `notification-service/`) are **strictly read-only** and owned by external teams. No files in those repositories were modified during Phases 1–4.5.

---

## 1. Live Connectivity & Runtime Blockers Observed

| Port | Shared Repository | Observed Socket State (2026-11-12) | Impact on Live Verification |
|---|---|---|---|
| `4000` | `api-gateway/` | `CLOSED/REFUSED` (`ECONNREFUSED`) | Blocks live Gateway routing tests for Frontend (`5173`) -> Gateway (`4000`) -> Recruitment (`4007`). |
| `4001` | `auth-service/` | `CLOSED/REFUSED` (`ECONNREFUSED`) | Blocks live Org/Platform Admin login, `/api/v1/auth/me` token introspection, and Org Admin activation provisioning. |
| `4002` | `platform-service/` | `CLOSED/REFUSED` (`ECONNREFUSED`) | Blocks live tenant entitlement lookup and Platform subscription provisioning on payment approval. |
| `4003` | `organization-service/` | `CLOSED/REFUSED` (`ECONNREFUSED`) | Blocks live active-organisation lookup and provisioning calls. |
| `4004` | `employee-service/` | `CLOSED/REFUSED` (`ECONNREFUSED`) | Blocks live employee directory validation and active-employee status checks. |
| `4006` | `notification-service/` | `CLOSED/REFUSED` (`ECONNREFUSED`) | Blocks live workflow notification delivery (`notificationService: "degraded"` in `/ready`). |

Live-mode fail-closed proof verified cleanly against Recruitment (`4007`) on 2026-11-12: when `INTEGRATION_MODE=live` runs against Neon PostgreSQL with shared ports closed, `GET /ready` deterministically returns **`503 not_ready`** (`database: "up"`, `authService: "down"`, `organisationService: "down"`, `platformService: "down"`, `employeeService: "down"`, `notificationService: "degraded"`).

---

## 2. Read-Only Codebase Configuration Blockers Found in `api-gateway`

Direct inspection of `api-gateway/src/config/services.js` confirmed:

1. **Missing Service Registry Entry (`REC-BLK-001`)**:
   - `services` only defines `AUTH`, `NOTIFICATION`, `PLATFORM`, `ORGANIZATION`, `EMPLOYEE`, `ATTENDANCE_LEAVE`, and Helpdesk keys. `RECRUITMENT` / `RECRUITMENT_SERVICE_URL=http://localhost:4007` is not yet registered.
2. **Unregistered Gateway Proxy Mounts & Auth Separation (`REC-BLK-002`)**:
   - **Public / Candidate Bypass Routes (must NOT invoke Auth Service `verifyToken` middleware)**:
     - `/api/v1/subscriptions` *(except `/platform-admin`)*, `/api/v1/subscriptions/activate`
     - `/api/v1/jobs/public`
     - `/api/v1/applications/public`
     - `/api/v1/auth/candidate` *(must mount **before** `/api/v1/auth` -> `services.AUTH`)*
     - `/api/v1/portal` *(including `/api/v1/portal/claims` — authenticated directly by Recruitment using `CANDIDATE_JWT_SECRET` & `tokenVersion`)*
     - `/api/v1/files/download` *(authenticated inside Recruitment for both Candidates and Org Employees)*
   - **Protected Org / Platform Routes (must pass Gateway `protect` and forward `x-user-*`, `x-organization-id`, `x-internal-token`)**:
     - `/api/v1/subscriptions/platform-admin`
     - `/api/v1/jobs`, `/api/v1/candidates`, `/api/v1/applications`, `/api/v1/interviews`, `/api/v1/offers`, `/api/v1/joining`, `/api/v1/organisations`, `/api/v1/roles`, `/api/v1/reports`, `/api/v1/audit-logs`
3. **`/api/v1/auth/me` Route Collision Note**:
   - `api-gateway` forwards `/api/v1/auth/me` to `auth-service`, whereas Recruitment's `/api/v1/auth/me` returns enriched `{ user, organisation, permissions }`. When running `VITE_USE_GATEWAY=true`, mount an explicit alias in `api-gateway` (e.g., `/api/v1/recruitment/auth/me` -> `services.RECRUITMENT`) or route Recruitment profile lookup cleanly.

---

## 3. External Infrastructure / Credential Blockers

- **Cloudinary Production Credentials (`REC-RSK-002`)**: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` are empty in local dev `.env`.
- **Transactional Email Credentials (`REC-RSK-007`)**: `EMAIL_PROVIDER=DISABLED` in local dev `.env`; live `RESEND`, `BREVO`, or TLS `SMTP` credentials are required for Candidate OTP verification and password recovery in production.
- **ClamAV Daemon (`REC-RSK-001`)**: `MALWARE_SCANNER_MODE=DISABLED` in dev; optional/recommended `clamd` TCP daemon (`3310`) required when `MALWARE_SCAN_REQUIRED=true`.
- **HRMS Job Sync Endpoint**: `HRMS_SERVICE_URL` is unset in `.env` (Recruitment gracefully enforces fail-closed `503 HRMS_SERVICE_NOT_CONFIGURED` in `live` mode while manual jobs remain fully operational).

