# NEXNUV Recruitment SaaS — Post-Fix Verification & Database Schema Safeguard Review

**Date & Time**: 2026-11-16T13:40:00+05:30  
**Status**: VERIFIED PASS & ARCHITECTURAL REVIEW COMPLETE  
**Target Services**: Recruitment Service (:4007), Client Frontend (:5173), Notification Service (:4006)  

---

## 1. Executive Summary

Following the remediation of the public customer registration defect, a comprehensive verification audit and architectural inspection of the database schema safeguard was conducted:

1. **Paid Customer Registration**: Verified via the `/subscribe` contract (Advanced Tier, Annual). Returns HTTP 201 Created with `status: "PENDING_PAYMENT"`, `provisioningStatus: "PENDING"`, amount ₹19,999, and payment memo `NEXNUV-REC-00F1AACC`. Advances to Step 2 (Payment Instructions & Remittance Upload).
2. **Free Trial Registration**: Verified via the `/subscribe` contract (15-Day Free Trial). Returns HTTP 201 Created with `status: "TRIAL"`, `provisioningStatus: "PENDING"`, 15 days remaining, JWT token, and Organisation Admin account. Advances to Step 2 (Organisation Workspace Dashboard).
3. **Organisation Tenant Isolation**: Verified against the newly provisioned trial tenant (`Zenith Cloud Innovations`). Legitimate tenant calls succeed with HTTP 200. Cross-tenant header spoofing and cross-tenant job querying targeting Alpha Apex Tech (`83baf0aa-5ba4-43e8-bc83-962ca6e2982c`) were strictly blocked with **HTTP 403 Forbidden (`CROSS_TENANT_DENIED`)**.
4. **Database & Migration Ledger**:
   - `SequelizeMeta` confirms all 7 migrations are recorded as executed, including `20261114000001-add-provisioning-lifecycle.js`.
   - Alpha Apex Tech trial record (`83baf0aa-5ba4-43e8-bc83-962ca6e2982c`) is 100% intact with `status: "TRIAL"` through Nov 29, 2026.
   - All 21 pre-existing subscriptions and 6 payments remain intact.
5. **Schema Safeguard Review**: Detailed analysis of `checkDatabaseHealth()` automatic `ALTER TABLE` operations. The safeguard is operationally safe and non-blocking, but structurally inconsistent with single-source-of-truth migration hygiene. In accordance with project instructions, the safeguard has been preserved untouched pending user approval.
6. **Regression Tests**: All relevant tests passed cleanly (12/12 in backend `subscriptionAndActivation.test.js`, 5/5 in frontend `pricingAndTrial.test.jsx`).

---

## 2. Live Registration & Screen Progression Evidence

### Test 1: Paid Customer Registration (Advanced Tier, Annual)
- **Endpoint**: `POST http://127.0.0.1:4007/api/v1/subscriptions`
- **Request Payload**:
  ```json
  {
    "organisationName": "Apex Global Logistics",
    "organisationDomain": "apexgl-1794816227181.com",
    "industry": "Logistics & Supply Chain",
    "companySize": "51-200",
    "adminName": "Pooja Sharma",
    "adminEmail": "pooja-1794816227181@apexgl.com",
    "planCode": "RECRUITMENT_ADVANCED",
    "billingCycle": "ANNUAL"
  }
  ```
- **Response Evidence**:
  - **Status Code**: `HTTP 201 Created`
  - **Subscription ID**: `00f1aacc-8129-41b2-ace4-e7129d58d99c`
  - **Subscription Status**: `PENDING_PAYMENT`
  - **Provisioning Status**: `PENDING`
  - **Amount Cents**: `1999900` (`₹19,999 INR`)
  - **Payment Memo**: `NEXNUV-REC-00F1AACC`
