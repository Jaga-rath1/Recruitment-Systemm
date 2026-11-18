function sendSuccess(res, { statusCode = 200, message = 'OK', data = null, meta = undefined } = {}) {
  const payload = {
    success: true,
    message,
    data,
    requestId: res.locals.requestId || null
  };
  if (meta !== undefined) {
    payload.meta = meta;
  }
  return res.status(statusCode).json(payload);
}

function sendError(res, { statusCode = 500, code = 'INTERNAL_ERROR', message = 'Internal server error', details = null } = {}) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    },
    requestId: res.locals.requestId || null
  });
}

module.exports = {
  sendSuccess,
  sendError
};

