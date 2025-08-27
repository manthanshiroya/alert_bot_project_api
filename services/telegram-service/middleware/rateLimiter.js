const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const logger = require('../utils/logger');

// Redis client for rate limiting
let redisClient;

try {
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB || 0,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  });

  redisClient.on('error', (error) => {
    logger.error('Redis connection error for rate limiter:', error);
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected for rate limiting');
  });
} catch (error) {
  logger.error('Failed to initialize Redis for rate limiting:', error);
}

/**
 * Create rate limiter store
 */
const createStore = () => {
  if (redisClient) {
    return new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: 'telegram_rl:'
    });
  }
  
  // Fallback to memory store if Redis is not available
  logger.warn('Using memory store for rate limiting - not recommended for production');
  return undefined; // Use default memory store
};

/**
 * Custom key generator that includes user ID
 */
const keyGenerator = (req) => {
  const userId = req.user?.id || 'anonymous';
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  return `${userId}:${ip}`;
};

/**
 * Custom handler for rate limit exceeded
 */
const rateLimitHandler = (req, res) => {
  const userId = req.user?.id;
  const endpoint = `${req.method} ${req.originalUrl}`;
  
  logger.warn('Rate limit exceeded', {
    userId,
    ip: req.ip,
    endpoint,
    userAgent: req.get('User-Agent')
  });

  res.status(429).json({
    success: false,
    message: 'Too many requests. Please try again later.',
    retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    limit: req.rateLimit.limit,
    remaining: req.rateLimit.remaining
  });
};

/**
 * Skip rate limiting for certain conditions
 */
const skipRateLimit = (req) => {
  // Skip for health checks
  if (req.path.includes('/health')) {
    return true;
  }
  
  // Skip for service-to-service calls with valid API key
  if (req.service?.authenticated) {
    return true;
  }
  
  // Skip for admin users (optional)
  if (req.user?.role === 'admin' && process.env.SKIP_RATE_LIMIT_FOR_ADMIN === 'true') {
    return true;
  }
  
  return false;
};

/**
 * General rate limiter - 1000 requests per hour
 */
const generalRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  store: createStore(),
  keyGenerator,
  handler: rateLimitHandler,
  skip: skipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this user. Please try again later.'
  }
});

/**
 * Bot registration rate limiter - 5 requests per hour
 */
const botRegistrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  store: createStore(),
  keyGenerator,
  handler: rateLimitHandler,
  skip: skipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many bot registration attempts. Please try again later.'
  }
});

/**
 * Message sending rate limiter - 100 requests per hour
 */
const messageSendingRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  store: createStore(),
  keyGenerator,
  handler: rateLimitHandler,
  skip: skipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many messages sent. Please try again later.'
  }
});

/**
 * Alert creation rate limiter - 20 requests per hour
 */
const alertCreationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  store: createStore(),
  keyGenerator,
  handler: rateLimitHandler,
  skip: skipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many alert creation attempts. Please try again later.'
  }
});

/**
 * Alert testing rate limiter - 10 requests per hour
 */
const alertTestingRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  store: createStore(),
  keyGenerator,
  handler: rateLimitHandler,
  skip: skipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many alert test attempts. Please try again later.'
  }
});

/**
 * Webhook rate limiter - 1000 requests per hour per bot
 */
const webhookRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  store: createStore(),
  keyGenerator: (req) => {
    const botId = req.params.botId || 'unknown';
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return `webhook:${botId}:${ip}`;
  },
  handler: rateLimitHandler,
  skip: (req) => {
    // Skip for health checks
    return req.path.includes('/health');
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many webhook requests. Please try again later.'
  }
});

/**
 * Strict rate limiter for sensitive operations - 5 requests per hour
 */
const strictRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  store: createStore(),
  keyGenerator,
  handler: rateLimitHandler,
  skip: skipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many sensitive operation attempts. Please try again later.'
  }
});

/**
 * Bulk operations rate limiter - 3 requests per hour
 */
const bulkOperationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  store: createStore(),
  keyGenerator,
  handler: rateLimitHandler,
  skip: skipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many bulk operation attempts. Please try again later.'
  }
});

/**
 * Dynamic rate limiter based on user subscription
 */
const dynamicRateLimit = (baseLimit = 100, premiumMultiplier = 5) => {
  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: (req) => {
      const isPremium = req.user?.subscriptionStatus === 'active';
      return isPremium ? baseLimit * premiumMultiplier : baseLimit;
    },
    store: createStore(),
    keyGenerator,
    handler: rateLimitHandler,
    skip: skipRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Rate limit exceeded. Consider upgrading to premium for higher limits.'
    }
  });
};

/**
 * Per-minute rate limiter for real-time operations
 */
const perMinuteRateLimit = (maxRequests = 30) => {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: maxRequests,
    store: createStore(),
    keyGenerator,
    handler: rateLimitHandler,
    skip: skipRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests per minute. Please slow down.'
    }
  });
};

/**
 * Custom rate limiter factory
 */
const createCustomRateLimit = (options = {}) => {
  const defaultOptions = {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100,
    store: createStore(),
    keyGenerator,
    handler: rateLimitHandler,
    skip: skipRateLimit,
    standardHeaders: true,
    legacyHeaders: false
  };

  return rateLimit({ ...defaultOptions, ...options });
};

/**
 * Rate limit info middleware
 * Adds rate limit information to response headers
 */
const rateLimitInfo = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Add rate limit info to response if available
    if (req.rateLimit) {
      res.set({
        'X-RateLimit-Limit': req.rateLimit.limit,
        'X-RateLimit-Remaining': req.rateLimit.remaining,
        'X-RateLimit-Reset': new Date(req.rateLimit.resetTime).toISOString()
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

/**
 * Cleanup function for graceful shutdown
 */
const cleanup = async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
      logger.info('Redis connection closed for rate limiter');
    }
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
};

// Handle process termination
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

module.exports = {
  generalRateLimit,
  botRegistrationRateLimit,
  messageSendingRateLimit,
  alertCreationRateLimit,
  alertTestingRateLimit,
  webhookRateLimit,
  strictRateLimit,
  bulkOperationRateLimit,
  dynamicRateLimit,
  perMinuteRateLimit,
  createCustomRateLimit,
  rateLimitInfo,
  cleanup
};