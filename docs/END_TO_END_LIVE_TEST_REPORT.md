# End-to-End Live Test Report — NEXNUV Recruitment (Phase 4.6)

**Validation Date:** 2026-11-12  
**Live Ecosystem Status:** **BLOCKED** *(Ports `4000–4004, 4006, 3310` `CLOSED_ECONNREFUSED`; live Cloudinary & Email credentials unprovisioned; Docker daemon offline.)*  
**Independent Recruitment / Neon DB Proof:** **PASS**

---

## 1. Live System & Neon PostgreSQL Checks Executed

| Check | Status | Direct Observed Evidence |
|---|---|---|
| Live Neon DB Authentication & Health | **PASS** | `checkDatabaseHealth()` -> `authenticated: true` |
| Live Neon Schema & Migrations (`SequelizeMeta`) | **PASS** | All 5 migrations `up` (`20261110000001`..`20261112000001`); `22` tables (`SequelizeMeta` + 21 Recruitment tables); `86` PostgreSQL indexes; `19` foreign keys. |
| Neon Read-Only Transaction Probe | **PASS** | `seq.transaction()` + `SELECT 1` + `rollback()` -> `txRollbackOk: true`. |
| Live Service Boot (`standalone` on Neon) | **PASS** | `node src/server.js` -> `GET /health` `200`, `GET /ready` `200 ready` (`database: "up"`). |
| Live Service Boot (`INTEGRATION_MODE=live` on Neon) | **PASS** | `node src/server.js` (`live`) -> `GET /health` `200`, `GET /ready` **`503 not_ready`** (`database: "up"`, `authService: "down"`, `organisationService: "down"`, `platformService: "down"`, `employeeService: "down"`, `notificationService: "degraded"`). |
| Live ClamAV Offline Fail-Closed Socket Test | **PASS** | `scanDocumentBuffer` vs `127.0.0.1:3310` -> `503 MALWARE_SCANNER_UNAVAILABLE` (`SCAN_FAILED`, `ECONNREFUSED`). |
| Production Env Fail-Fast Probes (`env.js`) | **PASS** | `8/8` invalid prod configs blocked; valid `live` + `CLOUDINARY` + `RESEND` config passed. |

---

## 2. Twenty-Three Step End-to-End Workflow Verification Table

Per Phase 4.6 rules, mocked/PGlite automated integration tests are **never** labeled as live E2E passes.

