require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";

if (NODE_ENV === "production") {
  if (!process.env.AUTH_SERVICE_URL) throw new Error("AUTH_SERVICE_URL is required in production");
  if (!process.env.PLATFORM_SERVICE_URL) throw new Error("PLATFORM_SERVICE_URL is required in production");
  if (!process.env.ORGANIZATION_SERVICE_URL) throw new Error("ORGANIZATION_SERVICE_URL is required in production");
  if (!process.env.NOTIFICATION_SERVICE_URL) throw new Error("NOTIFICATION_SERVICE_URL is required in production");
  if (!process.env.INTERNAL_SERVICE_TOKEN) throw new Error("INTERNAL_SERVICE_TOKEN is required in production");
}

module.exports = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || "4004", 10),
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || "http://localhost:4001",
  PLATFORM_SERVICE_URL: process.env.PLATFORM_SERVICE_URL || "http://localhost:4002",
  ORGANIZATION_SERVICE_URL: process.env.ORGANIZATION_SERVICE_URL || "http://localhost:4003",
  NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4006",
  INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || "",
  ENTITLEMENT_CACHE_TTL_MS: parseInt(process.env.ENTITLEMENT_CACHE_TTL_MS || "15000", 10),
};
