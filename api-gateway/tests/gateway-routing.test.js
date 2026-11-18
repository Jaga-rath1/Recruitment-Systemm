const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { JWT_SECRET } = require("../src/config/env");

describe("API Gateway Routing & Security Suite", () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("GET /health returns 200 and gateway status", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.service, "api-gateway");
    assert.equal(body.status, "healthy");
  });

  it("GET /ready returns 200 and checks: gateway up", async () => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.status, "ready");
    assert.equal(body.checks?.gateway, "up");
  });

  it("Unauthenticated request to /api/v1/tickets/incident-types is rejected with 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tickets/incident-types`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.message, "Unauthorized");
  });

  it("Unauthenticated request to root alias /api/v1/incident-types is rejected with 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/v1/incident-types`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  it("Request with invalid JWT token is rejected with 401", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tickets/incident-types`, {
      headers: {
        Authorization: "Bearer invalid.token.value"
      }
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.message, "Invalid or expired token");
  });

  it("Untrusted x-industry-id header from client cannot bypass authentication", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tickets/incident-types`, {
      headers: {
        "x-industry-id": "IND02"
      }
    });
    assert.equal(res.status, 401);
  });

  it("Valid JWT signature with industryId claim is accepted by gateway auth pipeline", async () => {
    const secret = JWT_SECRET || "replace_with_a_long_random_secret";
    const token = jwt.sign(
      {
        userId: "test-user-1",
        email: "test@healthcare.com",
        role: "employee",
        organizationId: "11111111-1111-1111-1111-111111111111",
        tenantId: "11111111-1111-1111-1111-111111111111",
        industryId: "IND01"
      },
      secret,
      { expiresIn: "1h" }
    );

    // Make request - if helpdesk service is running on 4020/4002 it proxies, or returns 502/503 if downstream unavailable, but NEVER 401/403
    const res = await fetch(`${baseUrl}/api/v1/tickets/incident-types`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    // Valid authentication means the status code is NOT 401 or 403
    assert.notEqual(res.status, 401, "Token should be authenticated");
    assert.notEqual(res.status, 403, "Token should be authorized");
  });
});
