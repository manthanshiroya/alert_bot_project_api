const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = process.env.LOG_DIR || './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Define colors for each log level
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'grey',
  debug: 'blue',
  silly: 'rainbow'
};

// Add colors to winston
winston.addColors(logColors);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service, requestId, userId, alertId, ...meta }) => {
    let logMessage = `${timestamp} [${level}]`;
    
    if (service) logMessage += ` [${service}]`;
    if (requestId) logMessage += ` [${requestId}]`;
    if (userId) logMessage += ` [User:${userId}]`;
    if (alertId) logMessage += ` [Alert:${alertId}]`;
    
    logMessage += `: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports array
const transports = [];

// Console transport
if (process.env.LOG_CONSOLE_ENABLED !== 'false') {
  transports.push(
    new winston.transports.Console({
      level: process.env.LOG_CONSOLE_LEVEL || 'debug',
      format: consoleFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );
}

// File transports
if (process.env.LOG_FILE_ENABLED !== 'false') {
  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, process.env.LOG_COMBINED_FILE || 'combined.log'),
      level: process.env.LOG_FILE_LEVEL || 'info',
      format: fileFormat,
      maxsize: process.env.LOG_MAX_SIZE || '10m',
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
      tailable: true,
      handleExceptions: true,
      handleRejections: true
    })
  );

  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, process.env.LOG_ERROR_FILE || 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: process.env.LOG_MAX_SIZE || '10m',
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
      tailable: true,
      handleExceptions: true,
      handleRejections: true
    })
  );

  // Daily rotate file transport for production
  if (process.env.NODE_ENV === 'production') {
    const DailyRotateFile = require('winston-daily-rotate-file');
    
    transports.push(
      new DailyRotateFile({
        filename: path.join(logDir, 'alert-engine-%DATE%.log'),
        datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: process.env.LOG_MAX_SIZE || '10m',
        maxFiles: process.env.LOG_MAX_FILES || '5d',
        format: fileFormat,
        level: process.env.LOG_FILE_LEVEL || 'info'
      })
    );
  }
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] })
  ),
  transports,
  exitOnError: false
});

// Create child logger with service context
const createChildLogger = (context = {}) => {
  return logger.child({
    service: 'alert-engine',
    ...context
  });
};

// Request logger middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = req.id || req.headers['x-request-id'] || 'unknown';
  
  // Add request ID to request object
  req.requestId = requestId;
  
  // Create request-specific logger
  req.logger = createChildLogger({ requestId });
  
  // Log request start
  req.logger.http('Request started', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id
  });
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    req.logger.http('Request completed', {
      method: req.method,
      url: req.url,
      statusCode,
      duration,
      contentLength: res.get('Content-Length'),
      userId: req.user?.id
    });
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Alert-specific logger
const alertLogger = {
  created: (alertId, userId, alertData) => {
    logger.info('Alert created', {
      alertId,
      userId,
      type: alertData.type,
      symbol: alertData.symbol,
      condition: alertData.condition
    });
  },
  
  triggered: (alertId, userId, triggerData) => {
    logger.info('Alert triggered', {
      alertId,
      userId,
      symbol: triggerData.symbol,
      currentValue: triggerData.currentValue,
      targetValue: triggerData.targetValue,
      condition: triggerData.condition
    });
  },
  
  processed: (alertId, userId, result) => {
    logger.info('Alert processed', {
      alertId,
      userId,
      success: result.success,
      duration: result.duration,
      error: result.error
    });
  },
  
  failed: (alertId, userId, error) => {
    logger.error('Alert processing failed', {
      alertId,
      userId,
      error: error.message,
      stack: error.stack
    });
  },
  
  cooldown: (alertId, userId, cooldownUntil) => {
    logger.debug('Alert in cooldown', {
      alertId,
      userId,
      cooldownUntil
    });
  }
};

// Performance logger
const performanceLogger = {
  start: (operation, context = {}) => {
    const startTime = process.hrtime.bigint();
    return {
      end: () => {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        
        logger.debug('Performance metric', {
          operation,
          duration,
          ...context
        });
        
        return duration;
      }
    };
  },
  
  memory: () => {
    const memUsage = process.memoryUsage();
    logger.debug('Memory usage', {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
    });
  },
  
  cpu: () => {
    const cpuUsage = process.cpuUsage();
    logger.debug('CPU usage', {
      user: cpuUsage.user,
      system: cpuUsage.system
    });
  }
};

// Error logger with context
const errorLogger = {
  api: (error, req, context = {}) => {
    logger.error('API Error', {
      error: error.message,
      stack: error.stack,
      method: req?.method,
      url: req?.url,
      requestId: req?.requestId,
      userId: req?.user?.id,
      ...context
    });
  },
  
  database: (error, operation, context = {}) => {
    logger.error('Database Error', {
      error: error.message,
      stack: error.stack,
      operation,
      ...context
    });
  },
  
  external: (error, service, operation, context = {}) => {
    logger.error('External Service Error', {
      error: error.message,
      stack: error.stack,
      service,
      operation,
      ...context
    });
  },
  
  validation: (error, data, context = {}) => {
    logger.warn('Validation Error', {
      error: error.message,
      data,
      ...context
    });
  }
};

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, closing logger...');
  logger.end();
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, closing logger...');
  logger.end();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString()
  });
});

module.exports = {
  logger,
  createChildLogger,
  requestLogger,
  alertLogger,
  performanceLogger,
  errorLogger
};