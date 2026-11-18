# NEXNUV Recruitment — Candidate Password Recovery & Session Revocation Security (Phase 4.4)

## 1. Recovery Endpoints & Anti-Enumeration Design

| Endpoint | Middleware | Purpose & Key Security Controls |
|---|---|---|
| `POST /api/v1/auth/candidate/forgot-password` | `candidateRecoveryLimiter` | Always returns generic HTTP `200` (`"If a verified candidate account exists for this email, password reset instructions have been sent."`). Dispatches a single-use token only when `isActive && emailVerified`; enforces `CANDIDATE_RESET_COOLDOWN_SECONDS` (`60s`); fails closed `503 EMAIL_DELIVERY_UNAVAILABLE` if email provider is unconfigured outside tests. |
| `POST /api/v1/auth/candidate/reset-password` | `candidateRecoveryLimiter` | Validates strong password schema (`strongPasswordSchema`), hashes submitted token via purpose-bound HMAC-SHA256 (`PASSWORD_RESET:<token>`), matches with constant-time comparison, enforces `reset_expires_at > now` (`CANDIDATE_RESET_TTL_MINUTES`, default `30`), atomically updates password + increments `token_version` (`+ 1`) + clears `reset_token_hash` & failed-login lockouts. |
| `POST /api/v1/auth/candidate/change-password` | `authenticate`, `requireCandidate`, `candidateRecoveryLimiter` | Verifies current `scrypt` password (`400 INVALID_CURRENT_PASSWORD`), blocks password reuse (`400 PASSWORD_REUSE_REJECTED`), updates hash + increments `token_version` inside transaction -> revokes all existing sessions (`requiresRelogin: true`). |

## 2. Login Brute-Force Lockout & Timing Hardening
- `authenticateCandidate` verifies password hashes against `getDummyPasswordHash()` using constant-time `crypto.timingSafeEqual` even when the email is absent ([candidateSecurity.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/utils/candidateSecurity.js)).
- Consecutive wrong passwords increment `failed_login_attempts`; upon reaching `CANDIDATE_LOGIN_MAX_ATTEMPTS` (default `5`), the account locks for `CANDIDATE_LOGIN_LOCK_MINUTES` (default `15` min) returning `429 ACCOUNT_LOCKED` without disclosing whether credentials matched while locked.
- Missing email / wrong password / inactive account return uniform `401 Invalid email or password`.

## 3. Immediate Server-Side Session Revocation (`tokenVersion`)
Previously, candidate JWTs could stay accepted until expiration after password updates or account suspension. Phase 4.4 enforces live PostgreSQL session verification on **every** authenticated candidate request inside [auth.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/auth/auth.adapter.js):
1. Verify `HS256` signature against `CANDIDATE_JWT_SECRET`, `iss: 'nexnuv-recruitment-candidate'`, `aud: 'nexnuv-candidate-portal'`, `userType === 'CANDIDATE'`, `organisationId == null`, and `!employeeId`.
2. If the database is unreachable, **fail closed** (`503 SESSION_STORE_UNAVAILABLE`).
3. Fetch `CandidateAccount.findByPk(decoded.sub)` (`isActive`, `emailVerified`, `tokenVersion`, `email`, `fullName`):
   - Missing or `!isActive` -> `401 ACCOUNT_INACTIVE`
   - `!emailVerified` -> `401 EMAIL_NOT_VERIFIED`
   - `Number(decoded.tokenVersion) !== Number(account.tokenVersion)` -> `401 SESSION_REVOKED`
4. Resetting or changing a password atomically increments `token_version` in PostgreSQL, invalidating every previously issued JWT immediately across all tabs and devices.

## 4. Employee Auth Isolation Preserved
Shared Auth Service (`4001`) remains solely responsible for internal employee & admin passwords (`forgot-password`, `reset-password`, `setup-password`, `users`). Candidate recovery and `candidate_accounts` never read or mutate shared Auth Service records.

## 5. Frontend UX & Token Lifecycle
- [ForgotPasswordPage.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/modules/marketing/ForgotPasswordPage.jsx) (`/forgot-password`) displays identical confirmation regardless of account state.
- [ResetPasswordPage.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/modules/marketing/ResetPasswordPage.jsx) (`/reset-password?token=...`) updates password and directs the candidate back to `/login`.
- [CandidateSecurityCard.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/modules/candidate-portal/CandidateSecurityCard.jsx) on `/portal/profile` submits `/api/v1/auth/candidate/change-password`, clears `nexnuv_token` from `localStorage` on success, and prompts fresh login ([httpClient.js](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/api/httpClient.js) also avoids firing duplicate auto-logout suppression on wrong-current-password `401` if returned).

