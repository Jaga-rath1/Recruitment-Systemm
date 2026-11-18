# Production Deployment Checklist — NEXNUV Recruitment Microservice

**Target Service:** `nexnuv-recruitment-service` (Port `4007`) & `nexnuv-recruitment-client` (Port `5173` / Nginx)

---

## 1. External Shared Ecosystem Prerequisites (Read-Only Team Actions)

1. Provision PostgreSQL databases, `.env` secrets, `npm install`, migrations, and aligned `INTERNAL_SERVICE_TOKEN` across the six shared repositories.
2. Start shared services in dependency order before booting Recruitment in `live` mode:
   1. `organization-service` (`4003`)
   2. `auth-service` (`4001`)
   3. `platform-service` (`4002`)
   4. `notification-service` (`4006`)
   5. `employee-service` (`4004`)
   6. `api-gateway` (`4000`)
3. Register `RECRUITMENT_SERVICE_URL=http://localhost:4007` (or container DNS `http://recruitment-service:4007`) and exact public/Candidate Portal/tenant proxy routes in `api-gateway` (see [SHARED_SERVICE_INTEGRATION_BLOCKERS.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/SHARED_SERVICE_INTEGRATION_BLOCKERS.md)).
4. Confirm active organisation subscriptions in Platform Service include `'RECRUITMENT'` in `features`.

---

## 2. Secrets & Production Environment Configuration (`recruitment-service`)

Populate production environment variables (never commit `.env` or print secret values):

- [ ] `NODE_ENV=production`
- [ ] `PORT=4007`
- [ ] `INTEGRATION_MODE=live` *(mandatory in production; `standalone` fails fast)*
- [ ] `DATABASE_URL` *(Neon PostgreSQL SSL/TLS connection string)*
- [ ] `JWT_SECRET` *(exact match with `auth-service`)*
- [ ] `CANDIDATE_JWT_SECRET` *(cryptographically distinct from `JWT_SECRET`)*
- [ ] `CANDIDATE_TOKEN_HASH_SECRET` *(high-entropy secret >=32 chars for OTP & password-reset HMAC)*
- [ ] `STORAGE_SIGNED_URL_SECRET` *(distinct HMAC secret for `/api/v1/files/download` tokens)*
- [ ] `INTERNAL_SERVICE_TOKEN` *(aligned with shared internal middleware)*
- [ ] `STORAGE_DRIVER=CLOUDINARY`, `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=false`
- [ ] `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER_PREFIX`
- [ ] `EMAIL_PROVIDER=RESEND` *(or `BREVO` / `SMTP` with `SMTP_REQUIRE_TLS=true`)*, `EMAIL_FROM`, `EMAIL_FROM_NAME`, and provider API key / SMTP credentials
- [ ] `ALLOW_UNCONFIGURED_EMAIL_IN_PRODUCTION=false`
- [ ] `MALWARE_SCANNER_MODE=CLAMAV`, `MALWARE_SCAN_REQUIRED=true`, `CLAMAV_HOST`, `CLAMAV_PORT` *(recommended for untrusted candidate uploads)*
- [ ] `CORS_ORIGINS` & `CLIENT_APP_URL` set strictly to production HTTPS origins
- [ ] Optional: `HRMS_SERVICE_URL` if external HRMS job requisition sync is used

---

## 3. Database Migration & Seed Verification

```powershell
npx --prefix recruitment-service sequelize-cli db:migrate --options-path recruitment-service/.sequelizerc
npx --prefix recruitment-service sequelize-cli db:migrate:status --options-path recruitment-service/.sequelizerc
```

Confirm all five migrations show `up`:
- `20261110000001-init-recruitment-schema.js`
- `20261111000001-add-candidate-accounts-and-indexes.js`
- `20261111000002-add-document-security-metadata.js`
- `20261111000003-add-cloudinary-document-metadata.js`
- `20261112000001-add-candidate-identity-lifecycle.js`

---

## 4. Client Build & Container Validation

```powershell
npm --prefix client test
npm --prefix client run build
docker compose -f infrastructure/docker-compose.yml config -q
```

When deploying frontend behind API Gateway, set `VITE_USE_GATEWAY=true` and `VITE_API_GATEWAY_URL=https://<gateway-origin>/api/v1`.

---

## 5. Post-Deploy Smoke Checks

1. `GET http://recruitment-service:4007/health` -> `200 OK` (`integrationMode: "live"`).
2. `GET http://recruitment-service:4007/ready` -> `200 OK` (`database: "up"`, `authService: "up"`, `organisationService: "up"`, `platformService: "up"`, `employeeService: "up"`).
3. `GET /api/v1/jobs/public/careers` -> `200 OK` through `api-gateway` (`4000`).
4. Candidate registration -> real OTP email receipt -> `POST /verify-email` -> `POST /login` -> resume upload (`CLOUDINARY` `type=authenticated`) -> `GET /files/download?token=...` returns `200` with `Cache-Control: private, no-store, no-cache`.
5. Run [end-to-end verification matrix](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/END_TO_END_VERIFICATION_MATRIX.md) steps 1–20 against the live staging stack before production traffic cutover.

