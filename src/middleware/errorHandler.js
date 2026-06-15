const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log the error details
  if (err.statusCode === 500) {
    logger.error(`[Internal Server Error] ${err.stack}`);
  } else {
    logger.warn(`[Client Error] ${err.statusCode} - ${err.message}`);
  }

  // Handle specific library/db errors
  let errorResponse = {
    status: err.status,
    message: err.message,
  };

  // 1. Joi Validation Errors
  if (err.isJoi) {
    err.statusCode = 400;
    errorResponse.status = 'fail';
    errorResponse.message = 'Validation error';
    errorResponse.errors = err.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
  }

  // 2. MySQL Duplicate Entry Error
  if (err.code === 'ER_DUP_ENTRY') {
    err.statusCode = 409;
    errorResponse.status = 'fail';
    errorResponse.message = 'Duplicate entry found. Resource already exists.';
  }

  // 3. MySQL Foreign Key Constraint Failures
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    err.statusCode = 400;
    errorResponse.status = 'fail';
    errorResponse.message = 'Database integrity violation. Invalid reference.';
  }

  // Include stack trace only in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  res.status(err.statusCode).json(errorResponse);
};

module.exports = errorHandler;
