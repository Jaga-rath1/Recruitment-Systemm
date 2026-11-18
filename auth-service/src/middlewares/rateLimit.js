'use strict';

/**
 * Small in-memory attempt limiter for the public sign-in and password routes.
 * It is per process: enough to stop password guessing against one instance,
 * and replaceable by a shared store if the service is ever scaled out.
 */
const buckets = new Map(); // key -> { count, resetAt }

function take(key, limit, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return { allowed: bucket.count <= limit, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
}

function clear(key) {
  buckets.delete(key);
}

// Expired buckets are dropped so the map cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60 * 1000).unref();

function tooMany(res, retryAfterSeconds) {
  res.set('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({
    success: false,
    code: 'TOO_MANY_ATTEMPTS',
    message: `Too many attempts. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
  });
}

/** Limits every request to a route by client address. */
const limitByIp = (name, limit, windowMs) => (req, res, next) => {
  const result = take(`${name}|${req.ip}`, limit, windowMs);
  if (!result.allowed) return tooMany(res, result.retryAfterSeconds);
  next();
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURES_PER_ACCOUNT = 10;

/**
 * Sign-in guard: after too many wrong passwords for one email from one
 * address the pair is locked out for the rest of the window. Successful
 * sign-ins do not count and clear the tally.
 */
const loginGuard = (req, res, next) => {
  const email = String((req.body && req.body.email) || '').toLowerCase();
  const key = `login|${req.ip}|${email}`;
  const bucket = buckets.get(key);
  if (bucket && bucket.resetAt > Date.now() && bucket.count >= LOGIN_FAILURES_PER_ACCOUNT) {
    return tooMany(res, Math.ceil((bucket.resetAt - Date.now()) / 1000));
  }
  req.loginAttempt = {
    failed: () => take(key, LOGIN_FAILURES_PER_ACCOUNT, LOGIN_WINDOW_MS),
    succeeded: () => clear(key),
  };
  next();
};

module.exports = { limitByIp, loginGuard };
