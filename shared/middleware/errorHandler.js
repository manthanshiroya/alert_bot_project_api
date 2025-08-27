const logger = require('../utils/logger');
const environmentConfig = require('../config/environment');

class ErrorHandler {
  // Main error handling middleware
  static handle() {
    return (error, req, res, next) => {
      try {
        // Log the error
        logger.logError(error, {
          endpoint: req.path,
          method: req.method,
          userId: req.user?.id,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          body: req.body,
          query: req.query,
          params: req.params
        });

        // Determine error type and response
        const errorResponse = this._buildErrorResponse(error, req);
        
        // Send error response
        res.status(errorResponse.statusCode).json(errorResponse.body);
      } catch (handlingError) {
        // Fallback error handling
        logger.logError(handlingError, {
          originalError: error.message,
          endpoint: req.path,
          method: req.method,
          context: 'error_handler_failure'
        });

        res.status(500).json({
          success: false,
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          requestId: req.id || 'unknown'
        });
      }
    };
  }

  // Build error response based on error type
  static _buildErrorResponse(error, req) {
    const isDevelopment = environmentConfig.get('NODE_ENV') === 'development';
    const requestId = req.id || this._generateRequestId();

    // Default error response
    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details = null;

    // Handle specific error types
    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      message = 'Validation failed';
      details = this._extractValidationErrors(error);
    } else if (error.name === 'CastError') {
      statusCode = 400;
      errorCode = 'INVALID_ID';
      message = 'Invalid ID format';
    } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      statusCode = 500;
      errorCode = 'DATABASE_ERROR';
      message = 'Database operation failed';
      
