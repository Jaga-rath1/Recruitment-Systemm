require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";

if (NODE_ENV === "production") {
  if (!process.env.INTERNAL_SERVICE_TOKEN) throw new Error("INTERNAL_SERVICE_TOKEN is required in production");
}

module.exports = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || "4003", 10),
  DATABASE_URL: process.env.DATABASE_URL,
  INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || "",
};
