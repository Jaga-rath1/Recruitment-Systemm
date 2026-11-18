# Shared Microservice Integration Contracts

> **Contract Policy**: Endpoints below represent expected adapter interfaces for external NEXNUV shared services (`INTEGRATION_MODE=live`). Never invent unverified endpoints against external services when their repositories are connected; inspect the real service routes and update only the HTTP client transport inside `recruitment-service/src/integrations/<service>/`.

## 1. Auth Service (`src/integrations/auth/`)
- **Verify Token**: Verifies RS256/HS256 JWT bearing claims `{ sub, email, name, organisationId, employeeId, userType, roles }`.
- **Provision Organisation Admin Invitation**:
  - Method: `sendAccountActivationInvitation({ organisationId, email, fullName, activationToken, expiresAt, redirectUrl })`
  - Guarantees no plaintext password is ever generated or emailed; admin sets password on Auth Service hosted/proxied invitation endpoint.
- **Activate Admin Password**:
  - Method: `completeActivation({ activationToken, password })` (delegated to Auth Service in live mode).
- **Invite Employee User**:
  - Method: `inviteEmployeeAccount({ organisationId, employeeId, email, fullName, roleCode })`

## 2. Platform Admin Service (`src/integrations/platform-admin/`)
- **Register Pending Subscription Verification**:
  - Method: `submitVerificationRequest({ subscriptionId, organisationName, adminEmail, paymentReference, amountCents, currency })`
- **Provision Organisation Tenant**:
  - Method: `provisionOrganisation({ subscriptionId, organisationName, organisationDomain, industry, companySize, adminName, adminEmail })`
  - Returns `{ organisationId, provisionedAt }`.

## 3. Employee Service (`src/integrations/employee/`)
- **Get Organisation Profile**: `getOrganisationProfile(organisationId)`
- **List Organisation Employees**: `listEmployees(organisationId, filters)`
- **Create / Invite Employee**: `createEmployee(organisationId, payload)` → returns `{ employeeId, authUserId, email, fullName, department, designation, status }`
- **Get Employee By ID**: `getEmployeeById(organisationId, employeeId)`

## 4. HRMS Job Service (`src/integrations/hrms/`)
- **Fetch Syncable HRMS Jobs**: `fetchJobs(organisationId, filters)`
  - Expected fields per job: `hrmsJobId`, `title`, `description`, `department`, `skills[]`, `experience`, `salary`, `location`, `employmentType`, `totalHeadcount`, `jobStatus`.
- **Get Single HRMS Job**: `fetchJobById(organisationId, hrmsJobId)`

## 5. Notification Service (`src/integrations/notification/`)
Dispatches events via REST (`POST /notifications/dispatch` contract) with zero message brokers.
Supported event keys:
1. `SUBSCRIPTION_SUBMITTED`
2. `PAYMENT_APPROVED`
3. `PAYMENT_REJECTED`
4. `ACCOUNT_INVITATION`
5. `EMPLOYEE_INVITATION`
6. `APPLICATION_RECEIVED`
7. `CANDIDATE_SHORTLISTED`
8. `CANDIDATE_REJECTED`
9. `INTERVIEW_SCHEDULED`
10. `INTERVIEW_RESCHEDULED`
11. `INTERVIEW_FEEDBACK_SUBMITTED`
12. `FINAL_SELECTION`
13. `OFFER_LETTER_SENT`
14. `OFFER_ACCEPTED`
15. `OFFER_REJECTED`
16. `JOINING_LETTER_SENT`
17. `JOINING_CONFIRMED`

