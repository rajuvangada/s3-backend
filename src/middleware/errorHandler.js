const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let status = err.status || 'error';
  let message = err.message || 'Internal server error';
  let errors;

  if (err.isJoi) {
    statusCode = 400;
    status = 'fail';
    message = 'Validation error';
    errors = err.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
  }

  if (err.name === 'ValidationError') {
    statusCode = 400;
    status = 'fail';
    message = 'Validation error';
    errors = Object.values(err.errors).map((detail) => ({
      field: detail.path,
      message: detail.message
    }));
  }

  if (err.name === 'CastError') {
    statusCode = 400;
    status = 'fail';
    message = `Invalid ${err.path}: ${err.value}`;
  }

  if (err.code === 11000) {
    statusCode = 409;
    status = 'fail';
    message = 'Duplicate value found. Resource already exists.';
  }

  if (statusCode >= 500) {
    logger.error(`[Internal Server Error] ${err.stack || err.message}`);
  } else {
    logger.warn(`[Client Error] ${statusCode} - ${message}`);
  }

  const response = { status, message };

  if (errors) {
    response.errors = errors;
  }

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
