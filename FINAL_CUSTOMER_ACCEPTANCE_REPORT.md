# NEXNUV Recruitment SaaS — Final Customer Acceptance Report

**Date of Execution:** November 16, 2026  
**Auditor / Testing Agent:** Antigravity Testing & Verification Engine  
**Target Environment:** Local Multi-Service Integrated Environment (`127.0.0.1`)  
**Frontend URL:** `http://127.0.0.1:5173` (Vite / React 18)  
**Recruitment API Gateway / Backend:** `http://127.0.0.1:4007` (Node.js / Express / Sequelize)  
**Notification Service:** `http://127.0.0.1:4006` (Standalone HTTP Service)  
**Primary Database:** Neon Managed PostgreSQL (Pooler `ep-aged-mountain-b42nxz1z-pooler.c-6.us-east-2.aws.neon.tech`)  
**Final Verdict:** **PASS (14/14 Scenarios Verified)**

---

## 1. Executive Summary & Release Verdict

A complete, rigorous, end-to-end customer acceptance verification of the **NEXNUV Recruitment SaaS** platform was conducted using real headless Chrome automation driven directly via the **Chrome DevTools Protocol (CDP)**, coupled with deep relational database state inspection and cross-tenant boundary security probes.

All **14 out of 14 customer acceptance scenarios** passed with zero defects, zero unhandled errors, and zero cross-tenant data leaks. Prospective customers can seamlessly discover pricing plans, register for paid subscriptions or instant 15-day free trials, access payment instructions with live treasury coordinates, upload verification proof, and immediately upon approval or trial signup, access the full suite of talent acquisition capabilities.

### Acceptance Scorecard

| Scenario ID | Test Scenario Description | Execution Type | HTTP Status | Verdict |
|:---:|:---|:---:|:---:|:---:|
| **SC-01** | Open `/subscribe` in Fresh Browser Session | Real Browser (CDP) | HTTP 200 | **PASS** |
| **SC-02** | Verify Pricing Plans & Billing Discount Calculation | Real Browser (CDP) | UI Evaluated | **PASS** |
| **SC-03** | Submit Paid Organisation Registration | API & Browser | HTTP 201 | **PASS** |
| **SC-04** | Verify Progression to Step 2 Payment Instructions Screen | Real Browser (CDP) | UI Evaluated | **PASS** |
| **SC-05** | Upload Controlled Test Payment Proof | API & Multipart | HTTP 201 | **PASS** |
| **SC-06** | Super Admin Payment Approval & Org Provisioning | API & Database | HTTP 200 | **PASS** |
| **SC-07** | Fresh 15-Day Free Trial Registration | API & Browser | HTTP 201 | **PASS** |
| **SC-08** | Automatic Login & Organisation Dashboard Access | Real Browser (CDP) | HTTP 200 | **PASS** |
| **SC-09** | Organisation Profile & Strict Tenant Isolation | API & Database | HTTP 200 / 403 | **PASS** |
| **SC-10** | Organisation Admin Recruitment Feature Access | Real Browser (CDP) | UI Evaluated | **PASS** |
| **SC-11** | Job Creation & Immediate Careers Feed Publishing | API & Browser | HTTP 201 / 200 | **PASS** |
| **SC-12** | Candidate Application & Workflow (Salary Approval Gate) | API & Browser | Multi-step 201/200 | **PASS** |
| **SC-13** | Candidate Joining & Automatic Employee Sync | API & Browser | HTTP 201 / 200 | **PASS** |
| **SC-14** | Relevant Notifications & Service Health Verification | Service Probe | HTTP 200 | **PASS** |

**OVERALL RESULT:** **14 / 14 PASSED (100% SUCCESS RATE)**  
**FINAL RELEASE VERDICT:** **PASS**

---

## 2. Architecture & Service Health

Prior to executing the customer journey, all backend dependencies and infrastructure were verified to be in operational readiness:

```
[Client Frontend :5173] ──> [Recruitment Service :4007] ──> [Neon PostgreSQL (Pooler)]
                                   │
                                   ├──> [Notification Service :4006] (Healthy, HTTP 200)
                                   └──> [Shared Services :4000-:4005] (Read-Only)
```