      // Handle duplicate key error
      if (error.code === 11000) {
        statusCode = 409;
        errorCode = 'DUPLICATE_ENTRY';
        message = 'Resource already exists';
        details = this._extractDuplicateKeyError(error);
      }
    } else if (error.name === 'JsonWebTokenError') {
      statusCode = 401;
      errorCode = 'INVALID_TOKEN';
      message = 'Invalid authentication token';
    } else if (error.name === 'TokenExpiredError') {
      statusCode = 401;
      errorCode = 'TOKEN_EXPIRED';
      message = 'Authentication token expired';
    } else if (error.name === 'MulterError') {
      statusCode = 400;
      errorCode = 'FILE_UPLOAD_ERROR';
      message = this._getMulterErrorMessage(error);
    } else if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
      statusCode = 400;
      errorCode = 'INVALID_JSON';
      message = 'Invalid JSON format';
    } else if (error.statusCode || error.status) {
      // Custom errors with status codes
      statusCode = error.statusCode || error.status;
      errorCode = error.code || 'CUSTOM_ERROR';
      message = error.message || 'An error occurred';
      details = error.details || null;
    } else if (error.code === 'ECONNREFUSED') {
      statusCode = 503;
      errorCode = 'SERVICE_UNAVAILABLE';
      message = 'External service unavailable';
    } else if (error.code === 'ETIMEDOUT') {
      statusCode = 504;
      errorCode = 'TIMEOUT';
      message = 'Request timeout';
    }

    // Build response body
    const body = {
      success: false,
      error: message,
      code: errorCode,
      requestId,
      timestamp: new Date().toISOString()
    };

    // Add details if available
    if (details) {
      body.details = details;
    }

    // Add stack trace in development
    if (isDevelopment && error.stack) {
      body.stack = error.stack;
    }

    // Add additional context in development
    if (isDevelopment) {
      body.debug = {
        errorName: error.name,
        originalMessage: error.message,
        endpoint: req.path,
        method: req.method
      };
    }

    return { statusCode, body };
  }

  // Extract validation errors
  static _extractValidationErrors(error) {
    if (error.details) {
      // Joi validation errors
      return error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
    } else if (error.errors) {
      // Mongoose validation errors
      return Object.keys(error.errors).map(field => ({
        field,
        message: error.errors[field].message,
        value: error.errors[field].value
      }));
    }
    return null;
  }

  // Extract duplicate key error details
  static _extractDuplicateKeyError(error) {
    if (error.keyPattern) {
      const field = Object.keys(error.keyPattern)[0];
      return {
        field,
        message: `${field} already exists`,
        value: error.keyValue?.[field]
      };
    }
    return null;
  }

  // Get Multer error message
  static _getMulterErrorMessage(error) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return 'File size too large';
      case 'LIMIT_FILE_COUNT':
        return 'Too many files';
      case 'LIMIT_FIELD_KEY':
        return 'Field name too long';
      case 'LIMIT_FIELD_VALUE':
        return 'Field value too long';
      case 'LIMIT_FIELD_COUNT':
        return 'Too many fields';
      case 'LIMIT_UNEXPECTED_FILE':
        return 'Unexpected file field';
      default:
        return 'File upload error';
    }
  }

  // Generate request ID
  static _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 404 handler for unmatched routes
  static notFound() {
    return (req, res, next) => {
      const error = new Error(`Route ${req.method} ${req.path} not found`);
      error.statusCode = 404;
      error.code = 'ROUTE_NOT_FOUND';
      next(error);
    };
  }

  // Async error wrapper
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  // Custom error classes
  static createError(statusCode, message, code = null, details = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    error.details = details;
    return error;
  }

  // Specific error creators
  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', details = null) {
    return this.createError(400, message, code, details);
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED', details = null) {
    return this.createError(401, message, code, details);
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN', details = null) {
    return this.createError(403, message, code, details);
  }

  static notFoundError(message = 'Not found', code = 'NOT_FOUND', details = null) {
    return this.createError(404, message, code, details);
  }

  static conflict(message = 'Conflict', code = 'CONFLICT', details = null) {
    return this.createError(409, message, code, details);
  }

  static unprocessableEntity(message = 'Unprocessable entity', code = 'UNPROCESSABLE_ENTITY', details = null) {
    return this.createError(422, message, code, details);
  }

  static tooManyRequests(message = 'Too many requests', code = 'TOO_MANY_REQUESTS', details = null) {
    return this.createError(429, message, code, details);
  }

  static internalServerError(message = 'Internal server error', code = 'INTERNAL_ERROR', details = null) {
    return this.createError(500, message, code, details);
  }

  static serviceUnavailable(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE', details = null) {
    return this.createError(503, message, code, details);
  }

  // Database error handlers
  static handleDatabaseError(error) {
    if (error.name === 'MongoNetworkError') {
      return this.serviceUnavailable('Database connection failed', 'DATABASE_CONNECTION_ERROR');
    }
    
    if (error.name === 'MongoTimeoutError') {
      return this.createError(504, 'Database timeout', 'DATABASE_TIMEOUT');
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      return this.conflict(`${field} already exists`, 'DUPLICATE_ENTRY', {
        field,
        value: error.keyValue?.[field]
      });
    }
    
    return this.internalServerError('Database operation failed', 'DATABASE_ERROR');
  }

  // External service error handlers
  static handleExternalServiceError(error, serviceName) {
    if (error.code === 'ECONNREFUSED') {
      return this.serviceUnavailable(`${serviceName} service unavailable`, 'EXTERNAL_SERVICE_UNAVAILABLE');
    }
    
    if (error.code === 'ETIMEDOUT') {
      return this.createError(504, `${serviceName} service timeout`, 'EXTERNAL_SERVICE_TIMEOUT');
    }
    
    if (error.response) {
      const status = error.response.status || 500;
      const message = error.response.data?.message || `${serviceName} service error`;
      return this.createError(status, message, 'EXTERNAL_SERVICE_ERROR');
    }
    
    return this.internalServerError(`${serviceName} service error`, 'EXTERNAL_SERVICE_ERROR');
  }

  // Telegram API error handlers
  static handleTelegramError(error) {
    if (error.response) {
      const { error_code, description } = error.response.data || {};
      
      switch (error_code) {
        case 400:
          return this.badRequest(`Telegram API: ${description}`, 'TELEGRAM_BAD_REQUEST');
        case 401:
          return this.unauthorized('Invalid Telegram bot token', 'TELEGRAM_UNAUTHORIZED');
        case 403:
          return this.forbidden(`Telegram API: ${description}`, 'TELEGRAM_FORBIDDEN');
        case 429:
          return this.tooManyRequests('Telegram API rate limit exceeded', 'TELEGRAM_RATE_LIMIT');
        default:
          return this.internalServerError(`Telegram API error: ${description}`, 'TELEGRAM_ERROR');
      }
    }
    
    return this.handleExternalServiceError(error, 'Telegram');
  }

  // Request timeout handler
  static timeout(ms = 30000) {
    return (req, res, next) => {
      const timeout = setTimeout(() => {
        const error = this.createError(504, 'Request timeout', 'REQUEST_TIMEOUT');
        next(error);
      }, ms);

      // Clear timeout if request completes
      res.on('finish', () => clearTimeout(timeout));
      res.on('close', () => clearTimeout(timeout));
      
      next();
    };
  }

  // Health check error handler
  static handleHealthCheckError(error, service) {
    logger.logError(error, {
      context: 'health_check',
      service,
      timestamp: new Date().toISOString()
    });

    return {
      service,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ErrorHandler;