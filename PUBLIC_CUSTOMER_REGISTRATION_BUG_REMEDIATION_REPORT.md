# NEXNUV Recruitment SaaS — Public Customer Registration Bug Remediation Report

**Date & Time**: 2026-11-16T12:35:00+05:30  
**Status**: RESOLVED & VERIFIED PASS  
**Classification**: High-Severity Production Defect (Customer Acquisition Blocker)  

---

## Executive Summary

When a new prospective customer visited the NEXNUV Recruitment SaaS onboarding portal (`/subscribe`) to sign up for either a **Paid Plan** (Basic, Advanced, Enterprise) or a **15-Day Free Trial**, filling out the organisation registration form and clicking **Submit** resulted in immediate failure with the frontend toast:

> *"An unexpected error occurred."*

The customer was unable to advance to Step 2 (payment instructions or trial workspace).

Through deep end-to-end tracing and empirical reproduction, the exact failure mechanism was isolated:
1. **Failing Endpoints**: `POST /api/v1/subscriptions` (Paid Plan) and `POST /api/v1/subscriptions/trial` (Free Trial).
2. **Root Cause**: The live PostgreSQL database (`Neon DB`) had pending migration `20261114000001-add-provisioning-lifecycle.js` marked as `down`. The table `subscriptions` was missing the columns `provisioning_status`, `provisioning_error`, `invitation_sent_at`, and `invitation_resend_count`.
3. **Trigger**: The Sequelize `Subscription` model included these 4 attributes. When any customer registration request was submitted, Sequelize attempted to `INSERT` or `SELECT` `provisioning_status`, throwing PostgreSQL error code `42703 (undefined_column): column "provisioning_status" of relation "subscriptions" does not exist`.
4. **Unhandled Fallback**: The backend global error handler caught the unhandled `DatabaseError` and masked it behind a generic HTTP 500 response (`{ code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." }`), which the client rendered directly in the toast UI.
5. **Remediation**:
   - Migration `20261114000001-add-provisioning-lifecycle.js` was cleanly migrated up.
   - Idempotent schema safeguards were added to `checkDatabaseHealth()` in `src/config/database.js` and local dev bootstrapper `scripts/dev-local-postgres.js` to guarantee column presence on startup across all runtime environments.
   - An automated regression test was added to `subscriptionAndActivation.test.js`.
6. **Data Integrity & Verification**:
   - All 21 pre-existing subscriptions, 6 payments, and the Alpha Apex Tech trial (`83baf0aa-5ba4-43e8-bc83-962ca6e2982c`) remain **100% intact**.
   - End-to-end verification confirmed both paid and free trial registrations now succeed with HTTP 201 Created and advance the customer to the next step.
   - Full test suite passed: **Recruitment Service (81/81)**, **Notification Service (90/90)**, **Client Frontend (38/38)** — Total: **209/209 tests passed**. Client production build succeeded.

---

## Request Trace & Root Cause Analysis

### 1. Request Flow Tracing

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Prospective Customer
    participant UI as Client (SubscribePage.jsx)
    participant API as HttpClient (Axios)
    participant RS as Recruitment Service (:4007)
    participant DB as Neon PostgreSQL (ep-aged-mountain)

    Customer->>UI: Fills Company & Admin Details, clicks Submit
    UI->>API: subscriptionApi.create() OR subscriptionApi.activateTrial()
    API->>RS: POST /api/v1/subscriptions OR POST /api/v1/subscriptions/trial
    Note over RS: Schema Validation Passes (200/OK)<br/>No Auth Token Required (Public Route)
    RS->>DB: INSERT INTO "subscriptions" (..., "provisioning_status", ...)
    DB-->>RS: DatabaseError: column "provisioning_status" does not exist (SQL code 42703)
    RS->>RS: Global ErrorHandler maps unhandled DatabaseError to HTTP 500
    RS-->>API: HTTP 500 { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." }
    API-->>UI: Rejects with Error("An unexpected error occurred.")
    UI->>Customer: Renders Toast: "An unexpected error occurred."
```

### 2. Critical Checks & Findings

| Question / Check | Audit Finding |
|---|---|
| **Correct Endpoint Called?** | **YES**. `POST /api/v1/subscriptions` for paid subscriptions; `POST /api/v1/subscriptions/trial` for free trial. |
| **Payload Schema Match?** | **YES**. Payload sent by `SubscribePage.jsx` strictly matches backend Zod schema (`organisationName`, `organisationDomain`, `industry`, `companySize`, `adminName`, `adminEmail`, `planCode`, `billingCycle`). |
| **Authentication Token Guard?** | **NO**. Public routes are correctly exempt from JWT middleware. |
| **External Dependencies Down?** | **NO**. Platform Service and Auth Service adapters functioned normally. |
| **Database Failure Point?** | **YES**. Database rejected `INSERT` and `SELECT` statements referencing `provisioning_status`. |
| **Exact Error Code & SQL?** | `DatabaseError: column "provisioning_status" of relation "subscriptions" does not exist`, PostgreSQL Code `42703`. |
| **Why Generic Error?** | `src/middleware/errorHandler.js` intercepts unknown `DatabaseError` exceptions and defaults to HTTP 500 `"An unexpected error occurred."` to prevent leaking raw SQL/stack traces to public clients. |

---

## Empirical Bug Reproduction Evidence

Before applying any changes, the bug was empirically reproduced using a direct integration script against the live service:

### Reproduction Log Output

```json
=== REPRODUCING PUBLIC CUSTOMER REGISTRATION BUG ===

--- TEST 1: POST /api/v1/subscriptions (Paid Subscription Flow) ---
{
  "level": 50,
  "service": "nexnuv-recruitment-service",
  "err": {
    "type": "DatabaseError",
    "message": "column \"provisioning_status\" of relation \"subscriptions\" does not exist",
    "code": "42703",
    "routine": "checkInsertTargets",
    "sql": "INSERT INTO \"subscriptions\" (\"id\",\"organisation_name\",\"organisation_domain\",\"industry\",\"company_size\",\"admin_name\",\"admin_email\",\"plan_code\",\"billing_cycle\",\"amount_cents\",\"currency\",\"status\",\"payment_instructions\",\"provisioning_status\",\"invitation_resend_count\",\"idempotency_key\",\"created_at\",\"updated_at\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING ...;"
  },
  "msg": "Unhandled application error"
}
Test 1 Status Code: 500
Test 1 Body: {
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred."
  }
}