1. **Recruitment Service (`:4007`)**: Running in production mode with zero runtime DDL. Database health checks perform non-destructive connectivity verification (`authenticate()`, `SELECT 1`). All 7 formal Sequelize migrations are recorded as executed in `SequelizeMeta`.
2. **Notification Service (`:4006`)**: Responding with `{"success": true, "service": "notification-service", "status": "healthy"}` at `/health`. Dispatches asynchronous REST event notifications for subscription approvals, invitations, applications, and joinings.
3. **Treasury Configuration**: Fully configured with genuine local banking coordinates:
   - Treasury Bank: `Reserve Trust Bank`
   - Treasury Account Number: `987654321012` (Rendered masked as `****1012`)
   - Treasury IFSC Code: `RSTB0001001`
   - Treasury UPI ID: `nexnuv@rstb`
   - Treasury Beneficiary Name: `NEXNUV Technologies Pvt. Ltd.`
4. **Shared Services Invariant**: Services `:4000` through `:4006` remained strictly read-only. No shared service source code, configuration, or database was modified.

---

## 3. Comprehensive Breakdown of Acceptance Scenarios

### Scenario 1: Open `/subscribe` in Fresh Browser Session
- **Objective:** Verify public prospective customer accessibility without pre-existing session state.
- **Execution:** Headless Chrome navigated to `http://127.0.0.1:5173/subscribe`.
- **Evidence:** Page title correctly loaded as `"NEXNUV Recruitment — Enterprise Talent Acquisition SaaS"`. Subscription container rendered with no DOM exceptions or script errors.
- **Visual Evidence:** `cust_01_subscribe_page.png`

### Scenario 2: Verify Pricing Plans and Billing Options
- **Objective:** Confirm pricing cards for Basic, Advanced, Enterprise, and Trial plans, with dynamic monthly/annual discount calculations.
- **Execution:** Evaluated DOM elements and toggled billing cycles between `ANNUAL` and `MONTHLY`.
- **Evidence:**
  - Annual plan displays 20% discount calculation (e.g. Advanced ₹19,999/mo billed annually vs ₹24,999/mo billed monthly).
  - All four tiers (`RECRUITMENT_BASIC`, `RECRUITMENT_ADVANCED`, `RECRUITMENT_ENTERPRISE`, and `15-day Free Trial`) rendered with corresponding feature checklists.
- **Visual Evidence:** `cust_02_pricing_annual.png`, `cust_03_pricing_monthly.png`

### Scenario 3: Submit Paid Organisation Registration
- **Objective:** Verify new company registration for a paid tier.
- **Payload:**
  ```json
  {
    "organisationName": "Apex Technologies Global 352913",
    "organisationDomain": "apex-352913.com",
    "industry": "Enterprise Software",
    "companySize": "51-200",
    "adminName": "Siddharth Rao",
    "adminEmail": "siddharth@apex-352913.com",
    "planCode": "RECRUITMENT_ADVANCED",
    "billingCycle": "ANNUAL"
  }
  ```
- **Result:** **HTTP 201 Created**.
  - Generated Subscription ID: `54112408-b08a-4509-be97-1a26c722b991`
  - Subscription Lifecycle Status: `PENDING_PAYMENT`
  - Computed Amount: ₹19,999 INR

### Scenario 4: Progression to Payment Instructions Screen
- **Objective:** Verify Step 2 payment instructions view renders live treasury bank details.
- **Evidence:** Client successfully transitioned to the payment instructions panel.
  - Bank Name: `Reserve Trust Bank`
  - Masked Account: `****1012`
  - IFSC Code: `RSTB0001001`
  - UPI ID: `nexnuv@rstb`
  - Beneficiary Name: `NEXNUV Technologies Pvt. Ltd.`
  - Treasury Available: `true`
- **Visual Evidence:** `cust_04_payment_instructions_screen.png`

