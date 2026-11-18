# NEXNUV Recruitment SaaS — Known Limitations & Production Prerequisites

**Document Version:** 1.1.0  
**Release Stage:** Frozen Local Release Candidate  
**Date:** November 17, 2026  
**Status:** **ACTIVE TECHNICAL DEBT & ARCHITECTURAL LIMITATION REGISTER**

---

## 1. Executive Disclaimer

> [!WARNING]
> **THIS LOCAL RELEASE CANDIDATE IS CERTIFIED FOR SINGLE-INSTANCE DEPLOYMENT AND PILOT EVALUATION.**  
> The application achieves 100% test pass rates across all suites (97/97 backend tests, 38/38 frontend tests, 17/17 live E2E checkpoints, 0 skipped tests). However, specific architectural characteristics in downstream shared dependencies and multi-instance concurrency control require planned remediation prior to multi-replica horizontal clustering.

---

## 2. Notification Service Integration Status (Resolved & Operational)

### 2.1 Live Integration Status
- **Current State:** The 5 previously skipped live notification tests in `notificationServiceLiveE2E.test.js` are **fully resolved and verified**.
- **Operation:** When `notification-service` is running on port 4006 (`http://localhost:4006/health`), `recruitment-service` dispatches live HTTP events for `APPLICATION_RECEIVED`, `INTERVIEW_SCHEDULED`, `OFFER_LETTER_SENT`, `JOINING_CONFIRMED`, and `ACCOUNT_INVITATION`.
- **Fault Tolerance:** If `notification-service` becomes unreachable or is offline, the recruitment service's resilient circuit/retry adapter logs the outage, gracefully preserves the transaction state, and falls back to standalone processing without throwing uncaught exceptions or interrupting the customer onboarding flow.

---

## 3. Core Architectural Blocker: Multi-Instance Employee Provisioning Concurrency

### 3.1 The Issue
Candidate onboarding culminates in automatic employee record creation in the downstream `Employee Service` (:4004) when a candidate status changes to `JOINED`. If an outage occurs, an administrator can trigger recovery via:
$$\mathbf{POST\ /api/v1/joining/:id/retry-employee-sync}$$

