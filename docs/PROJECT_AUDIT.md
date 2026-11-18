# NEXNUV Recruitment — Architecture & Implementation Audit Report

**Audit Date**: 2026-11-10  
**Scope**: Complete forensic audit of `client/`, `recruitment-service/`, `docs/`, `infrastructure/`, and `scripts/` (updated after migrating ORM to **Sequelize** and fixing **Neon PostgreSQL** connectivity).

---

## 1. Executive Summary & Verification Commands Executed

| Check | Command | Observed Result |
|---|---|---|
| Backend Syntax Verification | `node --check` across all `recruitment-service/src` and `scripts` `.js` files | Passed (Exit 0) |
| Neon PostgreSQL Migration | `npm --prefix recruitment-service run db:migrate` (`sequelize-cli`) | Migrated `20261110000001-init-recruitment-schema` to Neon DB (`recruitment_service`) in `1.354s` |
| Neon PostgreSQL Seed | `npm --prefix recruitment-service run seed` | `Seeded 29 canonical recruitment permissions.` |
| Live Neon DB Server Probe | `node src/server.js` + `/health`, `/ready`, `/api/v1/jobs/public/careers` | All returned `200 OK` (`{"status":"ready","database":"connected"}`) |
| Backend Automated Tests | `npm --prefix recruitment-service test` | **5 test files passed, 14/14 tests passed** (`25.81s`, Sequelize + PGlite PostgreSQL + Supertest) |
| Frontend Automated Tests | `npm --prefix client test` | **1 test file passed, 5/5 tests passed** (Vitest + RTL with mocked API client) |
| Frontend Production Build | `npm --prefix client run build` | `dist/` production bundle built cleanly |

---

## 2. 15-Point Audit Findings

1. **Frontend & Backend Folder Structure**: Cleanly separated independent packages (`client/` and `recruitment-service/`), `docs/`, `infrastructure/`, `scripts/`. Zero broken imports detected.
2. **React Component-Based Architecture**: Feature-modular structure (`modules/` for all 13 functional areas, reusable UI primitives in `components/common/`, layouts in `components/layout/`, contexts in `context/`). Light enterprise palette (`#FFFFFF`, `#F8FAFC`, `#EFF6FF`) with obsidian `#0B1120` restricted to Navbar, Footer, and brand header.
3. **Express Backend Modular Architecture**: All 11 domain modules strictly follow `Routes → Controllers → Services → Repositories → Database` without business logic leaking into controllers.
4. **PostgreSQL & Neon DB Connection**: Uses **Sequelize (`6.37.x`) + `pg` (`8.15.x`)** with pooling in [database.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/config/database.js) and SSL/PgBouncer URL normalization in [config.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/db/config.js).
   - **Root causes of initial Neon & localhost errors fixed**:
     1. `recruitment-service/.env` still pointed to `localhost:5432` before Neon URL was configured.
     2. The Neon database `recruitment_service` did not exist yet on the Neon cluster (`3D000 database "recruitment_service" does not exist`) — created `recruitment_service` on Neon and migrated all 20 tables.
     3. Stripped `&channel_binding=require` and normalized `sslmode` into explicit `dialectOptions.ssl` so `pg` + Neon `-pooler` connects cleanly with zero hangs or SSL mode warnings.
