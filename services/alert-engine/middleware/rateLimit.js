const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');
const { logger } = require('../utils');
const { helpers } = require('../utils');

// Create Redis client for rate limiting if Redis is configured
let redisClient = null;
if (process.env.REDIS_URL) {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          logger.error('Redis connection refused for rate limiting');
          return new Error('Redis connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error('Redis retry time exhausted');
        }
        if (options.attempt > 10) {
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });

    redisClient.on('error', (err) => {
      logger.error('Redis rate limiting error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected for rate limiting');
    });
  } catch (error) {
    logger.error('Failed to create Redis client for rate limiting:', error);
    redisClient = null;
  }
}

/**
 * Create rate limiter with custom options
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(options.windowMs / 1000) || 900
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl,
        method: req.method
      });
      
      res.status(429).json(options.message || {
        success: false,
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil((options.windowMs || 15 * 60 * 1000) / 1000)
      });
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP
      if (req.user && req.user.id) {
        return `user:${req.user.id}`;
      }
      return req.ip;
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      if (req.path.startsWith('/api/health')) {
        return true;
      }
      
      // Skip for service-to-service communication
      if (req.service && req.service.authenticated) {
        return true;
      }
      
      return false;
    }
  };

  const mergedOptions = { ...defaultOptions, ...options };

  // Use Redis store if available
  if (redisClient) {
    try {
      mergedOptions.store = new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: 'rl:alert-engine:'
      });
    } catch (error) {
      logger.warn('Failed to use Redis store for rate limiting, falling back to memory store:', error);
    }
  }

  return rateLimit(mergedOptions);
};

/**
 * General API rate limiter
 */
const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: helpers.errorResponse('Too many requests, please try again later.')
});

/**
 * Strict rate limiter for sensitive operations
 */
const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes
  message: helpers.errorResponse('Too many requests for this operation, please try again later.')
});

/**
 * Alert creation rate limiter
 */
const alertCreationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 alert creations per hour
  message: helpers.errorResponse('Too many alerts created, please try again later.')
});

/**
 * Market data rate limiter
 */
const marketDataLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: helpers.errorResponse('Too many market data requests, please try again later.')
});

/**
 * Authentication rate limiter
 */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 authentication attempts per 15 minutes
  message: helpers.errorResponse('Too many authentication attempts, please try again later.'),
  keyGenerator: (req) => req.ip // Always use IP for auth attempts
});

/**
 * Subscription-based rate limiter
 * Different limits based on user's subscription plan
 */
const subscriptionBasedLimiter = (req, res, next) => {
  if (!req.user) {
    // Apply default limits for unauthenticated users
    return generalLimiter(req, res, next);
  }

  const plan = req.user.subscriptionPlan || 'free';
  let limiterOptions;

  switch (plan) {
    case 'premium':
      limiterOptions = {
        windowMs: 15 * 60 * 1000,
        max: 500, // 500 requests per 15 minutes
        message: helpers.errorResponse('Premium rate limit exceeded, please try again later.')
      };
      break;
    case 'pro':
      limiterOptions = {
        windowMs: 15 * 60 * 1000,
        max: 300, // 300 requests per 15 minutes
        message: helpers.errorResponse('Pro rate limit exceeded, please try again later.')
      };
      break;
    case 'basic':
      limiterOptions = {
        windowMs: 15 * 60 * 1000,
        max: 150, // 150 requests per 15 minutes
        message: helpers.errorResponse('Basic rate limit exceeded, please try again later.')
      };
      break;
    default: // free
      limiterOptions = {
        windowMs: 15 * 60 * 1000,
        max: 50, // 50 requests per 15 minutes
        message: helpers.errorResponse('Free tier rate limit exceeded, please upgrade your plan.')
      };
  }

  const limiter = createRateLimiter(limiterOptions);
  return limiter(req, res, next);
};

/**
 * Dynamic rate limiter based on endpoint sensitivity
 */
const dynamicLimiter = (req, res, next) => {
  const path = req.path;
  const method = req.method;

  // Determine rate limit based on endpoint
  let limiterOptions;

  if (path.includes('/alerts') && method === 'POST') {
    // Alert creation
    limiterOptions = {
      windowMs: 60 * 60 * 1000,
      max: 20,
      message: helpers.errorResponse('Too many alerts created, please try again later.')
    };
  } else if (path.includes('/market/batch')) {
    // Batch market data requests
    limiterOptions = {
      windowMs: 5 * 60 * 1000,
      max: 10,
      message: helpers.errorResponse('Too many batch requests, please try again later.')
    };
  } else if (path.includes('/market')) {
    // Regular market data requests
    limiterOptions = {
      windowMs: 1 * 60 * 1000,
      max: 60,
      message: helpers.errorResponse('Too many market data requests, please try again later.')
    };
  } else if (method === 'DELETE') {
    // Delete operations
    limiterOptions = {
      windowMs: 15 * 60 * 1000,
      max: 30,
      message: helpers.errorResponse('Too many delete operations, please try again later.')
    };
  } else {
    // Default rate limit
    limiterOptions = {
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: helpers.errorResponse('Rate limit exceeded, please try again later.')
    };
  }

  const limiter = createRateLimiter(limiterOptions);
  return limiter(req, res, next);
};

/**
 * Rate limiter for testing endpoints
 */
const testLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 test requests per 5 minutes
  message: helpers.errorResponse('Too many test requests, please try again later.')
});

/**
 * Burst protection limiter
 * Prevents rapid successive requests
 */
const burstLimiter = createRateLimiter({
  windowMs: 1 * 1000, // 1 second
  max: 5, // 5 requests per second
  message: helpers.errorResponse('Too many requests in a short time, please slow down.')
});

/**
 * Get rate limit status for a key
 */
const getRateLimitStatus = async (key) => {
  if (!redisClient) {
    return null;
  }

  try {
    const current = await redisClient.get(`rl:alert-engine:${key}`);
    const ttl = await redisClient.ttl(`rl:alert-engine:${key}`);
    
    return {
      current: parseInt(current) || 0,
      remaining: Math.max(0, 100 - (parseInt(current) || 0)),
      resetTime: new Date(Date.now() + (ttl * 1000))
    };
  } catch (error) {
    logger.error('Failed to get rate limit status:', error);
    return null;
  }
};

/**
 * Reset rate limit for a key (admin function)
 */
const resetRateLimit = async (key) => {
  if (!redisClient) {
    return false;
  }

  try {
    await redisClient.del(`rl:alert-engine:${key}`);
    logger.info('Rate limit reset for key:', key);
    return true;
  } catch (error) {
    logger.error('Failed to reset rate limit:', error);
    return false;
  }
};

module.exports = {
  createRateLimiter,
  generalLimiter,
  strictLimiter,
  alertCreationLimiter,
  marketDataLimiter,
  authLimiter,
  subscriptionBasedLimiter,
  dynamicLimiter,
  testLimiter,
  burstLimiter,
  getRateLimitStatus,
  resetRateLimit
};