In [`recruitment-service/src/modules/joining/joining.service.js`](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/joining/joining.service.js#L417-L424), in-flight concurrency protection is implemented via:
```javascript
const inFlightRetries = new Map();
const lockKey = `${organisationId}:${joiningId}`;
if (inFlightRetries.has(lockKey)) {
  return inFlightRetries.get(lockKey);
}
```

### 3.2 Why It Works Locally (Single Process Runtime)
In a single Node.js process runtime (the local release candidate target), `inFlightRetries` resides in the process V8 heap. Concurrent requests arriving simultaneously are collapsed into a single execution, preventing duplicate employee records.

### 3.3 Why It Fails in Distributed Multi-Instance Production
In a horizontally scaled deployment (e.g. Kubernetes with multiple pod replicas, or PM2 cluster mode):
1. **Isolated Memory Spaces:** Pod A and Pod B maintain separate V8 heaps and separate `inFlightRetries` Maps.
2. **Downstream Uniqueness Vacuum:**
   Inspection of `employee-service` reveals:
   - PostgreSQL table `employees` enforces uniqueness **only on `(organization_id, employee_code)`**.
   - Columns `email` and `work_email` have regular performance indexes, but **no unique constraint**.
3. **No Idempotency Mechanism in Downstream API:**
   `Employee Service` method `create()` does not accept or validate `Idempotency-Key` headers.
4. **Race Condition Vector:**
   If two concurrent retry requests for the same candidate hit Pod A and Pod B simultaneously, both pods observe zero existing records, and both issue `POST /api/v1/employees`, creating duplicate employee records.

### 3.4 Required Architectural Remediation Before Production
Under project constraints, shared services :4000–:4006 are strictly read-only, and external message brokers (Redis, BullMQ, Kafka) cannot be introduced in Recruitment-owned code. Therefore, before deploying to multi-instance production, one of the following architectural changes must be scheduled:
- **Option A (Preferred Downstream Schema Fix):** Add a composite unique index in `employee-service`:
  ```sql
  CREATE UNIQUE INDEX employees_org_email_unique ON employees (organization_id, LOWER(email));
  ```
- **Option B (Shared Distributed Lock):** Deploy a Redis cluster and implement Redlock across Recruitment Service pods, or use PostgreSQL advisory locks (`SELECT pg_advisory_xact_lock(...)`).
- **Option C (Downstream Idempotency):** Implement RFC 9421 / IETF Idempotency-Key handling in `employee-service`.

---

## 4. External Integration Prerequisites & Operational Modes

### 4.1 External HRMS Requisition Connectivity
- **Current State:** `recruitment-service` includes a complete HRMS adapter (`hrms.adapter.js`) capable of syncing external job requisitions.
- **Limitation:** In the default local configuration, `HRMS_SERVICE_URL` is empty. The application operates in self-contained requisition mode where jobs are created directly in Recruitment.
- **Production Prerequisite:** If connecting to an enterprise HRMS (e.g. Workday, SAP SuccessFactors, BambooHR), the external API URL and bearer tokens must be provisioned and schema mapping verified.

---

### 4.2 Transactional Email Delivery Providers
- **Current State:** Gmail SMTP transporter (`smtp.gmail.com:587` with TLS 1.2) is verified and operational for live customer activation email dispatch. Direct email dispatch falls back through:
  `Resend HTTPS -> Brevo HTTPS -> SMTP -> Ethereal Dev Mailer -> Standalone Log`
- **Limitation:** In local development without configured API keys, emails log to the console or fallback transporter.
- **Production Prerequisite:**
  - Production deployment should configure dedicated enterprise SMTP or API-driven dispatch (`RESEND` or `BREVO`).
  - DNS SPF and DKIM records must be verified for the sending domain (`EMAIL_FROM`).
  - Webhook signing secrets (`RESEND_WEBHOOK_SECRET` or `BREVO_WEBHOOK_SECRET`) must be configured to process asynchronous delivery receipts.

---

### 4.3 Synchronous Malware Scanning Subsystem
- **Current State:** Default configuration is `MALWARE_SCANNER_MODE=DISABLED`.
- **Limitation:** Files are accepted based on magic-byte verification, MIME allowlists, and file extension checks without ClamAV daemon inspection.
- **Production Prerequisite:**
  - In production, set `MALWARE_SCANNER_MODE=CLAMAV` and `MALWARE_SCAN_REQUIRED=true`.
  - A ClamAV daemon (`clamd`) must be running and reachable over TCP on `CLAMAV_HOST:CLAMAV_PORT` (port 3310).
  - The scanner operates in **fail-closed mode**: if ClamAV is offline when required, file uploads are rejected with HTTP 503.

---

### 4.4 Object Storage Subsystem (Local vs. Cloudinary)
- **Current State:** Default configuration is `STORAGE_DRIVER=LOCAL_SECURE`. Documents are written to the local disk (`./storage/resumes`, `./storage/offers`, `./storage/joining-letters`, `./storage/payment-proofs`).
- **Limitation:** Local disk storage is restricted to single-node deployments. In multi-pod deployments, local disks are not shared, causing 404s if pod routing differs.
- **Production Prerequisite:**
  - For clustered deployment, configure `STORAGE_DRIVER=CLOUDINARY` with valid credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`).
  - Verify Cloudinary private authenticated delivery mode so assets require signed HMAC-SHA256 URLs with 15-minute expiration windows.

---

## 5. Summary Limitation Register

| # | Component | Limitation Description | Severity | Impacted Deployment | Remediation Path |
| :-: | :--- | :--- | :---: | :--- | :--- |
| **1** | **Employee Provisioning** | Process-local in-memory concurrency control | **High** | Multi-replica production | Add DB unique constraint in Employee Svc or distributed lock |
| **2** | **Object Storage** | Local disk driver not shared across pods | **Medium** | Multi-replica production | Switch to `CLOUDINARY` or S3 storage driver |
| **3** | **Malware Scanner** | ClamAV disabled by default | **Low** | Production | Provision ClamAV TCP daemon on port 3310 |
| **4** | **Email Provider** | Mock/disabled by default in test; Gmail SMTP in live | **Low** | Production | Configure dedicated transactional provider (Resend/Brevo) |
| **5** | **HRMS Adapter** | External URL unpopulated by default | **Low** | Enterprise integration | Supply enterprise HRMS URL and API keys |
