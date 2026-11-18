# NEXNUV Recruitment — Application Security Audit Report

**Audit Date:** November 18, 2026  
**Scope:** `recruitment-service` (Express/Sequelize/PostgreSQL) & `client` (React/Vite)

---

## 1. Executive Security Summary

A comprehensive security review was conducted across authentication, four-portal RBAC authorization, multi-tenant isolation, API input validation, file upload handling, offer salary governance, error handling, dependency security, and secret hygiene.

- **Critical Findings Remaining:** `0`
- **High Findings Remaining:** `0`
- **Medium Findings Remediated During Audit:** `3` (Salary approval forgery defense, Candidate Portal internal metadata leakage, Health-probe rate-limit DoS vector)
- **Low / Informational Findings Documented:** `3` (Public `GET /subscriptions/:id` UUID knowledge model, `sequelize-cli` dev/CLI moderate transitive CVEs, ClamAV disabled in default local config)

---

## 2. Findings Identified & Remediated During Audit

| ID | Severity | Component | Finding | Remediation Applied | Verification |
| :-: | :---: | :--- | :--- | :--- | :--- |
| **SEC-01** | **High** | [offer.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/offer/offer.service.js#L25-L47) | `parseSalaryApproval` fell back to `termsSummary.includes('[SALARY_APPROVED]')`, and `embedSalaryApproval` did not strip `[SALARY_APPROVED]` or multi-line `<!--SALARY_APPROVAL:...-->` tags from user-supplied input, creating a salary-approval bypass vector via `termsSummary` marker injection. | Added `stripSalaryApprovalMetadata()` stripping all multi-line `<!--SALARY_APPROVAL:...-->` and `[SALARY_APPROVED]` markers; anchored `parseSalaryApproval` strictly to the server-written start-of-string header (`^<!--SALARY_APPROVAL:(\{[^\r\n]*?\})-->`) and removed the plaintext fallback. | Verified in [productionReadinessHardening.test.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/tests/integration/productionReadinessHardening.test.js) (forged draft & immediate send both rejected with `403 SALARY_APPROVAL_REQUIRED`). |
| **SEC-02** | **Medium** | [tracking.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/tracking/tracking.service.js#L95-L98) | Candidate Portal (`GET /api/v1/portal/overview`) returned raw `offer.termsSummary`, exposing internal `<!--SALARY_APPROVAL:{approvedBy, approvedRole, notes}-->` JSON metadata to candidates. | Applied `stripSalaryApprovalMetadata(app.offer.termsSummary)` before serializing candidate responses. | Verified in `productionReadinessHardening.test.js` (`termsSummary` clean of approval tags). |
| **SEC-03** | **Medium** | [rateLimiter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/rateLimiter.js#L4-L17) | `apiRateLimiter` throttled `/health`, `/healthy`, and `/ready` endpoints, allowing high-traffic ingress IPs to trigger HTTP `429` on load-balancer / Kubernetes liveness & readiness probes (availability DoS). | Updated `apiRateLimiter.skip` to exempt `/health`, `/healthy`, and `/ready`. | Verified via route audit & load tests. |
| **SEC-04** | **Medium** | [auth.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/auth/auth.adapter.js#L272-L307) & [platformAdminOrganisationRecovery.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/subscription/platformAdminOrganisationRecovery.service.js#L196-L270) | Organisation Admin password reset previously lacked a single-use cryptographic token (`PASSWORD_RESET_REQUESTED` was omitted from `NOTIFICATION_EVENTS`) and standalone mode could collide with unrelated external Auth Service roles on `:4001`. | Implemented SHA-256 domain-separated (`ORG_PASSWORD_RESET:`) single-use 60-minute reset tokens, real SMTP dispatch, single-use invalidation, and standalone credential precedence. | Verified via `productionReadinessHardening.test.js` & live Gmail SMTP delivery. |

---

## 3. Security Controls Verification Checklist

### Authentication
- **Password Hashing:** `scrypt` with per-user random salt and timing-safe verification (`crypto.timingSafeEqual`) in `candidateSecurity.js`.
- **JWT Isolation:** Dedicated `CANDIDATE_JWT_SECRET` + `CANDIDATE_JWT_AUDIENCE` separated from staff/admin tokens; production boot fails closed (`env.js`) if candidate/staff/internal secrets collide or use dev defaults.
- **Session Revocation & Lockout:** `CandidateAccount.tokenVersion` increments on password reset/change (immediate JWT invalidation); brute-force lockout on login & OTP verification verified in `candidateIdentityVerificationAndRecovery.test.js`.
- **Rate Limiting:** Dedicated limiters for `apiRateLimiter` (300/15m), `publicSubmissionLimiter` (40/15m), `authRateLimiter` (25/15m), `candidateVerificationLimiter` (12/15m), `candidateRecoveryLimiter` (10/15m).

### Four-Portal Authorization & Multi-Tenant Isolation
- **Portals:** `/login` (Candidate), `/org-login` (Organisation Admin), `/recruiter-login` (Recruiter / Interviewers), `/platform-admin/login` (Platform Admin).
- **Enforcement:** Backend portal routes (`authPortal.service.js`) strictly validate `userType` and resolved RBAC roles; mismatched roles receive `403 PORTAL_ROLE_MISMATCH`.
- **Tenant Isolation (`requireTenant`):** Rejects mismatched `x-organisation-id`, `x-organization-id`, URL params, or body `organisationId` (`403 CROSS_TENANT_DENIED`), and blocks `CANCELLED`, `SUSPENDED`, or expired subscriptions (`403 SUBSCRIPTION_INACTIVE`).
- **Global Governance Routes:** All `/platform-admin/*` endpoints strictly require `authenticate` + `requirePlatformAdmin`; Organisation Admins and Candidates receive `403` / `401`.

### API, Input & File Upload Security
- **SQL Injection:** All queries use Sequelize parameterized bindings (`Op.iLike`, `where` objects); verified safe against `' OR '1'='1'; DROP TABLE jobs; --`.
- **Prototype Pollution / Mass Assignment:** `containsUnsafeKeys` rejects `__proto__`, `constructor`, `prototype` in JSON configs; Zod schemas strip/validate all request payloads.
- **File Uploads (`upload.js` + `storage.routes.js`):** Strict MIME-to-extension allowlists, magic-byte inspection, dangerous extension blocklist, 10 MB size ceiling, HMAC-SHA256 signed download URLs with 15-minute expiry, per-scope authorization (`SUBSCRIPTION_PROOF` = Platform Admin only; `APPLICATION`/`OFFER`/`JOINING` = owning tenant or verified candidate only), and quarantine blocklist (`INFECTED`, `QUARANTINED`, `SCAN_FAILED`).
- **HTTP Security Headers:** Helmet CSP, `strict-origin-when-cross-origin` referrer policy, explicit CORS origin allowlist, zero stack trace exposure in `errorHandler.js`.

---

## 4. Dependency Vulnerability Audit (`npm audit --omit=dev`)

- **`client`:** **0 vulnerabilities** (`found 0 vulnerabilities`).
- **`recruitment-service`:** **0 critical, 0 high, 5 moderate** — all 5 moderate findings stem from transitive dependencies (`glob`, `minimatch`, `editorconfig`, `js-beautify`) inside `sequelize-cli@6.6.3`, which is only invoked during manual CLI database migrations and is never loaded in the Express HTTP server runtime. **Recommendation:** Move `sequelize-cli` from `dependencies` to `devDependencies` (or upgrade when Sequelize v7 CLI ships).

---

## 5. Open Low / Operational Security Recommendations

1. **Public `GET /api/v1/subscriptions/:id`:** Protected by unguessable UUIDv4 knowledge and `sanitizeSubscription` (never exposes `activationTokenHash`), but returns `adminEmail` and payment references to facilitate public payment-proof submission. Consider adding a short-lived signed booking-session token before public high-volume launch.
2. **Malware Scanning (`MALWARE_SCANNER_MODE`):** Currently `DISABLED` locally; production deployment MUST enable `MALWARE_SCANNER_MODE=CLAMAV` + `MALWARE_SCAN_REQUIRED=true` against a dedicated ClamAV daemon.
3. **Production HTTPS & Cookie/CSP Hardening:** Ensure TLS termination at ingress/reverse proxy and verify `CLIENT_APP_URL` uses HTTPS (already enforced fail-closed by `env.js` when `NODE_ENV=production`).
