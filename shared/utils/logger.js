const winston = require('winston');
const path = require('path');
const environmentConfig = require('../config/environment');

class Logger {
  constructor() {
    this.logger = this.createLogger();
  }

  createLogger() {
    const logLevel = environmentConfig.get('LOG_LEVEL');
    const nodeEnv = environmentConfig.getEnvironment();
    
    // Define log format
    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}]`;
        
        if (service) {
          log += ` [${service}]`;
        }
        
        log += `: ${message}`;
        
        if (Object.keys(meta).length > 0) {
          log += ` ${JSON.stringify(meta)}`;
        }
        
        return log;
      })
    );

    // Define transports
    const transports = [];

    // Console transport
    if (nodeEnv === 'development') {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
              let log = `${timestamp} [${level}]`;
              
              if (service) {
                log += ` [${service}]`;
              }
              
              log += `: ${message}`;
              
              if (Object.keys(meta).length > 0) {
                log += ` ${JSON.stringify(meta, null, 2)}`;
              }
              
              return log;
            })
          )
        })
      );
    } else {
      transports.push(
        new winston.transports.Console({
          format: logFormat
        })
      );
    }

    // File transports for production and staging
    if (nodeEnv !== 'development') {
      // Error log file
      transports.push(
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'error.log'),
          level: 'error',
          format: logFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        })
      );

      // Combined log file
      transports.push(
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'combined.log'),
          format: logFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        })
      );
    }

    return winston.createLogger({
      level: logLevel,
      format: logFormat,
      defaultMeta: {
        service: process.env.SERVICE_NAME || 'alertbot'
      },
      transports,
      exitOnError: false,
    });
  }

  // Log methods
  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  verbose(message, meta = {}) {
    this.logger.verbose(message, meta);
  }

  // Structured logging methods
  logRequest(req, res, responseTime) {
    const logData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?.id,
    };

    if (res.statusCode >= 400) {
      this.error('HTTP Request Error', logData);
    } else {
      this.info('HTTP Request', logData);
    }
  }

  logDatabaseOperation(operation, collection, query, result, duration) {
    const logData = {
      operation,
      collection,
      query: JSON.stringify(query),
      resultCount: Array.isArray(result) ? result.length : result ? 1 : 0,
      duration: `${duration}ms`,
    };

    this.debug('Database Operation', logData);
  }

  logServiceCall(service, method, url, statusCode, duration, error = null) {
    const logData = {
      service,
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
    };

    if (error) {
      logData.error = error.message;
      this.error('Service Call Failed', logData);
    } else if (statusCode >= 400) {
      this.warn('Service Call Warning', logData);
    } else {
      this.info('Service Call Success', logData);
    }
  }

  logAlert(alertData, status, error = null) {
    const logData = {
      alertId: alertData.id,
      symbol: alertData.symbol,
      condition: alertData.condition,
      status,
      timestamp: new Date().toISOString(),
    };

    if (error) {
      logData.error = error.message;
      this.error('Alert Processing Failed', logData);
    } else {
      this.info('Alert Processed', logData);
    }
  }

  logTelegramMessage(chatId, messageType, status, error = null) {
    const logData = {
      chatId,
      messageType,
      status,
      timestamp: new Date().toISOString(),
    };

    if (error) {
      logData.error = error.message;
      this.error('Telegram Message Failed', logData);
    } else {
      this.info('Telegram Message Sent', logData);
    }
  }

  logUserAction(userId, action, details = {}) {
    const logData = {
      userId,
      action,
      timestamp: new Date().toISOString(),
      ...details,
    };

    this.info('User Action', logData);
  }

  logSecurityEvent(event, details = {}) {
    const logData = {
      securityEvent: event,
      timestamp: new Date().toISOString(),
      ...details,
    };

    this.warn('Security Event', logData);
  }

  logPerformanceMetric(metric, value, unit = 'ms') {
    const logData = {
      metric,
      value,
      unit,
      timestamp: new Date().toISOString(),
    };

    this.info('Performance Metric', logData);
  }

  // Error handling
  logError(error, context = {}) {
    const logData = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      context,
      timestamp: new Date().toISOString(),
    };

    this.error('Application Error', logData);
  }

  // Health check logging
  logHealthCheck(service, status, details = {}) {
    const logData = {
      service,
      status,
      timestamp: new Date().toISOString(),
      ...details,
    };

    if (status === 'healthy') {
      this.debug('Health Check', logData);
    } else {
      this.warn('Health Check Failed', logData);
    }
  }

  // Create child logger with additional context
  child(defaultMeta) {
    return {
      error: (message, meta = {}) => this.error(message, { ...defaultMeta, ...meta }),
      warn: (message, meta = {}) => this.warn(message, { ...defaultMeta, ...meta }),
      info: (message, meta = {}) => this.info(message, { ...defaultMeta, ...meta }),
      debug: (message, meta = {}) => this.debug(message, { ...defaultMeta, ...meta }),
      verbose: (message, meta = {}) => this.verbose(message, { ...defaultMeta, ...meta }),
    };
  }

  // Stream for Morgan HTTP logging
  getStream() {
    return {
      write: (message) => {
        this.info(message.trim());
      }
    };
  }
}

// Singleton instance
const logger = new Logger();

module.exports = logger;