const { UniqueConstraintError, ValidationError: SequelizeValidationError, ForeignKeyConstraintError } = require('sequelize');
const multer = require('multer');
const logger = require('../config/logger');
const { AppError } = require('../utils/AppError');
const { sendError } = require('../utils/apiResponse');

function notFoundHandler(req, res) {
  return sendError(res, {
    statusCode: 404,
    code: 'ROUTE_NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
}

function errorHandler(err, req, res, _next) {
  if (err instanceof multer.MulterError) {
    let message = 'Uploaded file could not be processed.';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Uploaded file exceeds maximum allowed size limit.';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files uploaded in a single request.';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file upload field.';
    }
    return sendError(res, {
      statusCode: 400,
      code: 'FILE_UPLOAD_ERROR',
      message,
      details: { reason: err.code }
    });
  }

  if (err instanceof AppError && err.isOperational) {
    return sendError(res, {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details
    });
  }

  if (err instanceof UniqueConstraintError) {
    return sendError(res, {
      statusCode: 409,
      code: 'DUPLICATE_RESOURCE',
      message: 'A conflicting record already exists.',
      details: err.errors?.map((e) => e.path) || null
    });
  }

  if (err instanceof SequelizeValidationError || err instanceof ForeignKeyConstraintError) {
    logger.warn(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        errorName: err.name
      },
      'Database validation or foreign key constraint failed'
    );
    return sendError(res, {
      statusCode: 400,
      code: 'DATABASE_CONSTRAINT_ERROR',
      message: 'Invalid reference or data constraint violation.'
    });
  }

  logger.error(
    {
      err,
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl
    },
    'Unhandled application error'
  );

  return sendError(res, {
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred.'
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