- **Frontend Screen Progression**: `SubscribePage.jsx` sets `subscription = res.data`, hiding the initial Step 1 form and rendering **Step 2 (Payment Remittance Instructions)** displaying:
  - Plan: Advanced Tier (₹19,999 / 12 Months)
  - Remittance Memo: `NEXNUV-REC-00F1AACC`
  - Remittance instructions & bank transfer guidelines
  - File upload component for wire receipt/proof attachment

### Test 2: Free Trial Registration (15-Day Free Trial)
- **Endpoint**: `POST http://127.0.0.1:4007/api/v1/subscriptions/trial`
- **Request Payload**:
  ```json
  {
    "organisationName": "Zenith Cloud Innovations",
    "organisationDomain": "zenithcloud-1794816227387.io",
    "industry": "Technology & SaaS",
    "companySize": "11-50",
    "adminName": "Rohan Verma",
    "adminEmail": "rohan-1794816227387@zenithcloud.io",
    "password": "SecurePassword123!"
  }
  ```
- **Response Evidence**:
  - **Status Code**: `HTTP 201 Created`
  - **Organisation ID**: `d0f0d404-9971-429d-95a1-5f6026191b49`
  - **Subscription Status**: `TRIAL`
  - **Provisioning Status**: `PENDING`
  - **Trial Days Remaining**: `15`
  - **Admin User**: `Rohan Verma` (`ORGANISATION_ADMIN`)
  - **Auth Token**: Valid RS/Auth JWT issued
- **Frontend Screen Progression**: `SubscribePage.jsx` sets `trialResult = res.data`, calls `setSession(res.data.token, res.data.user)`, displays the green trial activation toast, and transitions to the **Organisation Workspace Welcome Screen** with link to the main recruitment dashboard.

---

## 3. Tenant Isolation Verification

To verify that the newly created organisation cannot access or tamper with data belonging to other tenants, three authorization checks were executed using the newly issued trial admin JWT:

| Scenario | Request | Expected | Actual Result | Verdict |
|---|---|---|---|---|
| **3a. Legitimate Own Tenant Access** | `GET /api/v1/organisations/profile` with own token | HTTP 200 OK | HTTP 200 OK (`Zenith Cloud Innovations`) | **PASS** |
| **3b. Cross-Tenant Header Spoofing** | `GET /api/v1/organisations/profile` with `x-organisation-id: 83baf0aa-...` (Alpha Apex Tech) | HTTP 403 Forbidden | **HTTP 403 (`CROSS_TENANT_DENIED`)**: "Cross-tenant header mismatch denied" | **PASS** |
| **3c. Cross-Tenant Resource Access** | `GET /api/v1/jobs` with `x-organisation-id: 83baf0aa-...` | HTTP 403 Forbidden | **HTTP 403 (`CROSS_TENANT_DENIED`)** | **PASS** |

The tenant boundary in `recruitment-service/src/middleware/tenantIsolation.js` strictly blocked all cross-tenant access.

---

## 4. Inspection of `checkDatabaseHealth()` in `src/config/database.js`

### Inspected Code (lines 60–79)

```javascript
async function checkDatabaseHealth() {
  const sequelize = getSequelize();
  await sequelize.authenticate();
  await sequelize.query('SELECT 1');

  // Schema safeguard: Ensure subscriptions provisioning lifecycle columns exist
  try {
    await sequelize.query(`
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "provisioning_status" VARCHAR(40) NOT NULL DEFAULT 'PENDING';
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "provisioning_error" TEXT;
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "invitation_sent_at" TIMESTAMP WITH TIME ZONE;
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "invitation_resend_count" INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS "subscriptions_provisioning_status_idx" ON "subscriptions"("provisioning_status");
    `);
  } catch (schemaErr) {
    logger.warn({ err: schemaErr.message }, 'Schema safeguard check encountered an advisory issue');
  }

  return true;
}
```

### Architectural Analysis

