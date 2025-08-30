const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which logs to print if you're in development mode
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define different log format for console and file
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define which transports the logger must use
const transports = [
  // Allow console logging
  new winston.transports.Console({
    format: format
  }),
  // Allow file logging
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    )
  }),
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'combined.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    )
  })
];

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  // Do not exit on handled exceptions
  exitOnError: false
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Add custom logging methods
logger.logRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    ip: req.ip,
    userAgent: req.get('User-Agent') || 'Unknown',
    timestamp: new Date().toISOString(),
  };
  
  if (res.statusCode >= 500) {
    logger.error('Request Error', logData);
  } else if (res.statusCode >= 400) {
    logger.warn('Request Warning', logData);
  } else {
    logger.http('Request Success', logData);
  }
};

logger.logError = (err, req) => {
  const errorData = {
    message: err.message,
    stack: err.stack,
    url: req?.url,
    method: req?.method,
    ip: req?.ip,
    timestamp: new Date().toISOString(),
  };
  
  logger.error('Application Error', errorData);
};

logger.logSecurity = (message, data) => {
  logger.warn(`SECURITY: ${message}`, data);
};

logger.logWebhook = (data, source) => {
  logger.info(`Webhook received from ${source}`, {
    source,
    timestamp: new Date().toISOString(),
    ...data
  });
};

module.exports = logger;