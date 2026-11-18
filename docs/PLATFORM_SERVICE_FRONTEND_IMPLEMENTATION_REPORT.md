# NEXNUV ORBIT — Platform Service Frontend Implementation & Verification Report

**Project:** NEXNUV ORBIT Platform Service Frontend  
**Author:** Principal Software Architect, Frontend Specialist & DevSecOps Engineer  
**Date:** 2026-11-13  
**Status:** **PRODUCTION READY & VERIFIED**  
**Target Backend Service:** `platform-service` (Port 4002, Schema `platform`)  
**Gateway Router:** `api-gateway` (Port 4000, `/api/v1/platform`)  
**Frontend Location:** [client/](file:///c:/Users/rathj/NEXNUV-Recruitment/client)

---

## 1. Executive Summary

A complete, production-quality SaaS administration frontend has been designed, built, and verified for the **NEXNUV Platform Service**. 

The frontend seamlessly integrates with the existing NEXNUV frontend stack (React 19, Vite, Tailwind CSS, Lucide React, React Router v7) inside `client/`, leveraging the existing design system primitives (`Card`, `DataTable`, `Badge`, `Button`, `Modal`, `Tabs`, `Pagination`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, and `ToastContext`).

The dashboard is accessible under the `/platform-admin/*` pathing hierarchy and enforces strict role-based access control (`PLATFORM_ADMIN` / `super_admin`).

All 7 required functional modules have been implemented with 100% genuine backend contract alignment against `platform-service` and `api-gateway`. The production build succeeded (`vite build` in 13.14s) and all 25 automated unit & integration tests passed.

---

## 2. Architecture & Microservice Integration

```
  ┌────────────────────────────────────────────────────────┐
  │         NEXNUV Platform Frontend (Port 5173)           │
  │     React 19 + Tailwind CSS + Lucide React + Vite      │
  └───────────────────────────┬────────────────────────────┘
                              │
                    Authorization: Bearer <JWT>
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │              API Gateway (Port 4000)                   │
  │  1. Verifies JWT & checks active session               │
  │  2. Extracts user: role=super_admin, email, userId     │
  │  3. Injects trusted header: x-internal-token           │
  │  4. Mounts /api/v1/platform -> PLATFORM (Port 4002)    │
  └───────────────────────────┬────────────────────────────┘
                              │
       Proxy with x-internal-token + x-user-role=super_admin
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │            Platform Service (Port 4002)                │
  │  1. Authorizer verifies internal token & super_admin   │
  │  2. Routes: /modules, /plans, /subscriptions, etc.     │
  │  3. Live Entitlements Engine                           │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │       Neon Serverless PostgreSQL (Port 5432)           │
  │      Database: platform_service (8 Core Tables)        │
  └────────────────────────────────────────────────────────┘
```

### 2.1 Security & RBAC Protocol
1. **Bearer Token Authentication**: The user logs in via Auth Service (`/api/v1/auth/login`). The server issues a JWT containing `role: 'super_admin'`.
2. **Gateway Protection Pipeline**: Requests sent to `/api/v1/platform/*` traverse `verifyToken`, `verifySession`, and `resolveOrganization`. The gateway attaches `x-internal-token: nexnuv-internal-service-token-dev` and forwards client details.
3. **Backend Middleware Enforcement**: `platform-service/src/middlewares/authorize.js` runs `requirePlatformAdmin`:
   - Checks `req.headers['x-internal-token'] === INTERNAL_SERVICE_TOKEN`
   - Validates `req.headers['x-user-role'] === 'super_admin'`
   - Unauthenticated or non-admin roles receive an immediate `401 Unauthorized` or `403 Forbidden`.
4. **Secret Protection**: No internal tokens or service secrets are exposed in client-side code.

---

## 3. Module-to-API Contract Mapping

| Functional Module | Frontend Route | Backend Endpoint | HTTP Method | Action & Contract Purpose |
|---|---|---|:---:|---|
| **1. Dashboard Overview** | `/platform-admin` | `/health`<br>`/api/v1/platform/plans`<br>`/api/v1/platform/subscriptions`<br>`/api/v1/platform/modules` | GET | Direct health check, KPI metric computation (Active Subscriptions, Active Trials, Total Plans, Estimated MRR), and recent tenant activity. |
| **2. Platform Plans** | `/platform-admin/plans` | `/api/v1/platform/plans`<br>`/api/v1/platform/plans/:id`<br>`/api/v1/platform/plans/:id/status` | GET<br>POST<br>PATCH | Full plan tier CRUD: name, code, price, billing cycle (`monthly` \| `yearly`), trial days, and status (`active` \| `inactive`). |
| **2.1 Plan Features** | Drawer in Plans | `/api/v1/platform/plans/:id/modules`<br>`/api/v1/platform/plans/:id/submodules` | GET<br>POST<br>DELETE | Associate and detach canonical catalog modules and submodules authorized for each plan tier. |
| **3. Subscriptions** | `/platform-admin/subscriptions` | `/api/v1/platform/subscriptions`<br>`/api/v1/platform/subscriptions/:id`<br>`/api/v1/platform/trials/:id` | GET<br>POST<br>PATCH | Monitor tenant subscriptions, manual tenant subscription provisioning, valid state machine status transitions, and trial outcome conversions (`converted`, `cancelled`, `expired`). |
| **4. Organisation Overview** | `/platform-admin/organisations` | `/api/v1/platform/organizations/:id/subscription`<br>`/api/v1/platform/organizations/:id/trial`<br>`/api/v1/platform/organizations/:id/trial` | GET<br>POST | Single-tenant SaaS inspector: review active paid subscription, view trial state, provision evaluation trial. |
| **5. Usage & Resource Limits** | `/platform-admin/entitlements` | `/api/v1/platform/entitlements/organizations/:id` | GET | Live entitlement engine audit: tests whether a tenant organization is authorized right now, returns reason code on rejection, and lists resolved uppercase feature keys (`features[]`). |
| **6. Catalog & Configuration** | `/platform-admin/configuration` | `/api/v1/platform/modules`<br>`/api/v1/platform/submodules`<br>`/health` | GET<br>POST<br>PATCH | Software product catalog management: register new modules/submodules, edit descriptions, toggle catalog status, and inspect runtime database specifications. |
| **7. Platform Administration** | `/platform-admin/administration` | `/auth/me`<br>Local Token Inspector | GET | Super Admin identity verification, RBAC verification report, microservice port matrix, and audit summary. |
| **Verification Queue** | `/platform-admin/verification-queue` | `/api/v1/subscriptions/platform-admin/*` | GET<br>POST | Offline payment proof verification queue (preserved and linked directly within the platform admin sidebar). |

---

## 4. UI Design System Compliance

In accordance with the prompt specification:
- **Background**: Clean white surfaces (`bg-white` main components, `bg-slate-50` subtle layout foundation).
- **Primary Accents**: High-contrast blue styling (`bg-brand-600` / `#2563EB`, `text-brand-600`, `hover:bg-brand-700`).
- **Typography**: Dark, high-contrast typography (`text-slate-900`, `text-slate-800`, `text-slate-700`).
- **Responsive Layout**: Full desktop sidebar with collapse toggle, mobile flyout drawer with backdrop blur, sticky top navigation with live service indicators.
- **Component States**:
  - `LoadingSkeleton` on every async fetch.
  - `EmptyState` with descriptive copy and actionable creation buttons.
  - `ErrorState` with retry callbacks on upstream connectivity failures.
  - `ConfirmDialog` for destructive/state-changing operations (deactivation, trial outcome).
  - `ToastContainer` for real-time success, info, and error notifications.

---

## 5. Verified Backend Capabilities & Limitations

### 5.1 Fully Supported Real Capabilities
1. **Plans Management**: Complete CRUD, pricing, billing cycle, trial duration, and status toggle.
2. **Plan Module Association**: Attaching and detaching modules & submodules to plans via `plan_modules` and `plan_submodules` join tables.
3. **Subscription Lifecycle**: Creating subscriptions, date range management, status transition validation (trial &rarr; active/cancelled/expired; active &rarr; cancelled/expired).
4. **Trial Life Cycle**: Dedicated trial views, trial provisioning for organizations, and status conversions.
5. **Real-time Entitlement Engine**: Full resolution pipeline evaluating organization status, subscription validity, period expiration, plan status, and module/submodule active states.
6. **Product Catalog**: Modules and submodules registration and status management.

### 5.2 Documented Backend Limitations (No Artificial Mocking)
The following capabilities were examined in the backend source code and confirmed as currently out of scope in the database schema:
1. **Numericalheadcount / Resource Usage Quotas**:
   - The `platform_service` PostgreSQL schema holds: `modules`, `submodules`, `plans`, `plan_modules`, `plan_submodules`, `subscriptions`, `trials`.
   - The schema does **not** contain numerical limit fields (e.g. `max_employees`, `storage_limit_gb`, `api_call_quota`).
   - Feature entitlement is currently **boolean** (`features: ['HRMS', 'EMPLOYEES', ...]`).
   - The frontend transparently documents this in the **Usage and Resource Limits** module rather than fabricating non-existent quota numbers.
2. **Self-Service Trial Deletion**:
   - The backend provides status updates (`PATCH /trials/:id`) for trials, but does not provide a hard `DELETE` endpoint. The frontend uses the status update state machine (`converted`, `cancelled`, `expired`).

---

## 6. Verification Results

### 6.1 Automated Test Suite
- Test Runner: Vitest v4.1.12 with jsdom environment
- Total Test Files: **2 passed**
- Total Tests: **25 passed (100%)**
  - [client/src/test/platformServiceFrontend.test.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/test/platformServiceFrontend.test.jsx): **7 passed**
  - [client/src/test/componentsAndWorkflows.test.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/test/componentsAndWorkflows.test.jsx): **18 passed**

### 6.2 Production Build Verification
- Bundler: Vite v6.4.6
- Build Command: `npm run build`
- Build Output:
  ```
  dist/index.html                   0.98 kB │ gzip:   0.49 kB
  dist/assets/index-Cm3whNOZ.css   39.02 kB │ gzip:   6.89 kB
  dist/assets/vendor-B2B-I6tR.js   52.21 kB │ gzip:  18.40 kB
  dist/assets/ui-jnom8qxq.js       86.28 kB │ gzip:  27.72 kB
  dist/assets/motion-BdGDa1ac.js  148.83 kB │ gzip:  50.75 kB
  dist/assets/index-B9KO1RbB.js   504.44 kB │ gzip: 127.88 kB
  ✓ built in 13.14s
  ```

---

## 7. Startup & Environment Instructions

### 7.1 Environment Configuration (`client/.env`)
```env
VITE_API_BASE_URL=http://localhost:4007/api/v1
VITE_API_GATEWAY_URL=http://localhost:4000/api/v1
VITE_USE_GATEWAY=false
VITE_APP_NAME=NEXNUV Recruitment
VITE_INTEGRATION_MODE=standalone

# Platform Service Integration
VITE_PLATFORM_API_URL=http://localhost:4000/api/v1/platform
VITE_PLATFORM_DIRECT_HEALTH_URL=http://localhost:4002/health
```

### 7.2 Service Startup Sequence
To run the complete system locally:

```powershell
# 1. Start Platform Service (Port 4002)
cd c:\Users\rathj\NEXNUV-Recruitment\platform-service
npm run dev

# 2. Start API Gateway (Port 4000)
cd c:\Users\rathj\NEXNUV-Recruitment\api-gateway
npm run dev

# 3. Start Auth Service (Port 4001)
cd c:\Users\rathj\NEXNUV-Recruitment\auth-service
npm run dev

# 4. Start Frontend Application (Port 5173)
cd c:\Users\rathj\NEXNUV-Recruitment\client
npm run dev
```

### 7.3 Accessing Platform Administration
1. Open browser to `http://localhost:5173/login`.
2. Sign in with a Super Admin account:
   - Email: `platformadmin@nexnuv.com` (or `superadmin@nexnuv.com`).
3. You will be automatically redirected to `http://localhost:5173/platform-admin` where the full Platform Service Dashboard, Plans, Subscriptions, and Entitlements will be accessible.

