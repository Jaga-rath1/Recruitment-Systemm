require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";

if (NODE_ENV === "production") {
  if (!process.env.INTERNAL_SERVICE_TOKEN) throw new Error("INTERNAL_SERVICE_TOKEN is required in production");
}

module.exports = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || "4006", 10),
  DATABASE_URL: process.env.DATABASE_URL,
  INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || "",
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || "",
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "",
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || "NexNuv Orbit",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || "",
  BREVO_API_KEY: process.env.BREVO_API_KEY || "",
  APP_URL: process.env.FRONTEND_APP_URL || "https://nexnuv-helpdesk.vercel.app",
  FRONTEND_APP_URL: process.env.FRONTEND_APP_URL || "https://nexnuv-helpdesk.vercel.app",
  BRAND_NAME: process.env.BRAND_NAME || undefined
};
