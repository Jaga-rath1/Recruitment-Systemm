require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";

if (NODE_ENV === "production") {
  if (!process.env.ORGANIZATION_SERVICE_URL) throw new Error("ORGANIZATION_SERVICE_URL is required in production");
  if (!process.env.INTERNAL_SERVICE_TOKEN) throw new Error("INTERNAL_SERVICE_TOKEN is required in production");
}

module.exports = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || "4002", 10),
  DATABASE_URL: process.env.DATABASE_URL,
  ORGANIZATION_SERVICE_URL: process.env.ORGANIZATION_SERVICE_URL || "http://localhost:4003",
  INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || "",
};
