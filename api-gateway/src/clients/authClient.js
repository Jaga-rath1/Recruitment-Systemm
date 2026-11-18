const http = require("http");
const https = require("https");
const services = require("../config/services");
const { INTERNAL_SERVICE_TOKEN } = require("../config/env");

/**
 * Current state of an account as auth-service sees it:
 * { status, role, organizationId }, or { missing: true } when the account
 * no longer exists. Resolves null when auth-service cannot answer.
 */
function getAccountState(userId) {
  return new Promise((resolve) => {
    try {
      const url = new URL(`/api/v1/auth/internal/accounts/${encodeURIComponent(userId)}`, services.AUTH);
      const isHttps = url.protocol === "https:";
      const client = isHttps ? https : http;
      const port = url.port ? parseInt(url.port, 10) : (isHttps ? 443 : 80);

      const req = client.request({
        protocol: url.protocol,
        hostname: url.hostname,
        port,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { "x-internal-token": INTERNAL_SERVICE_TOKEN, "x-service-name": "api-gateway" },
      }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        try {
          const body = JSON.parse(raw);
          if (res.statusCode === 404 && body.code === "ACCOUNT_NOT_FOUND") return resolve({ missing: true });
          resolve(res.statusCode === 200 && body.data ? body.data : null);
        } catch { resolve(null); }
      });
    });
      req.setTimeout(8000, () => { req.destroy(); resolve(null); });
      req.on("error", () => resolve(null));
      req.end();
    } catch {
      resolve(null);
    }
  });
}

module.exports = { getAccountState };