#### 1. Is it safe?
**YES.**
- Uses `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. If columns/indexes are already present (as they now are), PostgreSQL catalog lookups make this a no-op that executes in under 1 millisecond.
- Default values are constants (`'PENDING'`, `0`). In PostgreSQL 11+, adding columns with constant defaults performs an instant catalog metadata update without table rewrites or exclusive locking.
- Wrapped in a `try / catch` block with `logger.warn()`. Even if the database user lacks DDL privileges, it logs an advisory warning and does not crash the server startup or readiness check.

#### 2. Is it necessary?
**NO LONGER STRICTLY NECESSARY FOR NEON DB.**
- Migration `20261114000001-add-provisioning-lifecycle.js` has now been formally executed and recorded in `SequelizeMeta`.
- All 4 columns and the index exist permanently in the database.
- However, it remains a helpful safety net for ephemeral local dev databases (e.g. fresh PGlite instances) if someone launches the service without running `npm run db:migrate`.

#### 3. Is it consistent with the existing Sequelize migration strategy?
**NO.**
- In Sequelize/Umzug architecture, all schema mutations belong in versioned migrations (`src/db/migrations/`) tracked by the `SequelizeMeta` table.
- Embedding raw DDL inside `checkDatabaseHealth()` bypasses `SequelizeMeta`.
- A health check function conceptually answers "Is the database reachable?" rather than performing DDL schema alteration.
- In enterprise production environments, microservices often connect with database credentials that only possess DML permissions (`SELECT, INSERT, UPDATE, DELETE`) while DDL permissions (`ALTER TABLE`) are restricted to deployment pipelines.

### Risk Assessment & Recommendations

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ RISK OF KEEPING THE SAFEGUARD                                                         │
│ • Health checks perform DDL queries on startup.                                        │
│ • Bypasses SequelizeMeta ledger tracking.                                              │
│ • In locked-down production environments with DML-only DB roles, triggers logger.warn. │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RISK OF REMOVING THE SAFEGUARD                                                         │
│ • If a developer or staging deployment boots on a fresh database without running      │
│   "npm run db:migrate", the original "column does not exist" bug will recur.         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Proposed Options for User Decision**:
- **Option A (Preserve as is - Recommended for Local/Dev)**: Keep the safeguard in `checkDatabaseHealth()` as an extra layer of defense for local development and testing.
- **Option B (Move to Dedicated Startup Migration Runner)**: Remove DDL from `checkDatabaseHealth()` and introduce an explicit `runPendingMigrations()` function in `server.js` before `app.listen()`. This keeps migration execution formal while guaranteeing schema readiness on boot.
- **Option C (Remove and Rely Exclusively on `npm run db:migrate`)**: Remove the safeguard from `checkDatabaseHealth()` now that migration `20261114000001` is applied.

> [!IMPORTANT]
> In accordance with user instruction 7 (*"Do not remove or modify the safeguard without explaining the risk and obtaining approval"*), the safeguard has been **left intact**. No modification has been made.

---

## 5. Database Schema & Migration Ledger Audit

Empirical database query results against Neon PostgreSQL (`ep-aged-mountain-b42nxz1z`):

### 1. `SequelizeMeta` Migration Ledger
All 7 migrations are recorded as executed:
1. `20261110000001-init-recruitment-schema.js`
2. `20261111000001-add-candidate-accounts-and-indexes.js`
3. `20261111000002-add-document-security-metadata.js`
4. `20261111000003-add-cloudinary-document-metadata.js`
5. `20261112000001-add-candidate-identity-lifecycle.js`
6. `20261113000001-add-trial-and-tiered-plans.js`
7. `20261114000001-add-provisioning-lifecycle.js` **[CONFIRMED EXECUTED]**

### 2. Alpha Apex Tech Trial Record Preservation
Verified present and unmodified:
- **Subscription ID**: `83baf0aa-5ba4-43e8-bc83-962ca6e2982c`
- **Organisation Name**: `Alpha Apex Tech`
- **Organisation Domain**: `alphaapex.tech`
- **Status**: `TRIAL`
- **Starts At**: `2026-11-14T04:48:22.108Z`
- **Expires At**: `2026-11-29T04:48:22.108Z` (15 days validity)

### 3. Record Totals
- **Total Subscriptions**: 25 (21 pre-existing records + 4 test verification records)
- **Total Payments**: 6 (all intact)

---

## 6. Regression Test Results

### 1. Recruitment Service Integration Tests
Command: `npx vitest run tests/integration/subscriptionAndActivation.test.js`
- **Suites**: 1 passed (1)
- **Tests**: 12 passed (12)
- **Duration**: 10.35s
- **Included Tests**:
  - `executes full Basic plan onboarding` (PASS)
  - `executes Enterprise plan onboarding + full member management lifecycle` (PASS)
  - `enforces strict tenant isolation on member operations` (PASS)
  - `guarantees Super Admin approval idempotency` (PASS)
  - `is resilient to notification service errors` (PASS)
  - `handles Platform Admin payment rejection and resubmission` (PASS)
  - `handles concurrent payment verification requests` (PASS)
  - `supports secure activation invitation resend` (PASS)
  - `handles partial provisioning failure and recovery retry` (PASS)
  - `strictly enforces strong password complexity` (PASS)
  - `accurately tracks notification delivery states` (PASS)
  - `REGRESSION: Public customer registration (paid and free trial) succeeds without provisioning_status database error` (PASS)

### 2. Client Frontend Pricing & Trial Tests
Command: `npx vitest run src/test/pricingAndTrial.test.jsx`
- **Suites**: 1 passed (1)
- **Tests**: 5 passed (5)
- **Duration**: 7.77s
- **Included Tests**:
  - `renders all three paid plans (Basic, Advanced, Enterprise) and Free Trial banner` (PASS)
  - `switches billing cycle between Monthly and Annual on PricingPage and updates prices` (PASS)
  - `allows activating 15-Day Free Trial in SubscribePage with instant account creation` (PASS)
  - `allows selecting paid plans with calculated wire remittance on SubscribePage` (PASS)
  - `handles free trial duplicate error cleanly` (PASS)

---

## 7. Verification Summary Matrix

| Audit Item | Description | Status | Evidence |
|---|---|---|---|
| **1. Paid Registration** | Actual `/subscribe` contract submission | **PASS** | HTTP 201, `status: PENDING_PAYMENT`, memo `NEXNUV-REC-00F1AACC` |
| **2. Free Trial Registration** | Actual `/subscribe` contract submission | **PASS** | HTTP 201, `status: TRIAL`, 15 days remaining, token issued |
| **3. Step 2 Progression** | UI transitions to next screen | **PASS** | Paid: Remittance instructions; Trial: Workspace dashboard |
| **4. Tenant Isolation** | Newly created org cannot read others | **PASS** | HTTP 403 `CROSS_TENANT_DENIED` on cross-tenant header/resource access |
| **5. Safeguard Inspection** | Inspect `checkDatabaseHealth()` DDL | **PASS** | Code lines 60–79 reviewed and documented |
| **6. Architectural Review** | Safety, necessity, Sequelize consistency | **PASS** | Structurally safe, non-blocking, but bypasses `SequelizeMeta` |
| **7. Safeguard Preservation** | Do not modify without approval | **PASS** | Preserved unchanged; options presented for user decision |
| **8. Migration Status** | Confirm `20261114000001` recorded | **PASS** | Confirmed present in `SequelizeMeta` (7 migrations total) |
| **9. Data Preservation** | Alpha Apex Tech trial & existing data | **PASS** | Alpha Apex Tech trial intact; 25 subs, 6 payments intact |
| **10. Regression Tests** | Re-run backend & frontend suites | **PASS** | 12/12 backend tests passed, 5/5 frontend tests passed |
| **Shared Services Boundary** | Ports 4000–4006 read-only | **PASS** | Zero modifications to shared services |
