# API Gateway Integration Handoff — NEXNUV Recruitment Service

**Target Upstream Service:** `recruitment-service`  
**Environment Variable:** `RECRUITMENT_SERVICE_URL=http://localhost:4007` *(or container URL `http://recruitment-service:4007`)*  
**Current Verification Status:** **BLOCKED** *(API Gateway `api-gateway/` is offline and strictly read-only; inspected `api-gateway/src/config/services.js`, `api-gateway/src/config/env.js`, `api-gateway/src/app.js`, `api-gateway/src/middlewares/auth.js`, and `api-gateway/src/proxy/serviceProxy.js` — `RECRUITMENT` is not registered).*

---

## 1. Findings From Read-Only Inspection of `api-gateway/`

1. **`services.js` / `env.js`**: Only defines `AUTH`, `NOTIFICATION`, `PLATFORM`, `ORGANIZATION`, `EMPLOYEE`, `ATTENDANCE_LEAVE`, `TICKET`, `TEAM`, `AGENT`, `SLA`, `ATTACHMENT`, `KNOWLEDGE_BASE`. `RECRUITMENT_SERVICE_URL` is absent.
2. **`/api/v1/auth` Prefix Conflict (`app.js:73`)**: `app.use(["/api/v1/auth", "/auth"], stripTrustedHeaders, createProxy(services.AUTH))` captures all `/api/v1/auth/*` paths unless `/api/v1/auth/candidate` is mounted **above** it.
3. **`proxy/serviceProxy.js`**:
   - Explicitly copies `x-user-id`, `x-user-name`, `x-user-role`, `x-user-email`, `x-organization-id`, `x-tenant-id`, `x-industry-id`, `x-internal-token`, `x-service-name` onto proxied requests (`10000ms` timeout/proxyTimeout).
   - Overwrites `access-control-allow-origin` with request `Origin` when present and sets `access-control-allow-credentials: true`.
   - Preserves original `req.originalUrl` prefixed with `/api/v1` (`targetUrl`).
   - **Correlation ID Gap**: `x-request-id` is not explicitly generated in `api-gateway`; if incoming clients do not pass `x-request-id`, `recruitment-service` generates one locally, so cross-hop correlation requires callers or Gateway middleware to supply `x-request-id`.
   - **`/api/v1/auth/me` Collision**: `/api/v1/auth/me` currently goes to `AUTH` (`4001`), whereas Recruitment Frontend calls `GET /api/v1/auth/me` expecting `{ user, organisation, permissions }`. When running `VITE_USE_GATEWAY=true`, mount an alias (e.g., `/api/v1/recruitment/auth/me` -> `services.RECRUITMENT`) or align frontend auth bootstrap.

---

## 2. Exact Proxy Route Registration Specification

Mount order in `api-gateway/src/app.js` **matters**. Register Recruitment routes in this exact order:

### A. Public & Candidate Bypass Mounts (`stripTrustedHeaders, createProxy(services.RECRUITMENT)`)
*Must NOT run Gateway `protect` (`[verifyToken, verifySession, resolveOrganization]`), because Candidate JWTs use Recruitment's distinct `CANDIDATE_JWT_SECRET` and public/subscription onboarding endpoints require unauthenticated access.*

| Route Prefix | Allowed HTTP Methods | Auth Mode Inside Recruitment | Notes |
|---|---|---|---|
| `/api/v1/auth/candidate` | `POST` | Public (`register`, `verify-email`, `resend-verification`, `login`, `forgot-password`, `reset-password`) or Candidate JWT (`change-password`) | **MUST mount BEFORE `/api/v1/auth` -> `services.AUTH`.** |
| `/api/v1/portal` | `GET`, `POST`, `PATCH` | Candidate JWT (`CANDIDATE_JWT_SECRET` + `tokenVersion` check) | Includes `/api/v1/portal/claims` & `/api/v1/portal/offers/:id/respond`. Forward `Authorization` header intact. |
| `/api/v1/jobs/public` | `GET` | Unauthenticated Public | Careers page job list & detail. |
| `/api/v1/applications/public` | `POST` | Unauthenticated Public or Optional Candidate JWT | Multipart `multipart/form-data` resume upload (<=10 MB). Forward `Authorization` & raw body stream untouched (no `express.json()` before proxy). |
| `/api/v1/files/download` | `GET` | Org/Platform Admin JWT OR Candidate JWT + HMAC query `token` | Streams binary download (`Cache-Control: private, no-store, no-cache`). **Do not buffer/rewrite body or strip `Content-Disposition` / `X-Content-Type-Options`.** Forward `Authorization` intact. |
| `/api/v1/subscriptions/platform-admin` | `GET`, `POST`, `PATCH` | **Gateway `...protect`** *(Mount BEFORE generic `/api/v1/subscriptions`!)* | Platform Admin verification queue & lifecycle controls. |
| `/api/v1/subscriptions` | `GET`, `POST` | Unauthenticated / tokenless activation (`POST /`, `GET /:id`, `POST /:id/payments`, `POST /activate`) | Multipart payment proof upload (`POST /:id/payments`). |
| `/api/v1/recruitment/health` *(optional alias)* | `GET` | Public | Or map `/health` & `/ready` internally from `/api/v1/recruitment/*` if health checks go through Gateway. |

### B. Protected Tenant Mounts (`...protect, createProxy(services.RECRUITMENT)`)
*Must run `[verifyToken, verifySession, resolveOrganization]` and inject `x-internal-token`, `x-user-id`, `x-user-role`, `x-user-email`, `x-user-name`, `x-organization-id`, `x-tenant-id`.*

- `/api/v1/jobs` (`GET`, `POST`, `PUT`, `PATCH`)
- `/api/v1/candidates` (`GET`)
- `/api/v1/applications` (`GET`, `POST`) *(non-public routes)*
- `/api/v1/interviews` (`GET`, `POST`, `PATCH`)
- `/api/v1/offers` (`GET`, `POST`)
- `/api/v1/joining` (`GET`, `POST`, `PATCH`)
- `/api/v1/organisations` (`GET`, `POST`, `PATCH`)
- `/api/v1/roles` (`GET`, `POST`, `PATCH`)
- `/api/v1/reports` (`GET`)
- `/api/v1/audit-logs` (`GET`)

---

## 3. Binary Streaming & Timeout Expectations

- **Do not attach body parsers before `createProxy`** for `/api/v1/applications/public`, `/api/v1/subscriptions`, `/api/v1/offers`, `/api/v1/joining`, or `http-proxy` multipart uploads will hang/corrupt.
- **File Downloads (`/api/v1/files/download`)**: Preserve streaming response and security headers (`Content-Type`, `Content-Disposition`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store, no-cache`).
- **Timeouts**: Increase `proxyTimeout` on Recruitment upload/download routes if Cloudinary uploads can exceed 10 seconds (Recruitment backend uses `CLOUDINARY_TIMEOUT_MS=15000`).

