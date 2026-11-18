# NEXNUV Recruitment — Production Storage & Malware Scanning Deployment Guide

This guide defines how to configure private authenticated **Cloudinary** document storage and synchronous ClamAV malware scanning for `nexnuv-recruitment-service`.

---

## 1. Approved Storage Drivers

| Environment | `STORAGE_DRIVER` | Behavior & Suitability |
|---|---|---|
| Local Dev & CI | `LOCAL_SECURE` | Stores private files under `STORAGE_LOCAL_ROOT` (`./storage`) with `chmod 750/640`. |
| Single-Node Docker Compose Staging | `LOCAL_SECURE` + `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true` | Binds named persistent Docker volume (`recruitment_storage:/app/storage`). **Not suitable for horizontally scaled multi-replica instances.** |
| Production / Multi-Replica | **`CLOUDINARY`** | Official Cloudinary Node.js SDK (`cloudinary@^2.11.0`) uploading with `type: 'authenticated'`, `access_mode: 'authenticated'`, short-lived backend `private_download_url` access, and automatic orphan asset destruction on DB rollback. |

Unsupported drivers (including legacy S3 values) fail fast at boot (`FATAL: Unsupported STORAGE_DRIVER ...`). Unacknowledged `LOCAL_SECURE` in `NODE_ENV=production` also aborts startup cleanly.

---

## 2. Production Cloudinary Configuration

Set these environment variables in your production secret manager / deployment manifest (`recruitment-service` backend ONLY — never expose `CLOUDINARY_*` keys to React `client/`):

```ini
NODE_ENV=production
INTEGRATION_MODE=live

STORAGE_DRIVER=CLOUDINARY
ALLOW_LOCAL_STORAGE_IN_PRODUCTION=false
STORAGE_SIGNED_URL_SECRET=<64-char-random-secret-different-from-JWT_SECRET>
STORAGE_SIGNED_URL_TTL_SECONDS=900
MAX_UPLOAD_SIZE_MB=10

# Required when STORAGE_DRIVER=CLOUDINARY (Backend-only secrets)
CLOUDINARY_CLOUD_NAME=<your-cloudinary-cloud-name>
CLOUDINARY_API_KEY=<your-cloudinary-api-key>
CLOUDINARY_API_SECRET=<your-cloudinary-api-secret>
CLOUDINARY_FOLDER_PREFIX=nexnuv-recruitment
CLOUDINARY_TIMEOUT_MS=15000
CLOUDINARY_DOWNLOAD_TTL_SECONDS=120
```

Startup validation guarantees:
1. Missing `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, or `CLOUDINARY_API_SECRET` when `STORAGE_DRIVER=CLOUDINARY` immediately aborts boot (`FATAL`).
2. `CLOUDINARY_DOWNLOAD_TTL_SECONDS` must stay bounded (`1..3600` seconds; recommended `120` seconds since URLs are fetched immediately by backend proxy).

---

## 3. Cloudinary Account Security Controls

1. **Authenticated Delivery Type Only**: [cloudinaryClient.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/storage/cloudinaryClient.js) uploads every resume (`raw`), offer letter (`raw`/`image`), joining letter (`raw`/`image`), and payment proof (`image`/`raw`) with `type: 'authenticated'` and `access_mode: 'authenticated'`. Configure your Cloudinary upload preset/security settings to disable unsigned uploads and block unsigned public access to the `nexnuv-recruitment/*` folder.
2. **Backend Proxy Architecture**: Clients never contact `res.cloudinary.com` or `api.cloudinary.com` directly. Every browser download hits `GET /api/v1/files/download?token=<HMAC_TOKEN>` with Bearer JWT authentication; after DB/RBAC/tenant checks pass, the backend signs a short-lived `cloudinary.utils.private_download_url`, fetches bytes over HTTPS, and streams them with `Cache-Control: private, no-store, no-cache`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Content-Disposition: attachment`.
3. **Strict Strictness on MIME / Extensions**: Enable Cloudinary strict raw format settings matching `pdf, doc, docx, txt, png, jpg, jpeg, webp` while relying on Recruitment's pre-upload magic signature validator, multi-extension blocker, and ClamAV scan BEFORE streaming to Cloudinary.

---

## 4. Synchronous ClamAV Malware Scanning Configuration

Uploads stream synchronously to a co-located ClamAV daemon (`clamd`) over TCP `zINSTREAM` prior to calling `cloudinary.uploader.upload_stream`:

```ini
MALWARE_SCANNER_MODE=CLAMAV
MALWARE_SCAN_REQUIRED=true
QUARANTINE_INFECTED_FILES=true
CLAMAV_HOST=clamav-sidecar.internal
CLAMAV_PORT=3310
MALWARE_SCAN_TIMEOUT_MS=5000
MALWARE_SCAN_MAX_BYTES=15728640
STORAGE_QUARANTINE_ROOT=/var/lib/nexnuv-quarantine
```

Fail-closed guarantees in [malwareScanner.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/storage/malwareScanner.js):
- Infected payloads are blocked (`422 MALWARE_DETECTED`), optionally isolated in `STORAGE_QUARANTINE_ROOT` (`chmod 600` + `.meta.json`), and **never uploaded to Cloudinary**.
- Scanner timeouts, unreachable daemon ports, or `MALWARE_SCAN_REQUIRED=true` + `DISABLED` return `503 MALWARE_SCANNER_UNAVAILABLE` without storing assets.

---

## 5. Reverse Proxy & Container Settings
- **Nginx** ([nginx.conf](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/nginx.conf)): `client_max_body_size 15M;` accommodates `MAX_UPLOAD_SIZE_MB=10` plus multipart headers.
- **API Gateway** (`4000`): Ensure proxy body limit >= `15MB` and request timeout >= `20s` for upload routes streaming to Cloudinary.
- **Non-Root Container**: [recruitment-service.Dockerfile](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/recruitment-service.Dockerfile) runs as non-root `appuser` with `750` permissions on `/app/storage` and `/app/storage/_quarantine`.
