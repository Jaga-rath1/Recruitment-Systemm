const express = require("express");
const router = express.Router();
const readyRoute = require("./ready");

router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    service: "auth-service",
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

router.use("/ready", readyRoute);

module.exports = router;
