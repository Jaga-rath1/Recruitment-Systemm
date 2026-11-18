// Never returns internal error text for server faults.
module.exports = (err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error("[api-gateway]", err.message);
    return res.status(status).json({ success: false, message: "Internal Server Error" });
  }
  res.status(status).json({ success: false, message: err.message || "Request failed" });
};
