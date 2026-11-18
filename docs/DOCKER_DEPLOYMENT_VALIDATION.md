# Docker Deployment Validation — NEXNUV Recruitment

**Validation Date:** 2026-11-12  
**Compose Syntax Status:** **PASS** *(zero warnings after Phase 4.6 fix)*  
**Daemon Build & Container Runtime Checks:** **NOT TESTED** *(Docker Desktop Linux engine daemon not running on host)*

---

## 1. Direct Commands & Outputs Observed

1. **Docker CLI Version**: `Docker version 29.7.2, build a7dcaa6`.
2. **Compose Interpolation Check Without Secrets**:
   - `docker compose -f infrastructure/docker-compose.yml config -q` failed with `required variable INTERNAL_SERVICE_TOKEN is missing a value: Set INTERNAL_SERVICE_TOKEN in production`, confirming fail-fast Compose secret enforcement.
3. **Phase 4.6 Compose Fix (`REC-P46-001`)**:
   - Removed obsolete top-level `version: "3.9"` from [docker-compose.yml](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/docker-compose.yml).
   - Re-ran `docker compose -f infrastructure/docker-compose.yml config -q` with ephemeral placeholder secrets -> `ComposeCleanExit=0` with zero warnings.
4. **Docker Daemon Check**:
   - `docker info --format '{{.ServerVersion}}'` returned `DockerInfoExit=1`: `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`. Image builds and live container healthchecks were therefore not executed (**NOT TESTED**).

---

## 2. Static Container Configuration Checklist

| Check | Status | Verified Artifact Evidence |
|---|---|---|
| Compose YAML syntax & required secret gates | **PASS** | `ComposeCleanExit=0` with `INTERNAL_SERVICE_TOKEN`, `JWT_SECRET`, `CANDIDATE_JWT_SECRET`, `CANDIDATE_TOKEN_HASH_SECRET`, `STORAGE_SIGNED_URL_SECRET` required via `:?` syntax. |
| Service build contexts & `.dockerignore` isolation | **PASS** | [recruitment-service/.dockerignore](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/.dockerignore) and [client/.dockerignore](file:///c:/Users/rathj/NEXNUV-Recruitment/client/.dockerignore) exclude `.env`, `.env.*`, `node_modules`, `dist`, `storage`, `storage-test`, `.pglite-data`. |
| Non-root container user (`recruitment-service`) | **PASS (Static)** | [recruitment-service.Dockerfile](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/recruitment-service.Dockerfile) creates `/app/storage` & `_quarantine`, sets ownership, and switches to `USER appuser`. |
| Port mappings & healthcheck | **PASS (Static)** | Backend `4007:4007` with `fetch('http://localhost:4007/health')` check; Frontend `3000:80` via [nginx.conf](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/nginx.conf). |
| Migration startup command | **PASS (Static)** | `CMD ["sh", "-c", "npx sequelize-cli db:migrate && node src/db/seed.js && node src/server.js"]`. |
| Transactional email & Cloudinary env passthrough | **PASS (Static)** | [docker-compose.yml](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/docker-compose.yml#L46-L70) passes `EMAIL_PROVIDER`, `ALLOW_UNCONFIGURED_EMAIL_IN_PRODUCTION`, `RESEND_API_KEY`, `BREVO_API_KEY`, `SMTP_*`, and `CLOUDINARY_*`. |
| `recruitment-service` Docker image build | **NOT TESTED** | Blocked by offline Docker Desktop daemon (`DockerInfoExit=1`). |
| `client` Docker image build | **NOT TESTED** | Blocked by offline Docker Desktop daemon (`DockerInfoExit=1`). |
| Live container boot, `/health` & graceful `SIGTERM` | **NOT TESTED** | Blocked by offline Docker Desktop daemon (`DockerInfoExit=1`). *(Note: Node graceful shutdown handlers exist in [server.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/server.js)).* |