| Step | Workflow Action | Live Ecosystem E2E Status | Blocking Dependency / Owner | Recruitment Automated Verification |
|---:|---|---|---|---|
| 1 | Employee authenticates through Auth Service (`4001`) | **BLOCKED** | `auth-service` (`4001`) offline | **PASS** (Vitest + HTTP harness) |
| 2 | Organisation context resolved (`4003` / `4002`) | **BLOCKED** | `organization-service` (`4003`) & `platform-service` (`4002`) offline | **PASS** (Vitest + HTTP harness) |
| 3 | Recruiter accesses Recruitment via Gateway (`4000`) | **BLOCKED** | `api-gateway` (`4000`) offline & unregistered | **PASS** (Vitest RBAC + Gateway manifest) |
| 4 | Recruiter creates a job | **BLOCKED** | Gateway (`4000`) & Auth (`4001`) offline | **PASS** (Vitest PGlite) |
| 5 | Recruiter publishes the job | **BLOCKED** | Gateway (`4000`) & Auth (`4001`) offline | **PASS** (Vitest PGlite) |
| 6 | Candidate-facing job API returns published job | **BLOCKED** | Gateway (`4000`) unregistered | **PASS** (Vitest PGlite + Client Vitest) |
| 7 | Candidate registers | **BLOCKED** | `EMAIL_PROVIDER=DISABLED` in `.env` | **PASS** (Vitest PGlite) |
| 8 | Email OTP is delivered | **BLOCKED** | Live Resend/Brevo/SMTP creds unprovisioned | **PASS** (Vitest mocked transport) |
| 9 | Candidate verifies email OTP | **BLOCKED** | Depends on Step 7–8 live inbox test | **PASS** (Vitest PGlite) |
| 10 | Candidate logs in | **BLOCKED** | Live Gateway (`4000`) unregistered | **PASS** (Vitest PGlite + Client Vitest) |
| 11 | Candidate submits application + resume upload | **BLOCKED** | Live Cloudinary (`CLOUDINARY_*` unset) | **PASS** (Vitest PGlite + magic-byte tests) |
| 12 | Candidate accesses own application tracking | **BLOCKED** | Live Gateway (`4000`) unregistered | **PASS** (Vitest PGlite + internalRemark filtering) |
| 13 | Recruiter screens application | **BLOCKED** | `employee-service` (`4004`) & `notification-service` (`4006`) offline | **PASS** (Vitest PGlite) |
| 14 | Technical interviewer receives assignment | **BLOCKED** | Auth (`4001`) & Employee (`4004`) offline | **PASS** (Vitest PGlite + salary redaction check) |
| 15 | Technical interviewer submits feedback | **BLOCKED** | Auth (`4001`) & Notification (`4006`) offline | **PASS** (Vitest PGlite + round isolation) |
| 16 | Senior reviewer completes behavioural/managerial review | **BLOCKED** | Auth (`4001`) & Notification (`4006`) offline | **PASS** (Vitest PGlite + role isolation) |
| 17 | Authorized HR accesses/enters salary details | **BLOCKED** | Auth (`4001`) offline | **PASS** (Vitest PGlite + RBAC enforcement) |
| 18 | Final HR generates offer & uploads offer letter | **BLOCKED** | Live Cloudinary & Notification (`4006`) offline | **PASS** (Vitest PGlite + offer state machine) |
| 19 | Candidate accesses/responds to own offer | **BLOCKED** | Live Gateway (`4000`) & Notification (`4006`) | **PASS** (Vitest PGlite + cross-candidate denial) |
| 20 | Candidate receives joining details / joining letter flow | **BLOCKED** | Live Cloudinary & Notification (`4006`) | **PASS** (Vitest PGlite + `HIRED` stage lock) |
| 21 | Authorized employee downloads document | **BLOCKED** | Live Cloudinary private fetch | **PASS** (Vitest PGlite + HMAC proxy stream) |
| 22 | Unauthorized user denied access | **BLOCKED** | Live Gateway (`4000`) & Auth (`4001`) | **PASS** (Vitest PGlite `401`/`403` isolation suite) |
| 23 | Candidate logout / password reset `tokenVersion` invalidation | **BLOCKED** | Live Email delivery & Gateway (`4000`) | **PASS** (Vitest PGlite + Client Vitest) |

---

## 3. Post-Final-Edit Regression & Security Verification

Executed cleanly after the final edit (`infrastructure/docker-compose.yml`):

1. **Backend Syntax Check**: `node --check` on all `.js` under `recruitment-service/src/` -> `SyntaxCheckErrors=0` (**PASS**).
2. **Backend Automated Suite (`npm --prefix recruitment-service test`)**: **10/10 files passed, 40/40 tests passed** (`0` failed, `0` skipped; run outside sandbox due to PGlite local socket `EACCES` inside Windows sandbox) (**PASS**).
3. **Frontend Automated Suite (`npm --prefix client test`)**: **1/1 file passed, 18/18 tests passed** (`0` failed, `0` skipped) (**PASS**).
4. **Frontend Vite Build (`npm --prefix client run build`)**: **Passed** (`2159` modules transformed) (**PASS**).
5. **Neon DB Migrations (`sequelize-cli db:migrate:status`)**: **5/5 `up`** (**PASS**).
6. **Dependency Security Audits (`npm audit --omit=dev`)**:
   - `client/`: **`0 vulnerabilities`** (**PASS**).
   - `recruitment-service/`: **`5 moderate`** (`glob`, `minimatch` inside CLI tool `sequelize-cli@6.6.3 -> js-beautify -> editorconfig`), **`0 critical`**, **`0 high`**, **`0 low`**.
7. **Payment Verification (Section 10)**: Invoice calculation (`PLAN_PRICING`), currency check, `AMOUNT_MISMATCH`, duplicate `paymentReference` blocking, idempotency, single-use `activationTokenHash`, and expiry checks verified via `subscription.service.js` + `subscriptionAndActivation.test.js` (**PASS** static/PGlite); Platform Service (`4002`) live entitlement & org provisioning calls remain **BLOCKED** (`4002` offline), and no external card gateway SDK exists in scope (bank transfer proof ledger architecture).