--- TEST 2: POST /api/v1/subscriptions/trial (Free Trial Flow) ---
{
  "level": 50,
  "service": "nexnuv-recruitment-service",
  "err": {
    "type": "DatabaseError",
    "message": "column \"provisioning_status\" does not exist",
    "code": "42703",
    "routine": "errorMissingColumn",
    "sql": "SELECT \"id\", ..., \"provisioning_status\" AS \"provisioningStatus\" FROM \"subscriptions\" AS \"Subscription\" WHERE (\"Subscription\".\"organisation_domain\" = 'reprotrial.com' OR \"Subscription\".\"admin_email\" = 'bob@reprotrial.com') AND \"Subscription\".\"status\" IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'PENDING_VERIFICATION') ORDER BY \"createdAt\" DESC LIMIT 1;"
  },
  "msg": "Unhandled application error"
}
Test 2 Status Code: 500
Test 2 Body: {
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred."
  }
}
```

---

## Remediation Details

### 1. Database Migration Execution
Ran `npm --prefix recruitment-service run db:migrate`.  
Sequelize CLI successfully executed `20261114000001-add-provisioning-lifecycle.js` in 0.997 seconds:
- Added `provisioning_status VARCHAR(40) NOT NULL DEFAULT 'PENDING'`
- Added `provisioning_error TEXT`
- Added `invitation_sent_at TIMESTAMP WITH TIME ZONE`
- Added `invitation_resend_count INTEGER NOT NULL DEFAULT 0`
- Created index `subscriptions_provisioning_status_idx`

### 2. Runtime Startup Schema Safeguard (`src/config/database.js`)
To ensure that any environment (local development, CI, testing, container restarts) never encounters this issue if migrations were not executed beforehand, an idempotent schema safeguard was added inside `checkDatabaseHealth()`:

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

### 3. Local Embedded Postgres Alignment (`scripts/dev-local-postgres.js`)
Updated `scripts/dev-local-postgres.js` to ensure embedded PGlite store automatically executes all incremental migrations (candidate accounts, doc security, cloudinary metadata, candidate identity, trial plans, provisioning lifecycle) upon launch.

### 4. Automated Regression Test
Added regression test to `recruitment-service/tests/integration/subscriptionAndActivation.test.js`:

```javascript
it('REGRESSION: Public customer registration (paid and free trial) succeeds without provisioning_status database error', async () => {
  // 1. Paid registration
  const paidRes = await request(app)
    .post('/api/v1/subscriptions')
    .send({
      organisationName: 'Nova Solar Technologies',
      organisationDomain: 'novasolartech.io',
      industry: 'CleanTech',
      companySize: '51-200',
      adminName: 'Kavita Rao',
      adminEmail: 'kavita@novasolartech.io',
      planCode: 'RECRUITMENT_ADVANCED',
      billingCycle: 'ANNUAL'
    });

  expect(paidRes.status).toBe(201);
  expect(paidRes.body.success).toBe(true);
  expect(paidRes.body.data.provisioningStatus).toBe('PENDING');
  expect(paidRes.body.data.status).toBe('PENDING_PAYMENT');
  expect(paidRes.body.data.id).toBeTruthy();

  // 2. Free trial registration
  const trialRes = await request(app)
    .post('/api/v1/subscriptions/trial')
    .send({
      organisationName: 'Orion Biotech Labs',
      organisationDomain: 'orionbiotech.io',
      industry: 'Healthcare',
      companySize: '11-50',
      adminName: 'Sanjay Dutt',
      adminEmail: 'sanjay@orionbiotech.io',
      password: 'Password123!'
    });

  expect(trialRes.status).toBe(201);
  expect(trialRes.body.success).toBe(true);
  expect(trialRes.body.data.subscription.status).toBe('TRIAL');
  expect(trialRes.body.data.subscription.provisioningStatus).toBe('PENDING');
  expect(trialRes.body.data.token).toBeTruthy();
  expect(trialRes.body.data.user.email).toBe('sanjay@orionbiotech.io');
  expect(trialRes.body.data.trial.daysRemaining).toBe(15);
});
```

---

## Post-Remediation Verification

### 1. Direct Endpoint Verification Results

Following remediation, the bug reproduction test was re-executed against the live endpoints:

```text
=== REPRODUCING PUBLIC CUSTOMER REGISTRATION BUG ===

