const logger = require('../utils/logger');

// Custom error class
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

// Development error response
const sendErrorDev = (err, req, res) => {
  logger.logError(err, req);
  
  res.status(err.statusCode || 500).json({
    status: err.status || 'error',
    error: err,
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
  });
};

// Production error response
const sendErrorProd = (err, req, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    logger.logError(err, req);
    
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error('ERROR:', err);
    
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong!',
      timestamp: new Date().toISOString(),
    });
  }
};

// Handle specific error types
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () =>
  new AppError('Your token has expired! Please log in again.', 401);

const handleValidationError = (err) => {
  const errors = err.details.map(detail => detail.message);
  const message = `Validation error: ${errors.join(', ')}`;
  return new AppError(message, 400);
};

const handleMongoServerError = (err) => {
  if (err.code === 11000) {
    return handleDuplicateFieldsDB(err);
  }
  return new AppError('Database server error', 500);
};

const handleRedisError = (err) => {
  logger.error('Redis Error:', err);
  return new AppError('Cache service temporarily unavailable', 503);
};

const handleTelegramError = (err) => {
  logger.error('Telegram API Error:', err);
  return new AppError('Telegram service temporarily unavailable', 503);
};

const handleRateLimitError = () => {
  return new AppError('Too many requests. Please try again later.', 429);
};

const handlePaymentError = (err) => {
  logger.error('Payment Error:', err);
  return new AppError('Payment processing failed. Please try again.', 402);
};

// Main error handling middleware
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // Handle specific error types
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    if (error.name === 'MongoServerError') error = handleMongoServerError(error);
    if (error.isJoi) error = handleValidationError(error);
    if (error.name === 'RedisError') error = handleRedisError(error);
    if (error.name === 'TelegramError') error = handleTelegramError(error);
    if (error.name === 'RateLimitError') error = handleRateLimitError();
    if (error.type === 'StripeCardError' || error.type === 'StripeInvalidRequestError') {
      error = handlePaymentError(error);
    }

    sendErrorProd(error, req, res);
  }
};

// Async error wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// 404 handler
const notFound = (req, res, next) => {
  const err = new AppError(`Can't find ${req.originalUrl} on this server!`, 404);
  next(err);
};

// Validation error helper
const createValidationError = (message, field = null) => {
  const error = new AppError(message, 400);
  if (field) {
    error.field = field;
  }
  return error;
};

// Authorization error helper
const createAuthError = (message = 'Not authorized') => {
  return new AppError(message, 401);
};

// Forbidden error helper
const createForbiddenError = (message = 'Access forbidden') => {
  return new AppError(message, 403);
};

// Not found error helper
const createNotFoundError = (resource = 'Resource') => {
  return new AppError(`${resource} not found`, 404);
};

// Conflict error helper
const createConflictError = (message = 'Resource already exists') => {
  return new AppError(message, 409);
};

// Rate limit error helper
const createRateLimitError = (message = 'Too many requests') => {
  const error = new AppError(message, 429);
  error.name = 'RateLimitError';
  return error;
};

// Service unavailable error helper
const createServiceUnavailableError = (service = 'Service') => {
  return new AppError(`${service} temporarily unavailable`, 503);
};

module.exports = {
  AppError,
  errorHandler,
  catchAsync,
  notFound,
  createValidationError,
  createAuthError,
  createForbiddenError,
  createNotFoundError,
  createConflictError,
  createRateLimitError,
  createServiceUnavailableError,
};