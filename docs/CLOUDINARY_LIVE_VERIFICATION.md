# Cloudinary Live Verification — NEXNUV Recruitment Microservice

**Verification Date:** 2026-11-12  
**Verification Status:** **BLOCKED** *(Live Cloudinary credentials are unprovisioned in environment configuration; code implementation & fail-closed env validation verified via direct inspection and integration tests only.)*

---

## 1. Safe Credential & Configuration Check (No Secrets Exposed)

Checked `recruitment-service/.env` and [recruitment-service/.env.example](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/.env.example) safely:
- `STORAGE_DRIVER=LOCAL_SECURE` (in local `recruitment-service/.env`)
- `CLOUDINARY_CLOUD_NAME=<EMPTY>`
- `CLOUDINARY_API_KEY=<EMPTY>`
- `CLOUDINARY_API_SECRET=<EMPTY>`
- `CLOUDINARY_FOLDER_PREFIX=nexnuv-recruitment` (default in `.env.example` & `docker-compose.yml`)
- `CLOUDINARY_TIMEOUT_MS=15000`
- `CLOUDINARY_DOWNLOAD_TTL_SECONDS=120`

Because live `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are absent, performing a live network upload/download/destroy test against Cloudinary API is **BLOCKED**. Mocked SDK integration tests are **not** reported as live Cloudinary verification.

---

## 2. Inspected Implementation & Fail-Fast Controls (`PASS` Static/Unit Scope)

Direct inspection of [cloudinaryClient.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/storage/cloudinaryClient.js), [storage.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/storage/storage.adapter.js), [storage.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/storage/storage.routes.js), and [env.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/config/env.js):

1. **SDK & Authenticated Delivery**: Uses official `cloudinary@^2.11.0` (`v2`) with `upload_stream(..., { type: 'authenticated', access_mode: 'authenticated', overwrite: false, timeout: timeoutMs })` and `cloudinary.utils.private_download_url(..., { resource_type, type: 'authenticated', attachment: true, expires_at })` (`10s–900s` TTL).
2. **Resource Type Mapping**: `image/png`, `image/jpeg`, `image/webp` map to `'image'` (stripping duplicate extension in `public_id`); PDF/DOC/DOCX/TXT map to `'raw'` (preserving file extension in `public_id`).
3. **Backend-Only Secrets & Metadata Persistence**: `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` never reach the frontend or signed tokens. PostgreSQL tables store `storage_provider`, `storage_key`, `cloudinary_public_id`, `cloudinary_resource_type`, `cloudinary_format`, `cloudinary_version`, `storage_visibility`, and `checksum_sha256`.
4. **Transaction Rollback Cleanup**: Upload callers (`application.service.js`, `offer.service.js`, `joining.service.js`, `subscription.service.js`) invoke `storageAdapter.deleteFile(storageKey, stored)` inside `catch` blocks if the DB transaction fails.
5. **Production Fail-Fast Verified (`PASS`)**: Verified directly via subprocess test that `NODE_ENV=production` crashes on startup if `STORAGE_DRIVER=CLOUDINARY` has missing credentials (`incomplete_cloudinary: BLOCKED_OK`) or `STORAGE_DRIVER=LOCAL_SECURE` with `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=false` (`local_storage_in_prod: BLOCKED_OK`).

---

## 3. Required Live Acceptance Procedure (Once Credentials Are Provisioned)

1. Populate `STORAGE_DRIVER=CLOUDINARY`, `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=false`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in staging environment.
2. Upload a harmless synthetic test PDF via `storageAdapter.saveFile`.
3. Verify Cloudinary Console / Admin API shows asset under `type: "authenticated"` (unauthenticated HTTPS direct fetch returns `401`/`404`) and PostgreSQL row contains `cloudinary_public_id` & `checksum_sha256`.
4. Fetch `/api/v1/files/download?token=...` with authorized JWT (`200` + `Cache-Control: private, no-store, no-cache`) and reject cross-tenant/unauthorized JWT (`403`).
5. Run `storageAdapter.deleteFile(...)` and confirm Cloudinary deletion + clean DB state.