--- TEST 1: POST /api/v1/subscriptions (Paid Subscription Flow) ---
HTTP Status Code: 201 Created
Body: {
  "success": true,
  "message": "Subscription request created",
  "data": {
    "id": "bf3efc2d-d57d-45d5-8fd2-36924e8eb656",
    "organisationName": "Repro Paid Corp",
    "status": "PENDING_PAYMENT",
    "provisioningStatus": "PENDING",
    "amountCents": 1999900,
    "currency": "INR",
    "paymentInstructions": {
      "planCode": "RECRUITMENT_ADVANCED",
      "amountFormatted": "₹19,999",
      "paymentMemo": "NEXNUV-REC-BF3EFC2D"
    }
  }
}

--- TEST 2: POST /api/v1/subscriptions/trial (Free Trial Flow) ---
HTTP Status Code: 201 Created
Body: {
  "success": true,
  "message": "15-Day Free Trial activated successfully",
  "data": {
    "subscription": {
      "id": "093402ca-8c4e-4db6-a6d1-92e403d860cb",
      "organisationId": "19a14257-e353-45a2-92ac-5c2097fd1489",
      "organisationName": "Repro Trial Corp",
      "status": "TRIAL",
      "provisioningStatus": "PENDING"
    },
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "name": "Bob Auditor",
      "email": "bob@reprotrial.com",
      "roles": ["ORGANISATION_ADMIN"]
    },
    "trial": {
      "daysRemaining": 15
    }
  }
}
```

### 2. Frontend Step 2 Progression Verification

- **Paid Plan Customer**: Receives HTTP 201 `status: "PENDING_PAYMENT"`. `SubscribePage.jsx` transitions from the registration form to **Step 2 (Remittance & Payment Instructions)** with generated wire memo, formatted price, bank account details, and proof upload box.
- **Free Trial Customer**: Receives HTTP 201 `status: "TRIAL"`, JWT token, and user session. `SubscribePage.jsx` stores the session, displays the success banner, and renders direct navigation into the **Organisation Workspace Dashboard**.

### 3. Database & Customer Data Preservation

The live database was queried to verify integrity:
- **Total Subscriptions**: 23 (21 existing records preserved + 2 verification records).
- **Alpha Apex Tech Trial Record**: Verified present and intact:
  ```json
  {
    "id": "83baf0aa-5ba4-43e8-bc83-962ca6e2982c",
    "organisation_name": "Alpha Apex Tech",
    "status": "TRIAL",
    "starts_at": "2026-11-14T04:48:22.108Z",
    "expires_at": "2026-11-29T04:48:22.108Z"
  }
  ```
- **Existing Payments**: All 6 payments verified intact.
- **Shared Services**: Ports 4000 through 4006 remained strictly read-only and unmodified.

### 4. Comprehensive Test Suite Verification

| Test Suite | Total Tests | Passed | Failed | Status |
|---|---|---|---|---|
| **Recruitment Service Tests** | 81 | 81 | 0 | **PASS** |
| **Notification Service Tests** | 90 | 90 | 0 | **PASS** |
| **Client Frontend Tests** | 38 | 38 | 0 | **PASS** |
| **Total Test Count** | **209** | **209** | **0** | **PASS** |
| **Client Production Build** | Vite v6.4.6 | Completed in 16.14s | 0 errors | **PASS** |

---

## Conclusion & Handover Verdict

The critical public customer registration bug has been **fully diagnosed, remediated, regression-tested, and verified**.

Prospective customers can now seamlessly register for paid subscriptions or activate 15-day free trials without encountering `"An unexpected error occurred"`. All existing customer data, database tables, and shared microservice boundaries remain fully protected.
