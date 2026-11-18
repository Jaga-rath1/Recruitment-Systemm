const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const dns = require("dns");

// Ensure public DNS resolution for Neon database instances
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
  // Ignored if already set
}

const app = require("../src/app");
const { Tenant, User, sequelize } = require("../src/models");

describe("Auth Service: Industries and Tenant Registration Suite", () => {
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
    if (sequelize) {
      await sequelize.close().catch(() => {});
    }
  });

  it("GET /api/v1/auth/industries returns the predefined industry catalog", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/industries`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 5);

    const industryIds = body.data.map((i) => i.id);
    assert.ok(industryIds.includes("IND01"), "Should include IND01 (Healthcare)");
    assert.ok(industryIds.includes("IND02"), "Should include IND02 (Banking)");
    assert.ok(industryIds.includes("IND03"), "Should include IND03 (IT Services)");
    assert.ok(industryIds.includes("IND04"), "Should include IND04 (Education)");
    assert.ok(industryIds.includes("IND05"), "Should include IND05 (Manufacturing)");
  });

  it("POST /api/v1/auth/register-tenant rejects registration with invalid industryId", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register-tenant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: "Invalid Corp",
        industryId: "NON_EXISTENT_IND_999",
        adminName: "Admin User",
        email: "test.invalid@corp.com",
        password: "Password123!"
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(
      body.message?.includes("Invalid industry identifier") ||
      body.error?.message?.includes("Invalid industry"),
      "Should reject invalid industry"
    );
  });

  it("POST /api/v1/auth/register-tenant registers a new company with selected industry", async () => {
    const uniqueEmail = `test.reg.${Date.now()}@healthcare-test.com`;
    const res = await fetch(`${baseUrl}/api/v1/auth/register-tenant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: `Healthcare Test Corp ${Date.now()}`,
        industryId: "IND01",
        adminName: "Healthcare Admin",
        email: uniqueEmail,
        password: "Password123!"
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.token, "Token should be issued");
    assert.equal(body.user?.email, uniqueEmail);
    assert.equal(body.tenant?.industryId, "IND01");
    assert.equal(body.tenant?.industryName, "Healthcare");

    // Clean up created user and tenant from test
    if (body.user?.id) {
      await User.destroy({ where: { id: body.user.id } }).catch(() => {});
    }
    if (body.tenant?.id) {
      await Tenant.destroy({ where: { id: body.tenant.id } }).catch(() => {});
    }
  });

  it("GET /api/v1/auth/internal/tenants/:id rejects requests missing internal authorization token", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/internal/tenants/00000000-0000-0000-0000-000000000001`);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  it("GET /api/v1/auth/internal/tenants/:id returns tenant industry when internal secret is supplied", async () => {
    const internalSecret = process.env.INTERNAL_SERVICE_TOKEN || "replace_with_rotated_internal_token";
    const res = await fetch(`${baseUrl}/api/v1/auth/internal/tenants/00000000-0000-0000-0000-000000000001`, {
      headers: {
        "x-internal-token": internalSecret
      }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    const tenantData = body.tenant || body.data;
    assert.equal(tenantData.id, "00000000-0000-0000-0000-000000000001");
    assert.equal(tenantData.industryId, "IND03");
    assert.equal(tenantData.industryName, "IT Services");
  });

  it("POST /api/v1/auth/login returns industry metadata and signed industry claim in JWT", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "healthcare.admin@nexnuv.com",
        password: "Welcome@123"
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.token);
    assert.equal(body.user?.industryId, "IND01");
    assert.equal(body.user?.industryName, "Healthcare");

    // Decode JWT payload (middle segment)
    const tokenParts = body.token.split(".");
    const claims = JSON.parse(Buffer.from(tokenParts[1], "base64url").toString());
    assert.equal(claims.industryId, "IND01");
    assert.equal(claims.tenantId, "11111111-1111-1111-1111-111111111111");
  });
});
