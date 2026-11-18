# NEXNUV Recruitment — Candidate Account Claim Protection Architecture (Phase 4.4)

## 1. Threat Model & Vulnerability Fixed
Before Phase 4.4, [tracking.repository.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/tracking/tracking.repository.js) and [storage.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/storage/storage.routes.js) matched `Candidate` rows where `{ email, authUserId: null }` automatically on read/download. Before email verification existed, any registrant entering someone else's email could read legacy unowned applications and download submitted resumes.

Phase 4.4 eliminates implicit email-based matching completely:
- Portal queries (`getCandidateOverview`, application lookup, offer response) filter strictly by `Candidate.authUserId === auth.userId`.
- Document download authorization (`assertCandidateOwnership` in [storage.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/storage/storage.routes.js)) requires verified `auth.userType === 'CANDIDATE'` AND strict `verified.candidateAuthUserId === auth.userId` (unclaimed `auth_user_id IS NULL` applications cannot be viewed or downloaded through the portal until explicitly claimed).

## 2. Explicit Atomic Claim Flow (`POST /api/v1/portal/claims`)
Implemented in [candidateClaim.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateClaim.service.js) and exposed via [tracking.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/tracking/tracking.routes.js) (`authenticate`, `requireCandidate`, `candidateVerificationLimiter`):

1. **Verified Email Precondition**: Reads live `CandidateAccount` by `auth.userId`; rejects unverified accounts (`403 EMAIL_NOT_VERIFIED`).
2. **Strict Tenant Scoping**: Requires `organisationId` (UUID); optionally narrows by `applicationReference`. Both `Candidate` and `Application` lookups strictly filter by `organisationId`, preventing cross-organisation claiming or enumeration.
3. **Zero Reassignment / Overwrite Protection**:
   - If the target `Candidate` row already has `auth_user_id IS NOT NULL`, the claim fails cleanly without overwriting ownership.
   - Inside a Sequelize transaction, conditional SQL executes:
     ```sql
     UPDATE candidates
     SET auth_user_id = :accountId, claimed_at = :now
     WHERE id = :candidateId
       AND organisation_id = :organisationId
       AND auth_user_id IS NULL
       AND LOWER(email) = :verifiedEmail
     ```
   - `affectedCount !== 1` aborts cleanly with `404 CLAIM_NOT_ELIGIBLE`.
4. **Non-Disclosing Uniform Errors**: Missing candidate, wrong organisation, wrong application reference, or already-claimed records all return the identical HTTP `404` message (`"No eligible unclaimed application was found for your verified email in the specified organisation."`) so attackers cannot probe which organisations or emails have unowned applications.
5. **Audit Trail**: Both `APPLICATION_CLAIM_SUCCEEDED` and `APPLICATION_CLAIM_REJECTED` events record non-secret state in `recruitment_audit_logs`.

## 3. Public Re-Application Binding Rules
In [candidate.repository.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidate.repository.js) and [application.controller.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/application/application.controller.js):
- Submitting `POST /api/v1/applications/public/jobs/:jobId/apply` binds `authUserId` only when the request carries a valid verified `CANDIDATE` token (`verifiedEmailMatch`) with matching email.
- Unauthenticated applicants (or staff users applying externally) cannot bind or overwrite an already-claimed `Candidate` profile (`existing.authUserId != null`).
- Successful public submissions return both `applicationReference` and `organisationId` on [JobDetailApplyPage.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/modules/marketing/JobDetailApplyPage.jsx) so applicants who later create and verify a candidate account can submit them in [CandidateClaimCard.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/modules/candidate-portal/CandidateClaimCard.jsx).