5. **Database Schema & Relationships**: 20 Sequelize models in [src/db/models/](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/db/models/index.js) mapped to 20 normalized PostgreSQL tables with UUID PKs, foreign keys, `organisation_id` tenant indexes, and uniqueness guards.
6. **Database Migrations**: Sequelize migration [20261110000001-init-recruitment-schema.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/db/migrations/20261110000001-init-recruitment-schema.js) runs via `sequelize-cli db:migrate`.
7. **Environment Variable Configuration**: `.env` and `.env.example` exist for both `client/` and `recruitment-service/`. Fail-fast production secret guard active in [env.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/config/env.js).
8. **API Route Organisation**: Every frontend API call in [client/src/api/index.js](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/api/index.js) matches an exact Express route mounted under `/api/v1` in [app.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/app.js).
9. **Authentication Integration Readiness**: JWT verification supports RS256 public key or HS256 secret (`JWT_ISSUER`, `JWT_AUDIENCE`). `INTEGRATION_MODE=standalone` enables local dev/testing; `INTEGRATION_MODE=live` delegates to `AUTH_SERVICE_URL`.
10. **Multi-Tenant Organisation Isolation**: Verified via `requireTenant` middleware and tenant-scoped Sequelize queries (`organisationId`). Cross-tenant header tampering (`403`) and cross-tenant resource lookup (`404`) verified in integration tests.
11. **Role-Based Access Control (RBAC)**: 5 canonical roles and 29 granular permissions enforced dynamically against `employee_role_assignments` in PostgreSQL so role updates and deactivations take immediate effect.
12. **Error Handling & Logging**: Centralized `AppError` hierarchy, Multer & Sequelize (`UniqueConstraintError`, `ValidationError`, `ForeignKeyConstraintError`) handling in [errorHandler.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/errorHandler.js), `X-Request-Id` correlation, and Pino redaction.
13. **Security Configurations**: Helmet security headers, rate limiters, Zod validation, SHA-256 checksums, path-traversal protection + HMAC-signed download URLs, confidential interviewer feedback stripped from Candidate Portal.
14. **Docker Configuration**: [client.Dockerfile](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/client.Dockerfile), [recruitment-service.Dockerfile](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/recruitment-service.Dockerfile), and [docker-compose.yml](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/docker-compose.yml) updated for Sequelize migrations (`sequelize-cli db:migrate`). *Note: Docker images not built/started yet because Docker Desktop Engine is offline on this host.*
15. **Frontend & Backend Build Status**: Backend syntax check, Neon migration & seed, live Neon `/ready` probe, backend tests (`14/14`), frontend tests (`5/5`), and Vite production build all pass cleanly.

---

## 3. Feature Classification Matrix

### COMPLETED AND TESTED
- Project directory structure, `.env` loading, Express app bootstrap, `/health` & `/ready` probes against live **Neon PostgreSQL**.
- Sequelize 20-table schema, migration (`20261110000001-init-recruitment-schema.js`), and permission seeding (`seedPermissionCatalog` / `seedOrganisationRoles`).
- Subscription creation (with idempotency), payment proof upload, duplicate `payment_reference` prevention, Platform Admin queue, approval/rejection, duplicate verification block, passwordless Org Admin activation, and `SUSPENDED` tenant access blocking.
- Multi-tenant isolation (`requireTenant` header & parameter enforcement, cross-tenant `404` / `403` isolation).
- Live DB RBAC (`requirePermission`), adding employees with roles, reassigning roles, per-employee custom/revoked permissions, immediate deactivation enforcement, and employee recruitment activity tracking.
- HRMS Job API sync (preserving raw source payload + configuring recruitment metadata), manual job creation, editing, publish/unpublish, and public Careers API (`GET /jobs/public/careers`).
- Public job application with PDF resume upload, duplicate application prevention (`409`), signed file download token verification, and MIME type rejection (`400`).
- Stage 2 screening (`SHORTLIST` + immediate technical interview scheduling), Stage 3 technical round & feedback isolation, Stage 4 managerial precondition enforcement (`SELECTED` technical required), rescheduling, and managerial evaluation.
- Stage 5 final selection, Stage 6 offer creation & letter upload & candidate acceptance, Stage 7 joining initiation & joining letter & `HIRED` confirmation.
- Candidate Portal isolation (zero confidential remarks or interviewer feedback leaked) & 8-stage visual tracker (`StageTracker.jsx`).
- Recruitment Reports summary (`GET /reports/summary`), Audit Logs (`GET /audit-logs`), Zod validation (`422`), and brokerless standalone REST notification dispatch.
- Frontend `HomePage`, `SubscribePage`, `CareersPage`, `CandidatePortalPage`, and `StageTracker` Vitest/RTL tests + full Vite production bundle build.

