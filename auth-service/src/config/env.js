require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";

if (NODE_ENV === "production") {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required in production");
  if (!process.env.INTERNAL_SERVICE_TOKEN) throw new Error("INTERNAL_SERVICE_TOKEN is required in production");
  if (!process.env.APP_URL) throw new Error("APP_URL is required in production");
}

module.exports = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || "4001", 10),
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET || "change-me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
  INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || "",
  ALLOW_BOOTSTRAP_REGISTRATION: process.env.ALLOW_BOOTSTRAP_REGISTRATION === "true",
  APP_URL: process.env.APP_URL || "http://localhost:3000",
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || "",
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL || "",
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || "NexNuv Orbit",
};
