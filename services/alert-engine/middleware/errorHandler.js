const { logger } = require('../utils');
const { helpers } = require('../utils');

/**
 * Custom error classes
 */
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

class ExternalServiceError extends AppError {
  constructor(message = 'External service error', service = 'unknown') {
    super(message, 502);
    this.name = 'ExternalServiceError';
    this.service = service;
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database error') {
    super(message, 500);
    this.name = 'DatabaseError';
  }
}

/**
 * Error handler for async functions
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle specific error types
 */
const handleCastError = (error) => {
  const message = `Invalid ${error.path}: ${error.value}`;
  return new ValidationError(message);
};

const handleDuplicateFieldsError = (error) => {
  const value = error.errmsg.match(/(["'])((?:(?!\1)[^\\]|\\.)*)\1/)[2];
  const message = `Duplicate field value: ${value}. Please use another value.`;
  return new ConflictError(message);
};

const handleValidationError = (error) => {
  const errors = Object.values(error.errors).map(err => ({
    field: err.path,
    message: err.message,
    value: err.value
  }));
  
  const message = 'Invalid input data';
  return new ValidationError(message, errors);
};

const handleJWTError = () => {
  return new AuthenticationError('Invalid token. Please log in again.');
};

const handleJWTExpiredError = () => {
  return new AuthenticationError('Your token has expired. Please log in again.');
};

const handleMongoError = (error) => {
  if (error.code === 11000) {
    return handleDuplicateFieldsError(error);
  }
  
  if (error.name === 'CastError') {
    return handleCastError(error);
  }
  
  if (error.name === 'ValidationError') {
    return handleValidationError(error);
  }
  
  return new DatabaseError('Database operation failed');
};

/**
 * Send error response in development
 */
const sendErrorDev = (err, req, res) => {
  // Log error details in development
  logger.error('Error in development:', {
    error: err,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });

  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      message: err.message,
      name: err.name,
      statusCode: err.statusCode,
      stack: err.stack,
      details: err.details || null,
      service: err.service || null,
      timestamp: err.timestamp || new Date(),
      isOperational: err.isOperational
    },
    request: {
      url: req.originalUrl,
      method: req.method,
      headers: req.headers,
      body: req.body,
      query: req.query,
      params: req.params
    }
  });
};

/**
 * Send error response in production
 */
const sendErrorProd = (err, req, res) => {
  // Log error for monitoring
  logger.error('Production error:', {
    message: err.message,
    name: err.name,
    statusCode: err.statusCode,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    isOperational: err.isOperational
  });

  // Operational, trusted error: send message to client
  if (err.isOperational) {
    const response = {
      success: false,
      message: err.message,
      timestamp: new Date()
    };

    // Add details for validation errors
    if (err.name === 'ValidationError' && err.details) {
      response.details = err.details;
    }

    // Add service info for external service errors
    if (err.name === 'ExternalServiceError' && err.service) {
      response.service = err.service;
    }

    res.status(err.statusCode).json(response);
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error('Non-operational error:', {
      error: err,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method
    });

    res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again later.',
      timestamp: new Date()
    });
  }
};

/**
 * Global error handling middleware
 */
const globalErrorHandler = (err, req, res, next) => {
  // Set default error properties
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  err.isOperational = err.isOperational !== undefined ? err.isOperational : false;

  // Handle specific error types
  let error = { ...err };
  error.message = err.message;

  // MongoDB errors
  if (err.name === 'CastError') error = handleCastError(error);
  if (err.code === 11000) error = handleDuplicateFieldsError(error);
  if (err.name === 'ValidationError') error = handleValidationError(error);
  if (err.name === 'MongoError') error = handleMongoError(error);
  if (err.name === 'MongoServerError') error = handleMongoError(error);

  // JWT errors
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

  // Rate limiting errors
  if (err.name === 'TooManyRequestsError') {
    error = new RateLimitError('Too many requests, please try again later.');
  }

  // External API errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    error = new ExternalServiceError('External service unavailable');
  }

  // Send error response based on environment
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, req, res);
  } else {
    sendErrorProd(error, req, res);
  }
};

/**
 * Handle 404 errors for undefined routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Can't find ${req.originalUrl} on this server`);
  next(error);
};

/**
 * Handle uncaught exceptions
 */
const handleUncaughtException = () => {
  process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION! Shutting down...', {
      error: err,
      stack: err.stack
    });
    
    process.exit(1);
  });
};

/**
 * Handle unhandled promise rejections
 */
const handleUnhandledRejection = (server) => {
  process.on('unhandledRejection', (err, promise) => {
    logger.error('UNHANDLED REJECTION! Shutting down...', {
      error: err,
      stack: err.stack,
      promise
    });
    
    server.close(() => {
      process.exit(1);
    });
  });
};

/**
 * Graceful shutdown handler
 */
const handleGracefulShutdown = (server) => {
  const shutdown = (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);
    
    server.close(() => {
      logger.info('HTTP server closed.');
      
      // Close database connections
      const mongoose = require('mongoose');
      mongoose.connection.close(() => {
        logger.info('MongoDB connection closed.');
        process.exit(0);
      });
    });
    
    // Force close after 30 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

/**
 * Error logging middleware
 */
const errorLogger = (err, req, res, next) => {
  // Log error with context
  const errorContext = {
    message: err.message,
    name: err.name,
    statusCode: err.statusCode,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date(),
    headers: req.headers,
    body: req.body,
    query: req.query,
    params: req.params
  };

  // Log based on error severity
  if (err.statusCode >= 500) {
    logger.error('Server error:', errorContext);
  } else if (err.statusCode >= 400) {
    logger.warn('Client error:', errorContext);
  } else {
    logger.info('Error handled:', errorContext);
  }

  next(err);
};

/**
 * Create error with context
 */
const createError = (message, statusCode = 500, details = null) => {
  const error = new AppError(message, statusCode);
  if (details) {
    error.details = details;
  }
  return error;
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  DatabaseError,
  
  // Middleware
  asyncHandler,
  globalErrorHandler,
  notFoundHandler,
  errorLogger,
  
  // Process handlers
  handleUncaughtException,
  handleUnhandledRejection,
  handleGracefulShutdown,
  
  // Utilities
  createError
};