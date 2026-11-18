# Security Findings Register — NEXNUV Recruitment Microservice

**Last Updated:** 2026-11-12 (Phase 4.5 Final Audit)

---

## 1. Phase 4.5 Newly Identified & Resolved Findings (Recruitment-Owned)

| Finding ID | Severity | Component / File | Description | Resolution | Verification Status |
|---|---|---|---|---|---|
| `REC-P45-001` | **MEDIUM** | [vite.config.js](file:///c:/Users/rathj/NEXNUV-Recruitment/client/vite.config.js#L19-L24) | Frontend dev server `/api` proxy targeted `http://localhost:4005` (Attendance/Leave) instead of Recruitment Service port `4007`, breaking local Vite dev API routing when `VITE_USE_GATEWAY=false`. | Updated proxy `target` to `http://localhost:4007`. | **RESOLVED** (`vite build` + client tests pass after edit) |
| `REC-P45-002` | **HIGH** | [docker-compose.yml](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/docker-compose.yml#L46-L60) | `recruitment-service` container ran with `NODE_ENV: production` without passing Phase 4.4 required `CANDIDATE_TOKEN_HASH_SECRET` or `EMAIL_PROVIDER` / SMTP / Resend / Brevo env vars, causing guaranteed startup crash via `env.js` fail-fast validation. | Added required `CANDIDATE_TOKEN_HASH_SECRET` and transactional email configuration env vars matching `.env.example`. | **RESOLVED** (`env.js` fail-fast & valid baseline probes verified) |
| `REC-P45-003` | **MEDIUM** | [recruitment-service/.dockerignore](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/.dockerignore), [client/.dockerignore](file:///c:/Users/rathj/NEXNUV-Recruitment/client/.dockerignore) | Compose build contexts (`../recruitment-service`, `../client`) did not inherit root `.dockerignore`, risking accidental copy of `.env`, `node_modules/`, `storage/`, and `.pglite-data/` into image build contexts. | Created dedicated `.dockerignore` files in both service roots. | **RESOLVED** (files created and verified) |

---

## 2. Prior Recruitment Security Findings Verified Intact in Phase 4.5

| Series | Scope | Summary of Verified Hardening |
|---|---|---|
| `REC-SEC-001`..`REC-SEC-015` (Phase 4) | Core API, RBAC, Validation, Headers | Distinct secrets, live tenant/entitlement enforcement, prototype-key rejection (`validate.js`), file magic-byte verification (`storage.adapter.js`), payment amount/reference integrity (`subscription.service.js`), non-blocking downstream timeouts (`httpClient.js`). |
| `REC-ID-001`..`REC-ID-009` (Phase 4.2 & 4.4) | Candidate Identity & Auth Boundary | Separate `CANDIDATE_JWT_SECRET`, `candidate_accounts` table isolation, OTP email verification gate before login, explicit `POST /api/v1/portal/claims` ownership binding, `tokenVersion` revocation on password change/reset, brute-force lockouts, HMAC-SHA256 OTP/reset token storage (`CANDIDATE_TOKEN_HASH_SECRET`), fail-closed transactional `email.adapter.js`. |
| `REC-DOC-001`..`REC-DOC-010` (Phase 4.3 & 4.3.1) | Document & Cloudinary Security | Cloudinary official SDK (`cloudinary@^2.11.0`) with `type: 'authenticated'` / `access_mode: 'authenticated'`, backend-only credentials, PostgreSQL metadata & SHA-256 checksums, ClamAV `zINSTREAM` fail-closed scanning + quarantine support, authenticated `/api/v1/files/download` stream proxy enforcing tenant/candidate/interviewer-assignment authorization and `no-store` cache headers. |

---

## 3. Residual / Accepted Risks & External Prerequisites

| Risk ID | Severity | Area | Description & Current Mitigation / Owner Action |
|---|---|---|---|
| `REC-RSK-001` | **HIGH (Prod Prereq)** | Malware Scanning | `MALWARE_SCANNER_MODE=DISABLED` in dev `.env` / Compose default; production deployments handling untrusted resumes must run `clamd` with `MALWARE_SCANNER_MODE=CLAMAV` and `MALWARE_SCAN_REQUIRED=true`. |
| `REC-RSK-002` | **HIGH (Prod Prereq)** | Cloudinary Storage | `STORAGE_DRIVER=LOCAL_SECURE` in dev `.env` and empty `CLOUDINARY_*` vars. Production (`NODE_ENV=production`) enforces fail-fast unless `STORAGE_DRIVER=CLOUDINARY` with valid credentials or explicit `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true`. |
| `REC-RSK-007` | **HIGH (Prod Prereq)** | Transactional Email | `EMAIL_PROVIDER=DISABLED` in dev `.env`. Production (`NODE_ENV=production`) fails closed unless configured with live `RESEND`, `BREVO`, or TLS-enforced `SMTP` credentials (`EMAIL_FROM` + provider key). |
| `REC-RSK-003` | **MODERATE (Upstream CLI)** | `recruitment-service` Dependencies | `npm audit` / `npm audit --omit=dev` reports **5 moderate advisories** in transitive `sequelize-cli@6.6.3 -> js-beautify -> editorconfig / glob / minimatch` (`GHSA-3g3m-2fjr-6pw4`, `GHSA-g3hv-75wg-m249`). Express HTTP runtime has **0 advisories**. Upgrading requires upstream `sequelize-cli` release (`npm audit fix --force` downgrades to breaking `6.6.2`). Revisit when `sequelize-cli` drops/upgrades `js-beautify`. |
| `REC-RSK-004` | **LOW (External Platform)** | Subscription Quotas | Shared `platform-service` entitlements return active boolean + `features` array without numeric seat/job quota enforcement; Recruitment enforces binary active + `RECRUITMENT` feature entitlement. |
| `REC-BLK-001`..`002` | **CRITICAL (External Deployment)** | Shared Services (`4000–4004, 4006`) | Shared services are offline and `api-gateway/src/config/services.js` has no `RECRUITMENT` routes registered (read-only external codebase). Documented in [SHARED_SERVICE_INTEGRATION_BLOCKERS.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/SHARED_SERVICE_INTEGRATION_BLOCKERS.md). |

