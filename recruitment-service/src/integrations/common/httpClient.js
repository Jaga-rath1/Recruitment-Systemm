const env = require('../../config/env');
const logger = require('../../config/logger');
const {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError
} = require('../../utils/AppError');

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function buildUrl(baseUrl, targetPath, query) {
  const normalizedBase = String(baseUrl || '').replace(/\/+$/, '');
  const normalizedPath = String(targetPath || '').startsWith('/') ? targetPath : `/${targetPath}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`);
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

function normalizeDownstreamError(serviceName, statusCode, body) {
  const message =
    body?.error?.message ||
    body?.message ||
    `${serviceName} returned HTTP ${statusCode}`;
  const code = body?.error?.code || body?.code || null;
  const details = body?.error?.details || body?.details || null;

  switch (statusCode) {
    case 400:
    case 422:
      return new BadRequestError(message, details, code || 'BAD_REQUEST');
    case 401:
      return new UnauthorizedError(message, code || 'UNAUTHORIZED');
    case 403:
      return new ForbiddenError(message, code || 'FORBIDDEN');
    case 404:
      return new NotFoundError(message, code || 'NOT_FOUND');
    case 409:
      return new ConflictError(message, code || 'CONFLICT', details);
    case 502:
    case 503:
    case 504:
      return new ServiceUnavailableError(message, code || 'DEPENDENCY_UNAVAILABLE', details);
    default:
      return new AppError(message, statusCode >= 500 ? 502 : statusCode, code || 'UPSTREAM_ERROR', details);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson({
  serviceName,
  baseUrl,
  method = 'GET',
  path,
  query,
  headers = {},
  body,
  authorization,
  organisationId,
  actor,
  requestId,
  timeoutMs = env.services.requestTimeoutMs,
  retries
}) {
  const upperMethod = String(method).toUpperCase();
  const isSafeGet = upperMethod === 'GET';
  const maxAttempts = isSafeGet
    ? Math.max(1, retries ?? env.services.getRetryAttempts ?? 2)
    : 1;

  if (!baseUrl) {
    throw new ServiceUnavailableError(`${serviceName} URL is not configured`, 'SERVICE_URL_MISSING', {
      service: serviceName
    });
  }

  const targetUrl = buildUrl(baseUrl, path, query);
  const requestHeaders = {
    Accept: 'application/json',
    ...(env.services.internalToken ? { 'x-internal-token': env.services.internalToken } : {}),
    'x-service-name': env.serviceName || 'recruitment-service',
    ...(requestId ? { 'x-request-id': requestId } : {}),
    ...(authorization ? { Authorization: authorization } : {}),
    ...(organisationId
      ? { 'x-organization-id': organisationId, 'x-tenant-id': organisationId }
      : {}),
    ...(actor?.userId ? { 'x-user-id': actor.userId } : {}),
    ...(actor?.role ? { 'x-user-role': actor.role } : {}),
    ...(actor?.email ? { 'x-user-email': actor.email } : {}),
    ...(actor?.name ? { 'x-user-name': actor.name } : {}),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...headers
  };

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        method: upperMethod,
        headers: requestHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      const rawText = await response.text();
      let parsedBody = null;
      if (rawText) {
        try {
          parsedBody = JSON.parse(rawText);
        } catch (_parseErr) {
          parsedBody = { message: rawText.slice(0, 300) };
        }
      }

      if (!response.ok) {
        if (isSafeGet && RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts) {
          await delay(80 * attempt);
          continue;
        }
        throw normalizeDownstreamError(serviceName, response.status, parsedBody);
      }

      return {
        status: response.status,
        data: parsedBody
      };
    } catch (err) {
      if (err instanceof AppError) {
        lastError = err;
        break;
      }

      const isTimeout = err.name === 'AbortError';
      const reason = isTimeout ? `timed out after ${timeoutMs}ms` : err.message || 'connection failed';

      if (isSafeGet && attempt < maxAttempts) {
        await delay(80 * attempt);
        continue;
      }

      logger.warn(
        {
          service: serviceName,
          method: upperMethod,
          path,
          attempt,
          timeout: isTimeout,
          requestId
        },
        `Downstream ${serviceName} call failed (${reason})`
      );

      lastError = new ServiceUnavailableError(
        `${serviceName} is unavailable (${reason})`,
        isTimeout ? 'DEPENDENCY_TIMEOUT' : 'DEPENDENCY_UNAVAILABLE',
        { service: serviceName, timeout: isTimeout }
      );
      break;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

module.exports = {
  buildUrl,
  normalizeDownstreamError,
  requestJson
};

