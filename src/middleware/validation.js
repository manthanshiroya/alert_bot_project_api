const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Middleware to handle validation errors from express-validator
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
      location: error.location
    }));
    
    logger.warn('Validation errors in request', {
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      errors: errorDetails,
      body: req.body
    });
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorDetails
    });
  }
  
  next();
};

/**
 * Middleware to sanitize request data
 * Removes any potentially harmful or unnecessary fields
 * @param {Array} allowedFields - Array of allowed field names
 */
const sanitizeRequestData = (allowedFields = []) => {
  return (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
      // If allowedFields is specified, filter the request body
      if (allowedFields.length > 0) {
        const sanitizedBody = {};
        allowedFields.forEach(field => {
          if (req.body.hasOwnProperty(field)) {
            sanitizedBody[field] = req.body[field];
          }
        });
        req.body = sanitizedBody;
      }
      
      // Remove any fields that start with underscore (internal fields)
      Object.keys(req.body).forEach(key => {
        if (key.startsWith('_')) {
          delete req.body[key];
        }
      });
    }
    
    next();
  };
};

/**
 * Middleware to validate content type
 * @param {Array} allowedTypes - Array of allowed content types
 */
const validateContentType = (allowedTypes = ['application/json']) => {
  return (req, res, next) => {
    const contentType = req.get('Content-Type');
    
    if (!contentType) {
      return res.status(400).json({
        success: false,
        message: 'Content-Type header is required'
      });
    }
    
    const isAllowed = allowedTypes.some(type => 
      contentType.toLowerCase().includes(type.toLowerCase())
    );
    
    if (!isAllowed) {
      return res.status(415).json({
        success: false,
        message: `Unsupported content type. Allowed types: ${allowedTypes.join(', ')}`,
        received: contentType
      });
    }
    
    next();
  };
};

/**
 * Middleware to validate request size
 * @param {Number} maxSize - Maximum allowed size in bytes
 */
const validateRequestSize = (maxSize = 1024 * 1024) => { // Default 1MB
  return (req, res, next) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    
    if (contentLength > maxSize) {
      return res.status(413).json({
        success: false,
        message: `Request too large. Maximum size: ${maxSize} bytes`,
        received: contentLength
      });
    }
    
    next();
  };
};

/**
 * Middleware to validate API key (for webhook endpoints)
 * @param {String} headerName - Name of the header containing the API key
 */
const validateApiKey = (headerName = 'x-api-key') => {
  return (req, res, next) => {
    const apiKey = req.get(headerName);
    const expectedApiKey = process.env.WEBHOOK_API_KEY;
    
    // If no API key is configured, skip validation
    if (!expectedApiKey) {
      return next();
    }
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: `API key required in ${headerName} header`
      });
    }
    
    if (apiKey !== expectedApiKey) {
      logger.warn('Invalid API key attempt', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl
      });
      
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }
    
    next();
  };
};

/**
 * Middleware to log request details for debugging
 */
const logRequest = (req, res, next) => {
  const startTime = Date.now();
  
  logger.info('Incoming request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    timestamp: new Date().toISOString()
  });
  
  // Log response when it finishes
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
    
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = {
  handleValidationErrors,
  sanitizeRequestData,
  validateContentType,
  validateRequestSize,
  validateApiKey,
  logRequest
};