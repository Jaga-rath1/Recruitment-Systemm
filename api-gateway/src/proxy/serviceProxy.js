// Polyfill deprecated Node util._extend with Object.assign to prevent DEP0060 warnings in http-proxy
const util = require("util");
if (!util._extend || util._extend !== Object.assign) {
  util._extend = Object.assign;
}

const httpProxy = require("http-proxy");
const { logger } = require("../config/logger");

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  xfwd: true,
  timeout: 10000,
  proxyTimeout: 10000,
});

proxy.on("proxyReq", (proxyReq, req, _res) => {
  const headersToForward = [
    "x-user-id",
    "x-user-name",
    "x-user-role",
    "x-user-email",
    "x-organization-id",
    "x-tenant-id",
    "x-industry-id",
    "x-internal-token",
    "x-service-name",
  ];
  headersToForward.forEach((h) => {
    if (req.headers[h]) {
      proxyReq.setHeader(h, req.headers[h]);
    }
  });
});

proxy.on("proxyRes", (proxyRes, req, _res) => {
  // Normalize CORS headers returned by downstream microservices.
  // Overwrite wildcard '*' with caller's explicit Origin to satisfy CORS credentials specifications and avoid Chrome's "Ensure CORS response header values are valid" error.
  const origin = req.headers.origin;
  if (origin) {
    proxyRes.headers["access-control-allow-origin"] = origin;
    proxyRes.headers["access-control-allow-credentials"] = "true";
  }
});

function sendProxyError(err, req, res) {
  const target = req._proxyTarget || "downstream";
  logger.error({ target, err: err.code || err.message }, "Proxy downstream service unavailable");
  if (!res.headersSent) {
    const origin = req.headers && req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    // Graceful degradation for notification polling:
    // If notification-service is sleeping or restarting, return clean empty data with 200 OK
    // so frontend polling never receives 502 Bad Gateway or triggers Cloudflare 429 rate limits.
    const isNotificationRoute = req.originalUrl && req.originalUrl.includes("/notifications");
    if (req.method === "GET" && isNotificationRoute) {
      if (req.originalUrl.includes("/unread-count")) {
        return res.status(200).json({ success: true, data: { count: 0 }, degraded: true });
      }
      return res.status(200).json({
        success: true,
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        degraded: true,
      });
    }

    res.status(502).json({
      success: false,
      code: "BAD_GATEWAY",
      message: `Downstream service unavailable (${target}): ${err.code || err.message}`,
      details: {
        target,
        code: err.code || "DOWNSTREAM_UNAVAILABLE",
        hint: `API Gateway cannot connect to downstream microservice at '${target}'. Please verify that the microservice is deployed and that AUTH_SERVICE_URL / TICKET_SERVICE_URL / NOTIFICATION_SERVICE_URL are configured properly.`
      }
    });
  }
}

proxy.on("error", (err, req, res) => {
  sendProxyError(err, req, res);
});

const createProxy = (target) => (req, res, next) => {
  req._proxyTarget = target;
  // Express strips the mount-path prefix from req.url before passing to middleware.
  // Ensure downstream services receive the full canonical /api/v1 prefix even if callers hit root routes.
  let targetUrl = req.originalUrl;
  if (!targetUrl.startsWith("/api/v1")) {
    targetUrl = `/api/v1${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`;
  }
  req.url = targetUrl;
  proxy.web(req, res, { target }, (err) => {
    if (err) {
      sendProxyError(err, req, res);
    }
  });
};

module.exports = { createProxy };
