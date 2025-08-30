const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

// Define format for file logs (without colors)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: format,
    level: level(),
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/all.log'),
    format: fileFormat,
    level: 'debug',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  
  // File transport for error logs
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/error.log'),
    format: fileFormat,
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  
  // File transport for HTTP logs
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/http.log'),
    format: fileFormat,
    level: 'http',
    maxsize: 5242880, // 5MB
    maxFiles: 3,
  }),
];

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format: fileFormat,
  transports,
  exitOnError: false,
});

// Add additional methods for specific use cases
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Custom methods for different types of logs
logger.logRequest = (req, res, responseTime) => {
  const { method, url, ip } = req;
  const { statusCode } = res;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  logger.http(`${method} ${url} - ${statusCode} - ${responseTime}ms - ${ip} - ${userAgent}`);
};

logger.logError = (error, req = null) => {
  let errorMessage = error.message || 'Unknown error';
  
  if (req) {
    errorMessage += ` | Route: ${req.method} ${req.url} | IP: ${req.ip}`;
    if (req.user) {
      errorMessage += ` | User: ${req.user.id}`;
    }
  }
  
  logger.error(errorMessage, {
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });
};

logger.logAlert = (alertData, action) => {
  logger.info(`Alert ${action}`, {
    alertId: alertData.id,
    symbol: alertData.symbol,
    action: alertData.action,
    userId: alertData.userId,
    timestamp: new Date().toISOString(),
  });
};

logger.logTrade = (tradeData, action) => {
  logger.info(`Trade ${action}`, {
    tradeId: tradeData.id,
    symbol: tradeData.symbol,
    action: tradeData.action,
    price: tradeData.price,
    quantity: tradeData.quantity,
    userId: tradeData.userId,
    timestamp: new Date().toISOString(),
  });
};

logger.logWebhook = (webhookData, source) => {
  logger.info(`Webhook received from ${source}`, {
    source,
    data: webhookData,
    timestamp: new Date().toISOString(),
  });
};

logger.logTelegram = (action, userId, message) => {
  logger.info(`Telegram ${action}`, {
    userId,
    message: message.substring(0, 100), // Limit message length in logs
    timestamp: new Date().toISOString(),
  });
};

logger.logSubscription = (subscriptionData, action) => {
  logger.info(`Subscription ${action}`, {
    subscriptionId: subscriptionData.id,
    userId: subscriptionData.userId,
    plan: subscriptionData.plan,
    status: subscriptionData.status,
    timestamp: new Date().toISOString(),
  });
};

logger.logSecurity = (event, details) => {
  logger.warn(`Security Event: ${event}`, {
    event,
    details,
    timestamp: new Date().toISOString(),
  });
};

logger.logPerformance = (operation, duration, details = {}) => {
  logger.info(`Performance: ${operation} took ${duration}ms`, {
    operation,
    duration,
    details,
    timestamp: new Date().toISOString(),
  });
};

// Handle uncaught exceptions and unhandled rejections
logger.exceptions.handle(
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/exceptions.log'),
    format: fileFormat,
  })
);

logger.rejections.handle(
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/rejections.log'),
    format: fileFormat,
  })
);

// Export the logger
module.exports = logger;