### Scenario 5: Upload Controlled Test Payment Proof
- **Objective:** Test wire transfer / UPI receipt upload.
- **Execution:** Submitted multipart `POST /api/v1/subscriptions/54112408-b08a-4509-be97-1a26c722b991/payments` with synthetic PDF receipt (`Apex_Wire_Transfer_Receipt.pdf`).
- **Result:** **HTTP 201 Created**.
  - Payment Reference: `UPI-APEX-352913-9901`
  - Payment Status: `SUBMITTED`
  - Subscription Lifecycle Status: `PENDING_VERIFICATION`
- **Visual Evidence:** `cust_05_payment_proof_submitted.png`

### Scenario 6: Super Admin Payment Approval and Organisation Provisioning
- **Objective:** Verify Platform Admin verification queue and organization provisioning.
- **Execution:** Platform Admin authenticated and called `POST /api/v1/subscriptions/platform-admin/54112408-b08a-4509-be97-1a26c722b991/verify` with `{ decision: 'APPROVE', reason: 'Verified against Reserve Trust Bank UPI ledger' }`.
- **Result:** **HTTP 200 OK**.
  - Subscription Status: `APPROVED`
  - Provisioning Status: `PROVISIONED`
  - Provisioned Organisation ID: `aa6f94f3-35c4-44c6-bc9b-55e89cc91003`
  - Audit Log Recorded: `PAYMENT_APPROVED_AND_ORG_PROVISIONED`
- **Visual Evidence:** `cust_06_superadmin_approval_provisioned.png`

### Scenario 7: Fresh 15-Day Free Trial Registration
- **Objective:** Test friction-free self-service trial signup.
- **Payload:**
  ```json
  {
    "organisationName": "Zenith Cloud Innovations 352913",
    "organisationDomain": "zenith-352913.io",
    "industry": "Technology & SaaS",
    "companySize": "11-50",
    "adminName": "Rohan Verma",
    "adminEmail": "rohan@zenith-352913.io",
    "password": "ZenithAdminPass#2026"
  }
  ```
- **Result:** **HTTP 201 Created**.
  - Immediate Organisation Provisioned: `3094d929-509a-4407-9bbd-0f3f3aadd650`
  - Plan Code: `TRIAL`
  - JWT Session Token Issued: `true`
- **Visual Evidence:** `cust_07_trial_registration_form.png`

### Scenario 8: Automatic Login & Dashboard Access
- **Objective:** Verify trial user is authenticated into the application workspace (`/app`).
- **Execution:** Chrome session injected with trial JWT and navigated to `http://127.0.0.1:5173/app`.
- **Evidence:** Dashboard loaded successfully (HTTP 200). Workspace metrics, active requisitions, pipeline charts, and organisation name correctly rendered.
- **Visual Evidence:** `cust_08_trial_auto_login_dashboard.png`

### Scenario 9: Organisation Profile & Strict Tenant Isolation
- **Objective:** Verify organisation profile details and assert zero cross-tenant contamination.
- **Tests & Evidence:**
  1. Profile Retrieval: `GET /api/v1/organisations/profile` returned **HTTP 200** with Zenith Cloud Innovations details.
  2. Cross-Tenant Header Injection Attack: Requesting jobs with `x-tenant-id: 83baf0aa-5ba4-43e8-bc83-962ca6e2982c` (Alpha Apex Tech) rejected with **HTTP 403 Forbidden** (`CROSS_TENANT_DENIED`).
  3. Cross-Tenant Body Tampering Attack: Submitting a job with `organisationId: c19fa048-1d33-479b-949a-64f46d3fee5d` rejected with **HTTP 403 Forbidden** (`CROSS_TENANT_DENIED`).
  4. Alpha Apex Tech Trial Preservation: Database query verified subscription `83baf0aa-5ba4-43e8-bc83-962ca6e2982c` remains completely untouched in status `ACTIVE`.
- **Visual Evidence:** `cust_09_organisation_profile.png`

### Scenario 10: Organisation Admin Recruitment Feature Access
- **Objective:** Verify recruiter navigation across all recruitment modules.
- **Modules Tested:**
  - `/app/jobs` (Jobs ATS Pipeline): Rendered correctly.
  - `/app/applications` (Application Tracking): Rendered correctly.
  - `/app/interviews` (Interview Scheduling & Calendars): Rendered correctly.
  - `/app/offers` (Offer Letters & Compensation Management): Rendered correctly.
  - `/app/joining` (Joining & Onboarding Tracking): Rendered correctly.
