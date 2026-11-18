# NEXNUV Recruitment — Known Limitations & Production Blockers

**Audit Date:** November 18, 2026

---

## 1. Multi-Instance / Production Release Blockers

| # | Blocker | Severity | Scope | Description | Required Resolution |
| :-: | :--- | :---: | :--- | :--- | :--- |
| **BLK-01** | **Multi-Instance Employee Provisioning Concurrency** | **HIGH** | Multi-Replica Only (Shared `employee-service` + `joining.service.js`) | `joining.service.js` protects concurrent `POST /joining/:id/retry-employee-sync` via process-local `inFlightRetries` Map, while read-only shared `employee-service` (`:4004`) lacks a `(organization_id, LOWER(email))` unique constraint and `Idempotency-Key` support. Simultaneous retries across 2+ pods can create duplicate employees. | Add unique index on `(organization_id, LOWER(email))` or `Idempotency-Key` in `employee-service`, or constrain `recruitment-service` to **1 replica** until shared-service remediation lands. |
| **BLK-02** | **No Independent Staging Verification Executed** | **HIGH** | Production Release Gate | All end-to-end, load, and failure-recovery tests were executed locally and against Neon dev cloud. Isolated staging with full live shared services (`:4000–:4006`), HTTPS ingress, ClamAV, Cloudinary, and enterprise email has not yet been provisioned. | Provision isolated staging environment and run full regression + staging load benchmark (`PG_POOL_MAX=20`). |
| **BLK-03** | **Local Disk Storage Driver (`STORAGE_DRIVER=LOCAL_SECURE`)** | **HIGH (Multi-Pod)** | Deployment Config | Default local configuration stores documents on local disk (`./storage/`), which is not shared across multiple pods. | Set `STORAGE_DRIVER=CLOUDINARY` with verified credentials in staging and production. |

---

## 2. Medium / Operational Limitations

| # | Limitation | Severity | Location | Description | Mitigation / Future Work |
| :-: | :--- | :---: | :--- | :--- | :--- |
| **LIM-01** | **Process-Local Webhook Replay Cache & Delivery Ledger** | **MEDIUM** | `webhookAuth.js`, `notification.adapter.js` | `processedEventCache` and `deliveryLedger` are in-memory Maps; multi-pod deployments may not share replay state or delivery lookup across pods. | Persist processed webhook IDs in PostgreSQL and add DB fallback lookup in `recordDeliveryConfirmation`. |
| **LIM-02** | **Process-Local Rate Limiting** | **MEDIUM** | `rateLimiter.js` | Express rate limiters use in-memory stores; effective limit scales linearly with replica count. | Enforce primary rate limiting at API Gateway (`:4000`) or cloud WAF/Ingress. |
| **LIM-03** | **External HRMS Service URL Unconfigured** | **LOW-MED** | `recruitment-service/.env` | `HRMS_SERVICE_URL` is blank by default; HRMS sync operates on local dev fixtures in `standalone` mode and returns `503 HRMS_SERVICE_NOT_CONFIGURED` in `live` mode until configured. | Supply live `HRMS_SERVICE_URL` and validate schema mapping when integrating enterprise HRMS. |
| **LIM-04** | **ClamAV Malware Scanner Disabled Locally** | **MEDIUM (Prod)** | `recruitment-service/.env` | `MALWARE_SCANNER_MODE=DISABLED` locally; uploads rely on MIME/extension/magic-byte checks only until `clamd` is deployed. | Enable `MALWARE_SCANNER_MODE=CLAMAV` + `MALWARE_SCAN_REQUIRED=true` in staging/production. |
| **LIM-05** | **Code Modularity — Legacy Oversized Files** | **LOW** | `subscription.service.js` (1,067 lines), `auth.adapter.js` (976 lines), `SubscribePage.jsx` (836 lines), `candidateIdentity.service.js` (811 lines), `PlatformAdminReviewPage.jsx` (803 lines) | Newer modules (cancellation, job governance, diagnostics, modals) strictly meet 53–272 lines, while several pre-existing core orchestrators exceed 250 lines. Per audit constraints, working modules were not refactored solely for line count to avoid unnecessary regression risk. | Schedule incremental extraction during next planned feature cycle with full test coverage. |
| **LIM-06** | **Transitive CLI Dependency Audit Warnings** | **LOW** | `recruitment-service/package.json` (`sequelize-cli@6.6.3`) | `npm audit --omit=dev` reports 5 moderate findings in `glob`/`minimatch` pulled exclusively by `sequelize-cli` (CLI migration tool, unused at Express runtime). `client` has 0 vulnerabilities. | Move `sequelize-cli` to `devDependencies` so production runtime image omits it entirely. |
