'use strict';

// Translates known database errors into client errors and never returns
// internal error details (which can include hostnames or SQL) to the caller.
module.exports = (err, req, res, _next) => {
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ success: false, message: 'A record with these details already exists' });
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(409).json({ success: false, message: 'This record is referenced by other data and cannot be changed this way' });
  }
  if (err.name === 'SequelizeDatabaseError' && /invalid input syntax for type uuid/.test(err.message || '')) {
    return res.status(400).json({ success: false, message: 'Invalid identifier in request' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Request body is not valid JSON' });
  }

  // The database could not be reached even after retries: a temporary condition, not a bug.
  if (/^Sequelize(Connection|HostNot|AccessDenied|InvalidConnection)/.test(err.name || '')) {
    console.error('[employee-service] database unavailable:', err.name); // the message would include the database host
    return res.status(503).json({ success: false, message: 'The service is temporarily unavailable. Please try again.' });
  }

  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error('[employee-service]', err.message);
    return res.status(status).json({ success: false, message: status === 503 ? err.message : 'Internal Server Error' });
  }
  res.status(status).json({ success: false, message: err.message || 'Request failed' });
};
