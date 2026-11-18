const { getAccountState } = require("../clients/authClient");
const { INTERNAL_SERVICE_TOKEN, SESSION_CHECK_TTL_MS } = require("../config/env");

// When auth-service cannot answer, the last known state is reused for this long.
const STALE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // userId -> { at, state }

async function resolveState(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < SESSION_CHECK_TTL_MS) return hit.state;
  const state = await getAccountState(userId);
  if (!state) return hit && Date.now() - hit.at < STALE_TTL_MS ? hit.state : null;
  cache.set(userId, { at: Date.now(), state });
  return state;
}

/**
 * A JWT stays cryptographically valid until it expires, so on its own it would
 * keep working after the account is deactivated or its role changes. This
 * checks the token against the account's current state (cached briefly) and
 * ends the session when they no longer agree.
 */
const verifySession = async (req, res, next) => {
  if (req.user && (req.user.role === "service" || req.headers["x-internal-token"] === INTERNAL_SERVICE_TOKEN)) return next();
  // Without the internal token the gateway cannot ask auth-service (local setups that have not configured it).
  if (!INTERNAL_SERVICE_TOKEN) return next();
  try {
    const state = await resolveState(req.user.userId);
    if (!state) {
      return res.status(503).json({ success: false, message: "Could not verify your session. Please try again." });
    }
    if (state.missing || state.status !== "active") {
      return res.status(401).json({ success: false, message: "This account is no longer active" });
    }
    if (state.role !== req.user.role || (state.organizationId || null) !== (req.user.organizationId || null)) {
      return res.status(401).json({ success: false, message: "Your access has changed. Please sign in again." });
    }
    next();
  } catch (err) { next(err); }
};

module.exports = { verifySession };
