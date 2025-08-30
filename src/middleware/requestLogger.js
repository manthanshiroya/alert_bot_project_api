const logger = require('../utils/logger');

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Store original end function
  const originalEnd = res.end;
  
  // Override res.end to capture response time
  res.end = function(chunk, encoding) {
    // Calculate response time
    const responseTime = Date.now() - start;
    
    // Log the request
    logger.logRequest(req, res, responseTime);
    
    // Call original end function
    originalEnd.call(this, chunk, encoding);
  };
  
  // Add request ID for tracking
  req.requestId = generateRequestId();
  
  // Add request start time
  req.startTime = start;
  
  // Log incoming request (for debugging)
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`Incoming ${req.method} ${req.url} - ${req.ip}`);
  }
  
  next();
};

// Generate unique request ID
const generateRequestId = () => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

// Enhanced request logger with more details
const detailedRequestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Store original end function
  const originalEnd = res.end;
  
  // Override res.end to capture response details
  res.end = function(chunk, encoding) {
    const responseTime = Date.now() - start;
    
    // Prepare log data
    const logData = {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent') || 'Unknown',
      contentLength: res.get('Content-Length') || 0,
      timestamp: new Date().toISOString(),
    };
    
    // Add user info if available
    if (req.user) {
      logData.userId = req.user.id;
      logData.userEmail = req.user.email;
    }
    
    // Add request body size for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      logData.requestSize = req.get('Content-Length') || 0;
    }
    
    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error('Server Error Request', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Client Error Request', logData);
    } else {
      logger.http('Request Completed', logData);
    }
    
    // Call original end function
    originalEnd.call(this, chunk, encoding);
  };
  
  // Add request metadata
  req.requestId = generateRequestId();
  req.startTime = start;
  
  next();
};

// Security-focused request logger
const securityRequestLogger = (req, res, next) => {
  const suspiciousPatterns = [
    /\.\.\//, // Path traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript injection
    /eval\(/i, // Code injection
    /exec\(/i, // Command injection
  ];
  
  const requestData = JSON.stringify({
    url: req.url,
    body: req.body,
    query: req.query,
    headers: req.headers,
  });
  
  // Check for suspicious patterns
  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(requestData)
  );
  
  if (isSuspicious) {
    logger.logSecurity('Suspicious Request Detected', {
      ip: req.ip,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      body: req.body,
      query: req.query,
      headers: req.headers,
    });
  }
  
  next();
};

// API-specific request logger
const apiRequestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Store original json function
  const originalJson = res.json;
  
  // Override res.json to capture API response details
  res.json = function(data) {
    const responseTime = Date.now() - start;
    
    const logData = {
      requestId: req.requestId,
      endpoint: `${req.method} ${req.route?.path || req.url}`,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    };
    
    // Add user context if available
    if (req.user) {
      logData.userId = req.user.id;
    }
    
    // Add API key info if present
    if (req.headers['x-api-key']) {
      logData.apiKeyUsed = true;
    }
    
    // Log API usage
    logger.info('API Request', logData);
    
    // Call original json function
    originalJson.call(this, data);
  };
  
  req.requestId = generateRequestId();
  req.startTime = start;
  
  next();
};

// Webhook-specific request logger
const webhookRequestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log webhook reception
  logger.logWebhook({
    headers: req.headers,
    body: req.body,
    query: req.query,
    ip: req.ip,
  }, 'TradingView');
  
  // Store original end function
  const originalEnd = res.end;
  
  res.end = function(chunk, encoding) {
    const responseTime = Date.now() - start;
    
    logger.info('Webhook Processed', {
      responseTime: `${responseTime}ms`,
      statusCode: res.statusCode,
      timestamp: new Date().toISOString(),
    });
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Performance monitoring middleware
const performanceLogger = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    // Log slow requests (> 1 second)
    if (duration > 1000) {
      logger.logPerformance('Slow Request', duration, {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        ip: req.ip,
      });
    }
  });
  
  next();
};

module.exports = {
  requestLogger,
  detailedRequestLogger,
  securityRequestLogger,
  apiRequestLogger,
  webhookRequestLogger,
  performanceLogger,
  generateRequestId,
};