### IMPLEMENTED BUT NOT TESTED
- **Secondary Backend Endpoints**: `POST /roles`, `PUT /roles/:roleId/permissions`, `POST /jobs/:id/close`, `GET /jobs/:id`, `GET /jobs/public/careers/:identifier`, `GET /organisations/profile`, `GET /organisations/employees`, `PATCH /organisations/employees/:employeeId/reactivate`, `GET /candidates`, `GET /candidates/:id`, `GET /interviews`, `GET /interviews/assigned/managerial`, `GET /offers`, `GET /offers/:id`, `POST /offers/:id/letter`, `POST /offers/:id/send`, `GET /joining`, `POST /joining/:id/letter`, `PATCH /portal/profile`, `POST /portal/offers/:offerId/respond` (`REJECT` decision), `POST /auth/login`, `GET /auth/me`.
- **Frontend Pages Verified by Build Only (No Dedicated RTL DOM Tests Yet)**: `FeaturesPage`, `PricingPage`, `AboutPage`, `ContactPage`, `LoginPage`, `ActivateAccountPage`, `JobDetailApplyPage`, `PlatformAdminReviewPage`, `OrganisationDashboardPage`, `OrganisationProfilePage`, `EmployeesPage`, `RolesPermissionsPage`, `JobsPage`, `JobFormModal`, `ApplicationsPage`, `ApplicationDetailModal`, `CandidatesPage`, `InterviewsPage`, `ScheduleInterviewModal`, `FeedbackModal`, `OffersPage`, `JoiningPage`, `ReportsPage`, `CandidateInterviewsPage`, `CandidateOffersPage`, `CandidateProfilePage`.
- **Docker & Ops Scripts**: `docker-compose.yml`, `client.Dockerfile`, `recruitment-service.Dockerfile`, `nginx.conf`, `db-backup.ps1`, `db-restore.ps1` (Docker Engine and `pg_dump`/`pg_restore` unavailable on host).

### PARTIALLY IMPLEMENTED
- **Contact Inquiry Form ([ContactPage.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/modules/marketing/ContactPage.jsx))**: Validates inputs and displays toast confirmation on the client without backend persistence.
- **Payment Remittance Instructions ([subscription.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/subscription/subscription.service.js))**: Uses static bank/SWIFT instruction template rather than externalized treasury env config.
- **Code Linting Tooling**: `node --check` verified; ESLint/Prettier config not yet added.

### NOT IMPLEMENTED / PENDING EXTERNAL CREDENTIALS
- **Live Cloudinary Cloud Delivery Verification**: `STORAGE_DRIVER` supports `LOCAL_SECURE` and `CLOUDINARY` (official `cloudinary` Node SDK authenticated delivery); live Cloudinary account credentials remain pending external provisioning ([STORAGE_SECURITY_AUDIT.md](file:///c:/Users/rathj/NEXNUV-Recruitment/docs/STORAGE_SECURITY_AUDIT.md)).
- **ESLint / Prettier CI Scripts**.

### BLOCKED BY SHARED SERVICE INTEGRATION
All `INTEGRATION_MODE=live` HTTP calls depend on inspecting and connecting the external NEXNUV microservices:
1. **Auth Service** (`AUTH_SERVICE_URL`)
2. **Platform Admin Service** (`PLATFORM_ADMIN_SERVICE_URL`)
3. **Employee Service** (`EMPLOYEE_SERVICE_URL`)
4. **Notification Service** (`NOTIFICATION_SERVICE_URL`)
5. **HRMS Core Service** (`HRMS_SERVICE_URL`)
6. **API Gateway** (`API_GATEWAY_URL`)
