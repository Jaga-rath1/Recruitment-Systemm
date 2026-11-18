# NEXNUV Recruitment — Manual Testing Checklist & Acceptance Worksheet

**Document Version:** 1.0.0  
**Target Release:** Frozen Local Release Candidate  
**Date:** November 17, 2026  
**Tester Name:** ___________________________  
**Test Execution Date:** ___________________  
**Target URL:** `http://localhost:5173` (Frontend) | `http://localhost:4007` (Recruitment Backend)  

---

## Instructions for Tester

1. Follow the setup instructions in [`LOCAL_STARTUP_GUIDE.md`](file:///c:/Users/rathj/NEXNUV-Recruitment/LOCAL_STARTUP_GUIDE.md) to start required local services.
2. Execute each test scenario in the sequence outlined below.
3. Record the observed behavior in the **Actual Result** column.
4. Mark the outcome as **[ ] PASS** or **[ ] FAIL**.
5. If an anomaly occurs, record the browser console output or HTTP status code in the notes.

---

## Test Category 1: Public Registration & Plan Selection

| Test ID | Test Scenario | Step-by-Step Instructions | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-REG-01** | Public Pricing Page Navigation | 1. Open browser to `http://localhost:5173/pricing`<br>2. Inspect displayed plans | All 3 paid tiers (`Basic`, `Advanced`, `Enterprise`) and the 15-Day Free Trial card are visible with pricing and feature bullets. | | [ ] PASS<br>[ ] FAIL |
| **TC-REG-02** | Customer Registration Form Validation | 1. Click "Select Plan" on Advanced Plan<br>2. Attempt submitting with invalid email and empty company name | Client displays inline validation errors requiring a valid email address and company name. Form cannot be submitted. | | [ ] PASS<br>[ ] FAIL |
| **TC-REG-03** | Customer Registration Submission | 1. Fill valid data: Org Name, Domain (`acme-corp.com`), Admin Name, Admin Email<br>2. Submit form | System creates subscription in `PENDING_PAYMENT` state, displays subscription reference ID, and presents wire transfer instructions. | | [ ] PASS<br>[ ] FAIL |

---

## Test Category 2: Payment Proof Submission

| Test ID | Test Scenario | Step-by-Step Instructions | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-PAY-01** | Payment Proof File Type Restriction | 1. On payment submission page, attempt uploading an executable (`.exe` or `.bat`) | File picker or validator rejects the file with an error stating only PDF, PNG, JPG are allowed. | | [ ] PASS<br>[ ] FAIL |
| **TC-PAY-02** | Payment Proof Submission | 1. Enter wire transfer reference (e.g. `WIRE-TEST-001`)<br>2. Attach a valid PDF or PNG receipt (< 10MB)<br>3. Submit payment | Payment record is created in `SUBMITTED` status. Subscription advances to `PENDING_VERIFICATION`. Confirmation screen is displayed. | | [ ] PASS<br>[ ] FAIL |

---

## Test Category 3: Platform Admin Queue & Verification

| Test ID | Test Scenario | Step-by-Step Instructions | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-ADM-01** | Platform Admin Login & Navigation | 1. Log in with Platform Admin credentials at `http://localhost:5173/login`<br>2. Navigate to `/platform-admin` | Platform Admin Review Page loads with three primary tabs: "Subscriptions Queue", "All Payment Records", and "Centralized Notifications". | | [ ] PASS<br>[ ] FAIL |
| **TC-ADM-02** | Payment Proof Inspection | 1. On "Subscriptions Queue" tab, locate the pending subscription<br>2. Click "View Proof" or "Download Proof" | Remittance proof document is rendered or downloaded securely via authenticated signed URL. | | [ ] PASS<br>[ ] FAIL |
| **TC-ADM-03** | Platform Admin Payment Approval | 1. Click "Approve Payment"<br>2. Confirm approval modal | Subscription status updates to `ACTIVE`. Tenant organisation is provisioned. Success notification displays. Secure activation email is dispatched. | | [ ] PASS<br>[ ] FAIL |
| **TC-ADM-04** | Idempotency on Approval | 1. Immediately attempt clicking "Approve" again on the same subscription | System displays an alert or toast indicating the subscription is already active. No duplicate organisations are created. | | [ ] PASS<br>[ ] FAIL |

---

## Test Category 4: Activation Email & Token Hygiene

| Test ID | Test Scenario | Step-by-Step Instructions | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-ACT-01** | Activation Email Delivery | 1. Check the registered customer email inbox (or Gmail test mailbox `jagankumarrath72@gmail.com`) | Activation email is received with sender "NexNuv", containing organisation name, registered admin email, 48h expiry note, and activation link. | | [ ] PASS<br>[ ] FAIL |
| **TC-ACT-02** | Token Inspection & URL Scrubbing | 1. Click activation link from email (`http://localhost:5173/activate-account?token=...`)<br>2. Observe page loading and URL bar | Page displays organisation name and admin email. Browser URL bar is automatically scrubbed of the raw token query parameter via `history.replaceState`. | | [ ] PASS<br>[ ] FAIL |
| **TC-ACT-03** | Password Complexity Enforcement | 1. Enter a weak password (e.g. `123456` or `password`)<br>2. Click "Set Password" | Form blocks submission with inline guidance: Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 digit, and 1 special symbol. | | [ ] PASS<br>[ ] FAIL |
| **TC-ACT-04** | Password Setup Completion | 1. Enter compliant strong password (e.g. `NexNuv#Secure2026!`)<br>2. Confirm password and submit | Account is activated successfully. Confirmation toast is shown. User is automatically redirected to Login page. | | [ ] PASS<br>[ ] FAIL |
| **TC-ACT-05** | Single-Use Token Invalidation | 1. Press browser back button or re-visit the exact same activation link | Page displays "Activation link has expired or has already been used". Form cannot be submitted again. | | [ ] PASS<br>[ ] FAIL |

---

## Test Category 5: Organisation Admin Login & Dashboard

| Test ID | Test Scenario | Step-by-Step Instructions | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-ORG-01** | Org Admin Authentication | 1. On `http://localhost:5173/login`, enter registered admin email and the newly set password<br>2. Click "Sign In" | Login succeeds. JWT with `ORG_ADMIN` role is stored. User is redirected to `/organisations/dashboard`. | | [ ] PASS<br>[ ] FAIL |
| **TC-ORG-02** | Tenant Dashboard Access | 1. Inspect dashboard header, organization profile, and subscription details | Dashboard displays customer's organisation name, active plan code (`RECRUITMENT_ADVANCED`), and recruitment metrics. | | [ ] PASS<br>[ ] FAIL |

---

## Test Category 6: Payment Management, Void & Archival

| Test ID | Test Scenario | Step-by-Step Instructions | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-MGT-01** | Payment Records Ledger & Search | 1. In Platform Admin, switch to "All Payment Records" tab<br>2. Type payment reference in search box<br>3. Filter by status | Table filters instantly, displaying matching payment records with payment reference, amount, method, status, and creation date. | | [ ] PASS<br>[ ] FAIL |
| **TC-MGT-02** | Safe Void with Mandatory Reason | 1. Locate an unapproved/duplicate test payment<br>2. Click "Void Payment"<br>3. Attempt submitting with empty reason<br>4. Enter reason: "Duplicate remittance - bank verified"<br>5. Confirm | Empty reason is blocked (min 5 characters required). Upon valid reason submission, payment status changes to `VOIDED`. Original record remains preserved. | | [ ] PASS<br>[ ] FAIL |
| **TC-MGT-03** | Safe Archive with Mandatory Reason | 1. Locate an eligible unwanted payment<br>2. Click "Archive Payment"<br>3. Enter valid reason and submit | Payment status updates to `ARCHIVED`. Audit log records the action, timestamp, and actor ID. | | [ ] PASS<br>[ ] FAIL |
| **TC-MGT-04** | Active Payment Protection Guard | 1. Locate an approved payment belonging to an active subscription<br>2. Attempt clicking "Void" or calling void API | System displays an error modal or toast stating active subscription payments cannot be voided (HTTP 403 Forbidden). | | [ ] PASS<br>[ ] FAIL |

---

## Test Category 7: Centralized Notification History Management

| Test ID | Test Scenario | Step-by-Step Instructions | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-NOT-01** | Notification History Listing | 1. In Platform Admin, switch to "Centralized Notifications" tab<br>2. Inspect notification table | Table displays recent notification dispatches, recipient emails, event types (`ACCOUNT_INVITATION`, `PAYMENT_APPROVED`), and delivery statuses. | | [ ] PASS<br>[ ] FAIL |
| **TC-NOT-02** | Token Redaction in Details Modal | 1. Click "View Details" on an `ACCOUNT_INVITATION` notification<br>2. Inspect payload and metadata | Any token, setup link, or password parameter appears redacted (e.g. `[REDACTED_SECURE_TOKEN]`). No secret is exposed in UI. | | [ ] PASS<br>[ ] FAIL |
| **TC-NOT-03** | Single Notification Soft-Clear | 1. Click "Clear Notice" on a notification record<br>2. Enter reason: "Testing retention cleanup"<br>3. Confirm | Notice is soft-deleted (`is_deleted = true`) and removed from the active view. Audit log records `NOTIFICATION_HISTORY_DELETED`. | | [ ] PASS<br>[ ] FAIL |
| **TC-NOT-04** | Bulk Notification Soft-Clear | 1. Select multiple notices via checkboxes (or filter by date)<br>2. Click "Bulk Clear"<br>3. Enter mandatory reason and confirm | All selected notices are soft-cleared in one atomic operation. Financial and subscription records are unaffected. | | [ ] PASS<br>[ ] FAIL |

---

## Test Category 8: Security & Access Control (RBAC)

| Test ID | Test Scenario | Step-by-Step Instructions | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-SEC-01** | Platform Admin Route Protection | 1. Log out or sign in as an Org User<br>2. Attempt directly browsing to `http://localhost:5173/platform-admin`<br>3. Attempt calling `GET /api/v1/subscriptions/platform-admin/payments` | Frontend redirects to Login or Access Denied page. Backend API returns HTTP 401 Unauthorized or HTTP 403 Forbidden. | | [ ] PASS<br>[ ] FAIL |
| **TC-SEC-02** | Cross-Tenant Isolation | 1. Log in as Organisation Admin A<br>2. Attempt querying resources belonging to Organisation B | Request returns HTTP 403 Forbidden or HTTP 404 Not Found. No data from Organisation B is accessible. | | [ ] PASS<br>[ ] FAIL |

---

## Acceptance Sign-Off

**Tester Remarks:**  
__________________________________________________________________________________________  
__________________________________________________________________________________________  

**Acceptance Decision:**  
- [ ] **ACCEPTED FOR PRODUCTION PILOT**  
- [ ] **REJECTED (DEFECTS FOUND)**  

**Signature:** ___________________________ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; **Date:** _______________