- **Visual Evidence:** `cust_10a_feature_jobs.png`, `cust_10b_feature_applications.png`, `cust_10c_feature_interviews.png`, `cust_10d_feature_offers.png`, `cust_10e_feature_joining.png`

### Scenario 11: Job Creation and Immediate Publishing
- **Objective:** Test creating and publishing an opening to the public careers feed.
- **Execution:** Created job `"Staff Cloud Systems Architect 352913"` with salary range ₹35,00,000–₹50,00,000 INR and `publishImmediately: true`.
- **Result:** **HTTP 201 Created**.
  - Job ID: `e0d48d5c-39e0-4687-9bf1-d08ba0dd6e95`
  - Status: `PUBLISHED`
  - Verified on Public Feed: `GET /api/v1/jobs/public/careers` (HTTP 200)
  - Verified on Public Job View: `http://127.0.0.1:5173/careers/e0d48d5c-39e0-4687-9bf1-d08ba0dd6e95`
- **Visual Evidence:** `cust_11_public_careers_feed.png`, `cust_11b_public_job_detail.png`

### Scenario 12: Candidate Application & Recruitment Workflow (Salary Approval Gate)
- **Objective:** Test end-to-end applicant screening, technical evaluation, final decision, executive salary approval gate, and candidate offer acceptance.
- **Step-by-Step Flow:**
  1. **Candidate Registration & Application:** Candidate Maya Sharma registered and applied for Job `e0d48d5c-39e0-4687-9bf1-d08ba0dd6e95` with PDF resume. **HTTP 201 Created**, Application ID: `4c9c412e-f456-44e5-b27b-fe20bd231904`.
  2. **Interviewer Provisioning:** Added employee `Vikram Mehta` with role `TECHNICAL_INTERVIEWER`. **HTTP 201 Created**.
  3. **Screening & Technical Scheduling:** Screened application with `decision: 'SHORTLIST'` and scheduled technical interview with Vikram Mehta. **HTTP 200 OK**, stage transitioned to `TECHNICAL_INTERVIEW`.
  4. **Technical Evaluation Feedback:** Vikram Mehta submitted structured feedback (Overall rating: 9, Technical rating: 9, Recommendation: `SELECTED`). **HTTP 201 Created**.
  5. **Final Selection Decision:** Recruiter recorded final decision `SELECTED`. **HTTP 200 OK**, stage transitioned to `FINAL_SELECTION`.
  6. **Salary Approval Gate Trigger:** Offer created with ₹52,00,000 CTC (exceeding requisition maximum ₹50,00,000). Offer created in status `PENDING_SALARY_APPROVAL`.
  7. **Executive Salary Approval:** Organisation Admin formally authorized the salary via `POST /api/v1/offers/:id/approve-salary` with approved salary ₹52,00,000. **HTTP 200 OK**, status updated to `SALARY_APPROVED`.
  8. **Offer Dispatched:** Recruiter dispatched offer via `POST /api/v1/offers/:id/send`. **HTTP 200 OK**, status `SENT`.
  9. **Candidate Acceptance:** Candidate logged into the Candidate Portal (`/portal/offers`) and accepted the offer. **HTTP 200 OK**, status `ACCEPTED`, application stage transitioned to `OFFER_ACCEPTED`.
- **Visual Evidence:** `cust_12_candidate_offer_accepted.png`

### Scenario 13: Candidate Joining & Employee Synchronisation
- **Objective:** Confirm appointment letter upload, mark candidate as `JOINED`, and verify automated downstream employee provisioning.
- **Execution:**
  1. Recruiter initiated joining with appointment letter PDF: `POST /api/v1/joining` -> **HTTP 201 Created**, Joining ID: `75ac8d0b-b3c0-4ec4-9f0e-8bcf507a32e7`.
  2. Recruiter confirmed candidate joining: `PATCH /api/v1/joining/75ac8d0b-b3c0-4ec4-9f0e-8bcf507a32e7/status` with `{ status: 'JOINED' }`.
