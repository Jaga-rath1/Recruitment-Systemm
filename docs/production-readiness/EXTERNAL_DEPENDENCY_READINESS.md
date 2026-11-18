# NEXNUV Recruitment — External Production Prerequisite & Dependency Readiness Matrix

**Audit Date:** November 18, 2026  
**Honesty Rule:** A dependency is NEVER marked production-ready merely because adapter code exists.

---

## 1. External Dependency Readiness Matrix

| # | External Dependency / Prerequisite | Implemented in Code | Configured Locally | Tested Locally | Tested in Isolated Staging | Verified in Production | Notes / Required Action Before Production |
| :-: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **1** | **Neon / Managed PostgreSQL (`DATABASE_URL`)** | Yes | Yes (Neon Cloud) | **Yes** (22/22 models, 105 indexes, 19 FKs, live E2E) | No | No | Provision dedicated production PostgreSQL cluster with automated PITR backups, connection pooling, and TLS `sslmode=require`. |
| **2** | **Shared Microservices (`:4000–:4006`) in `INTEGRATION_MODE=live`** | Yes | Partial (Notification `:4006` live E2E verified 6/6; Auth `:4001` running locally) | **Yes** (Contract harness + Live `:4006` 6/6) | No | No | Provision full shared-service stack in isolated staging and execute E2E regression with `INTEGRATION_MODE=live`. |
| **3** | **External HRMS Gateway (`HRMS_SERVICE_URL`)** | Yes ([hrms.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/hrms/hrms.adapter.js)) | **No** (`HRMS_SERVICE_URL` empty) | Mock fixtures only | No | No | Provide live `HRMS_SERVICE_URL`, verify `GET /api/v1/internal/organisations/:id/jobs` contract & `x-internal-token` auth. |
| **4** | **Internal Service Auth (`INTERNAL_SERVICE_TOKEN` / JWT Secrets)** | Yes (fail-closed validation in `env.js`) | Dev secrets in `.env` | **Yes** (unit + contract tests) | No | No | Generate unique high-entropy secrets for `JWT_SECRET`, `CANDIDATE_JWT_SECRET`, `CANDIDATE_TOKEN_HASH_SECRET`, `INTERNAL_SERVICE_TOKEN`, and `STORAGE_SIGNED_URL_SECRET`. |
| **5** | **Transactional Email Provider (Resend / Brevo / Enterprise SMTP)** | Yes (Resend, Brevo, SMTP) | Yes (Gmail SMTP `:587` TLS) | **Yes** (Live Gmail SMTP receipt verified; Resend/Brevo mocked HTTPS verified) | No | No | Switch from personal Gmail SMTP to verified enterprise domain on Resend/Brevo with SPF, DKIM, DMARC, and webhook signing secrets (`RESEND_WEBHOOK_SECRET` / `BREVO_WEBHOOK_SECRET`). |
| **6** | **ClamAV Malware Scanner (`MALWARE_SCANNER_MODE=CLAMAV`)** | Yes (fail-closed TCP `clamd` client) | **No** (`DISABLED` locally) | Mocked scanner tests only | No | No | Deploy managed `clamd` sidecar/service on TCP `:3310`, set `MALWARE_SCANNER_MODE=CLAMAV` and `MALWARE_SCAN_REQUIRED=true`, and verify EICAR test rejection. |
| **7** | **Cloudinary Object Storage (`STORAGE_DRIVER=CLOUDINARY`)** | Yes (private authenticated delivery + signed URLs) | **No** (`LOCAL_SECURE` locally) | Unit/adapter mock tests | No | No | Configure production `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, set `STORAGE_DRIVER=CLOUDINARY`, verify signed download & deletion in staging. |
| **8** | **Treasury Payment Instructions (`TREASURY_*`)** | Yes (`buildTreasuryConfig`) | Local test treasury values | **Yes** | No | No | Configure verified corporate bank account, IFSC, UPI ID, and beneficiary name in production secret store. |
| **9** | **PostgreSQL Backup & Disaster Recovery** | Documented (`docs/BACKUP_RECOVERY_STRATEGY.md`) | Managed by Neon default | Not executed as DR drill | No | No | Execute automated `pg_dump` + restore drill on staging snapshot and validate RPO/RTO targets. |
| **10** | **Domain, HTTPS TLS & Reverse Proxy (Nginx / Cloud Ingress)** | Docker/Nginx templates in `infrastructure/` | Local HTTP (`localhost:5173` / `:4007`) | Local HTTP only | No | No | Provision TLS certificates, configure HTTPS `CLIENT_APP_URL` & `CORS_ORIGINS`, enable WAF/ingress rate limiting. |
| **11** | **Centralized Monitoring, Log Aggregation & Alerting** | Structured Pino JSON logs + `/health` + `/ready` + `/platform-admin/diagnostics` | Local console logs | **Yes** (diagnostics verified) | No | No | Connect stdout Pino JSON logs to SIEM/log aggregator; configure alerts on `5xx` spikes, `/ready` failures, `pendingSyncCount > 0`, and DB pool saturation. |
