const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const healthRoute = require("./routes/health");
const readyRoute = require("./routes/ready");
const authRoutes = require("./modules/auth/auth.routes");
const errorMiddleware = require("./middlewares/error");

const app = express();
app.disable("x-powered-by");
// Requests arrive through the gateway, which appends the caller's address; trust exactly that one hop.
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    service: "auth-service",
    message: "NexnuvTKT Auth Service is running",
    timestamp: new Date().toISOString()
  });
});

app.use(["/health", "/healthy"], healthRoute);
app.use("/ready", readyRoute);
app.use(["/api/v1/auth", "/auth", "/"], authRoutes);

// Unknown routes answer in the same JSON shape as every other error.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    service: "auth-service",
    code: "ROUTE_NOT_FOUND",
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "Route not found",
      details: null
    },
    timestamp: new Date().toISOString()
  });
});

app.use(errorMiddleware);
module.exports = app;