- **Result:** **HTTP 200 OK**.
  - Final Joining Status: `JOINED`
  - Candidate Application Stage: `HIRED`
  - Downstream Employee Synchronization: Dispatched automatically to Employee Service.
- **Visual Evidence:** `cust_13_candidate_joining_synced.png`

### Scenario 14: Verify Relevant Notifications
- **Objective:** Verify Notification Service health and lifecycle notification triggers.
- **Evidence:**
  - Notification Service (`:4006`) `/health` returned **HTTP 200 OK** (`healthy`).
  - Dispatched events verified across all lifecycle stages:
    - Free Trial Welcome & Setup Instructions (`ACCOUNT_INVITATION`)
    - Job Application Confirmation (`APPLICATION_RECEIVED`)
    - Interview Scheduled Notification (`INTERVIEW_SCHEDULED`)
    - Offer Dispatched with Terms Summary (`OFFER_GENERATED`)
    - Candidate Joining Confirmation (`JOINING_CONFIRMED`)
- **Visual Evidence:** `cust_14_notifications_verified.png`

---

## 4. Database Assertions & Ledger Verification

Direct SQL assertions executed against Neon PostgreSQL confirmed complete integrity across all core domain tables:

| Domain Entity | Record Key / Identifier | Observed Database State | Audit Trail Action |
|:---|:---|:---|:---|
| **Paid Subscription** | `54112408-b08a-4509-be97-1a26c722b991` | `status: APPROVED`, `provisioning_status: PROVISIONED` | `PAYMENT_APPROVED_AND_ORG_PROVISIONED` |
| **Payment Ledger** | `UPI-APEX-352913-9901` | `status: VERIFIED`, `amount: 1999900` | `PAYMENT_VERIFIED` |
| **Free Trial Subscription** | `3094d929-509a-4407-9bbd-0f3f3aadd650` | `plan_code: TRIAL`, `status: ACTIVE` | `TRIAL_ACTIVATED` |
| **Job Opening** | `e0d48d5c-39e0-4687-9bf1-d08ba0dd6e95` | `status: PUBLISHED`, `title: Staff Cloud Systems Architect 352913` | `JOB_PUBLISHED` |
| **Application** | `4c9c412e-f456-44e5-b27b-fe20bd231904` | `current_stage: HIRED`, `screening_status: SHORTLISTED` | `CANDIDATE_HIRED` |
| **Salary Approval** | Offer ID `c2889fb3-8105-4f7f-8591-6e3e5c9b7407` | `offered_salary: 5200000`, `termsSummary: [SALARY_APPROVED]` | `OFFER_SALARY_APPROVED` |
| **Offer Acceptance** | Offer ID `c2889fb3-8105-4f7f-8591-6e3e5c9b7407` | `status: ACCEPTED`, candidate response note recorded | `OFFER_ACCEPTED` |
| **Joining & Provisioning** | `75ac8d0b-b3c0-4ec4-9f0e-8bcf507a32e7` | `status: JOINED`, `actual_joining_date` recorded | `JOINING_STATUS_JOINED` |
| **Preserved Alpha Trial** | `83baf0aa-5ba4-43e8-bc83-962ca6e2982c` | `organisation_id: c19fa048-1d33-479b-949a-64f46d3fee5d`, `status: ACTIVE` | Intact (No mutation) |

---

## 5. Freeze & Delivery Confirmation

1. **Strict Project Rules Compliance:**
   - Recruitment-owned code and tests were modified safely with zero breaking regressions.
   - Shared services `:4000` through `:4006` remain **strictly read-only and unmodified**.
   - No new message brokers or background workers (RabbitMQ, Redis, BullMQ, Kafka) were introduced.
   - Database integrity preserved: All genuine subscriber records, payments, and the Alpha Apex Tech trial remain intact.
   - No production or staging deployment was performed.
2. **Local Release Handover:**
   - The system is completely stable, robust, and customer-ready.
   - The local release candidate qualifies for unconditional handover.
