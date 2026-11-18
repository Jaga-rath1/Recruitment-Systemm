# Production Go-Live Execution Sequence — NEXNUV Recruitment

**Target Services:** `nexnuv-recruitment-service` (`4007`) & `nexnuv-recruitment-client` (`5173` / Nginx `80`)

---

## Pre-Flight Ownership Split

- **Platform / Core Backend Team (External Read-Only Repos)**: Provision and start shared services (`4003 -> 4001 -> 4002 -> 4006 -> 4004 -> 4000`), align `INTERNAL_SERVICE_TOKEN` & `JWT_SECRET`, and apply [GATEWAY_INTEGRATION_HANDOFF.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/GATEWAY_INTEGRATION_HANDOFF.md) in `api-gateway/`.
- **Recruitment Release / DevOps Team**: Provision production env secrets (`NODE_ENV=production`, `INTEGRATION_MODE=live`, Cloudinary, Transactional Email, optional ClamAV), build/deploy containers, verify `/ready`, and execute live smoke & E2E acceptance tests.

---

## Exact Go-Live Execution Checklist

### Stage 1: Database & Secrets Verification (Before Boot)
- [ ] Confirm Neon PostgreSQL production connection string (`DATABASE_URL`, TLS `sslmode=require`) and verify Neon PITR/backup schedule.
- [ ] Run migration check: `npx --prefix recruitment-service sequelize-cli db:migrate:status --options-path recruitment-service/.sequelizerc` -> confirm **5/5 `up`**.
- [ ] Provision distinct high-entropy secrets:
  - `JWT_SECRET` *(matches `auth-service`)*
  - `CANDIDATE_JWT_SECRET` *(distinct from `JWT_SECRET`)*
  - `CANDIDATE_TOKEN_HASH_SECRET` *(distinct HMAC key >= 32 chars)*
  - `STORAGE_SIGNED_URL_SECRET` *(distinct HMAC key for `/api/v1/files/download`)*
  - `INTERNAL_SERVICE_TOKEN` *(matches shared ecosystem services)*
- [ ] Provision `STORAGE_DRIVER=CLOUDINARY`, `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=false`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- [ ] Provision `EMAIL_PROVIDER=RESEND` *(or `BREVO` / `SMTP` with `SMTP_REQUIRE_TLS=true`)*, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `ALLOW_UNCONFIGURED_EMAIL_IN_PRODUCTION=false`, and provider key/credentials.
- [ ] Decide malware policy: start `clamd` (`MALWARE_SCANNER_MODE=CLAMAV`, `MALWARE_SCAN_REQUIRED=true`) **OR** record signed security exception if scanning is disabled.

### Stage 2: Shared Ecosystem Bring-Up (External Owners)
- [ ] Start in order & check `/health`:
  1. `organization-service` (`4003`) -> `GET /health` `200`
  2. `auth-service` (`4001`) -> `GET /health`, `GET /ready` `200`
  3. `platform-service` (`4002`) -> `GET /health` `200`
  4. `notification-service` (`4006`) -> `GET /health`, `GET /ready` `200`
  5. `employee-service` (`4004`) -> `GET /health` `200`
  6. `api-gateway` (`4000`) -> `GET /health`, `GET /ready` `200`
- [ ] Confirm `api-gateway` mounts Recruitment routes per [GATEWAY_INTEGRATION_HANDOFF.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/GATEWAY_INTEGRATION_HANDOFF.md).

### Stage 3: Container Build & Recruitment Startup
- [ ] Validate `docker compose -f infrastructure/docker-compose.yml config -q` returns `0`.
- [ ] Build & launch `recruitment-service` and `client` (setting `VITE_USE_GATEWAY=true` and `VITE_API_GATEWAY_URL`).
- [ ] Verify non-root container process (`appuser`) and graceful `SIGTERM` shutdown behavior.

### Stage 4: Live Production Acceptance Gate (Must All Return `PASS`)
- [ ] `GET http://recruitment-service:4007/health` -> `200` (`integrationMode: "live"`).
- [ ] `GET http://recruitment-service:4007/ready` -> `200` (`database`, `authService`, `organisationService`, `platformService`, `employeeService` all `up`).
- [ ] Controlled Cloudinary test upload (`type: 'authenticated'`), authorized proxy download (`200`), unauthorized denial (`401`/`403`), and cleanup deletion pass.
- [ ] Controlled test candidate registration -> live OTP email receipt -> OTP verify -> password reset -> single-use & old-JWT `tokenVersion` revocation verified.
- [ ] If ClamAV enabled: clean PDF upload passes (`CLEAN`) and EICAR stream rejects (`422 MALWARE_DETECTED`).
- [ ] Execute Steps 1–23 of [END_TO_END_LIVE_TEST_REPORT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/END_TO_END_LIVE_TEST_REPORT.md) through live `api-gateway` (`4000`) with test tenant & test candidate.

