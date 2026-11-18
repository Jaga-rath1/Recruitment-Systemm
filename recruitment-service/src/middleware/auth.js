const authAdapter = require('../integrations/auth/auth.adapter');
const { UnauthorizedError } = require('../utils/AppError');

function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

async function authenticate(req, _res, next) {
  try {
    req.auth = await authAdapter.verifyRequestAuth(req);
    return next();
  } catch (err) {
    return next(err);
  }
}

async function optionalAuthenticate(req, _res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    req.auth = null;
    return next();
  }
  try {
    req.auth = await authAdapter.verifyRequestAuth(req);
    return next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return next(err);
    }
    return next(err);
  }
}

module.exports = {
  authenticate,
  optionalAuthenticate
};
