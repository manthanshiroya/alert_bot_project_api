const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');
const logger = require('../utils/logger');
const environmentConfig = require('../config/environment');

class RateLimiter {
  constructor() {
    this.redisClient = null;
    this.initRedis();
  }

  // Initialize Redis client for rate limiting
  async initRedis() {
    try {
      const redisConfig = environmentConfig.get('REDIS');
      this.redisClient = redis.createClient({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.rateLimitDb || 2
      });

      this.redisClient.on('error', (error) => {
        logger.logError(error, {
          context: 'rate_limiter_redis',
          message: 'Redis connection error for rate limiter'
        });
      });

      await this.redisClient.connect();
      logger.info('Rate limiter Redis client connected');
    } catch (error) {
      logger.logError(error, {
        context: 'rate_limiter_redis_init',
        message: 'Failed to initialize Redis for rate limiter'
      });
    }
  }

  // Create Redis store for rate limiting
  createRedisStore() {
    if (!this.redisClient) {
      logger.warn('Redis client not available, using memory store for rate limiting');
      return undefined;
    }

    return new RedisStore({
      sendCommand: (...args) => this.redisClient.sendCommand(args)
    });
  }

  // General rate limiter
  general(options = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 100, // requests per window
      message = 'Too many requests, please try again later',
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
      keyGenerator = null
    } = options;

    return rateLimit({
      store: this.createRedisStore(),
      windowMs,
      max,
      message: {
        success: false,
        error: message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests,
      skipFailedRequests,
      keyGenerator: keyGenerator || this.defaultKeyGenerator,
      handler: this.rateLimitHandler,
      onLimitReached: this.onLimitReached
    });
  }

  // Authentication rate limiter (stricter)
  auth(options = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 5, // 5 attempts per window
      message = 'Too many authentication attempts, please try again later'
    } = options;

    return this.general({
      windowMs,
      max,
      message,
      skipSuccessfulRequests: true, // Don't count successful logins
      keyGenerator: (req) => {
        // Use IP + user identifier for auth attempts
        const userKey = req.body?.telegramId || req.body?.email || 'anonymous';
        return `auth:${req.ip}:${userKey}`;
      }
    });
  }

  // API rate limiter based on subscription plan
  api(options = {}) {
    return (req, res, next) => {
      const user = req.user;
      let limits;

      if (user) {
        // Subscription-based limits
        const subscriptionLimits = {
          free: { windowMs: 60 * 60 * 1000, max: 100 }, // 100 per hour
          premium: { windowMs: 60 * 60 * 1000, max: 1000 }, // 1000 per hour
          pro: { windowMs: 60 * 60 * 1000, max: 10000 } // 10000 per hour
        };
        
        limits = subscriptionLimits[user.subscriptionPlan] || subscriptionLimits.free;
      } else {
        // Anonymous user limits
        limits = { windowMs: 60 * 60 * 1000, max: 50 }; // 50 per hour
      }

      const limiter = this.general({
        ...limits,
        ...options,
        keyGenerator: (req) => {
          return user ? `api:user:${user.id}` : `api:ip:${req.ip}`;
        }
      });

      limiter(req, res, next);
    };
  }

  // Webhook rate limiter
  webhook(options = {}) {
    const {
      windowMs = 60 * 1000, // 1 minute
      max = 60, // 60 requests per minute
      message = 'Webhook rate limit exceeded'
    } = options;

    return this.general({
      windowMs,
      max,
      message,
      keyGenerator: (req) => {
        // Use API key or IP for webhook rate limiting
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        return apiKey ? `webhook:key:${apiKey}` : `webhook:ip:${req.ip}`;
      }
    });
  }

  // Admin panel rate limiter
  admin(options = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 200, // 200 requests per window
      message = 'Admin rate limit exceeded'
    } = options;

    return this.general({
      windowMs,
      max,
      message,
      keyGenerator: (req) => {
        const adminId = req.user?.id || 'anonymous';
        return `admin:${adminId}:${req.ip}`;
      }
    });
  }

  // File upload rate limiter
  upload(options = {}) {
    const {
      windowMs = 60 * 60 * 1000, // 1 hour
      max = 10, // 10 uploads per hour
      message = 'Upload rate limit exceeded'
    } = options;

    return this.general({
      windowMs,
      max,
      message,
      keyGenerator: (req) => {
        const userId = req.user?.id || req.ip;
        return `upload:${userId}`;
      }
    });
  }

  // Search rate limiter
  search(options = {}) {
    const {
      windowMs = 60 * 1000, // 1 minute
      max = 30, // 30 searches per minute
      message = 'Search rate limit exceeded'
    } = options;

    return this.general({
      windowMs,
      max,
      message,
      keyGenerator: (req) => {
        const userId = req.user?.id || req.ip;
        return `search:${userId}`;
      }
    });
  }

  // Alert creation rate limiter
  alertCreation(options = {}) {
    return (req, res, next) => {
      const user = req.user;
      let limits;

      if (user) {
        // Subscription-based alert creation limits
        const subscriptionLimits = {
          free: { windowMs: 24 * 60 * 60 * 1000, max: 5 }, // 5 per day
          premium: { windowMs: 24 * 60 * 60 * 1000, max: 50 }, // 50 per day
          pro: { windowMs: 24 * 60 * 60 * 1000, max: 500 } // 500 per day
        };
        
        limits = subscriptionLimits[user.subscriptionPlan] || subscriptionLimits.free;
      } else {
        limits = { windowMs: 24 * 60 * 60 * 1000, max: 1 }; // 1 per day for anonymous
      }

      const limiter = this.general({
        ...limits,
        ...options,
        message: 'Alert creation limit exceeded for your subscription plan',
        keyGenerator: (req) => {
          return user ? `alert:user:${user.id}` : `alert:ip:${req.ip}`;
        }
      });

      limiter(req, res, next);
    };
  }

  // Telegram message rate limiter
  telegramMessage(options = {}) {
    const {
      windowMs = 60 * 1000, // 1 minute
      max = 20, // 20 messages per minute (Telegram limit is 30)
      message = 'Telegram message rate limit exceeded'
    } = options;

    return this.general({
      windowMs,
      max,
      message,
      keyGenerator: (req) => {
        const telegramId = req.body?.telegramId || req.user?.telegramId || req.ip;
        return `telegram:${telegramId}`;
      }
    });
  }

  // Default key generator
  defaultKeyGenerator(req) {
    return req.ip;
  }

  // Rate limit handler
  rateLimitHandler(req, res) {
    const retryAfter = Math.round(req.rateLimit.resetTime / 1000) || 60;
    
    logger.logSecurityEvent('rate_limit_exceeded', {
      ip: req.ip,
      endpoint: req.path,
      method: req.method,
      userId: req.user?.id,
      userAgent: req.get('User-Agent'),
      limit: req.rateLimit.limit,
      current: req.rateLimit.current,
      remaining: req.rateLimit.remaining,
      resetTime: new Date(req.rateLimit.resetTime)
    });

    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter,
      limit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining,
      resetTime: new Date(req.rateLimit.resetTime).toISOString()
    });
  }

  // On limit reached callback
  onLimitReached(req, res, options) {
    logger.logSecurityEvent('rate_limit_reached', {
      ip: req.ip,
      endpoint: req.path,
      method: req.method,
      userId: req.user?.id,
      userAgent: req.get('User-Agent'),
      windowMs: options.windowMs,
      max: options.max
    });
  }

  // Custom rate limiter with dynamic limits
  dynamic(getLimits) {
    return async (req, res, next) => {
      try {
        const limits = await getLimits(req);
        
        if (!limits) {
          return next();
        }

        const limiter = this.general(limits);
        limiter(req, res, next);
      } catch (error) {
        logger.logError(error, {
          context: 'dynamic_rate_limiter',
          endpoint: req.path,
          method: req.method
        });
        
        // Fallback to default limits on error
        const fallbackLimiter = this.general();
        fallbackLimiter(req, res, next);
      }
    };
  }

  // Skip rate limiting for certain conditions
  skip(condition) {
    return (req, res, next) => {
      if (condition(req)) {
        return next();
      }
      
      // Apply default rate limiting
      const limiter = this.general();
      limiter(req, res, next);
    };
  }

  // Whitelist IP addresses
  whitelist(ips = []) {
    const whitelistedIPs = new Set(ips);
    
    return this.skip((req) => {
      return whitelistedIPs.has(req.ip) || whitelistedIPs.has(req.connection.remoteAddress);
    });
  }

  // Rate limiter for specific endpoints
  endpoint(endpointLimits) {
    return (req, res, next) => {
      const endpoint = req.path;
      const method = req.method.toLowerCase();
      const key = `${method}:${endpoint}`;
      
      const limits = endpointLimits[key] || endpointLimits[endpoint] || endpointLimits['*'];
      
      if (!limits) {
        return next();
      }

      const limiter = this.general(limits);
      limiter(req, res, next);
    };
  }

  // Get current rate limit status
  async getStatus(key) {
    try {
      if (!this.redisClient) {
        return null;
      }

      const current = await this.redisClient.get(`rl:${key}`);
      const ttl = await this.redisClient.ttl(`rl:${key}`);
      
      return {
        current: parseInt(current) || 0,
        ttl,
        resetTime: ttl > 0 ? Date.now() + (ttl * 1000) : null
      };
    } catch (error) {
      logger.logError(error, {
        context: 'rate_limiter_get_status',
        key
      });
      return null;
    }
  }

  // Reset rate limit for a key
  async reset(key) {
    try {
      if (!this.redisClient) {
        return false;
      }

      await this.redisClient.del(`rl:${key}`);
      logger.info('Rate limit reset', { key });
      return true;
    } catch (error) {
      logger.logError(error, {
        context: 'rate_limiter_reset',
        key
      });
      return false;
    }
  }

  // Cleanup expired rate limit entries
  async cleanup() {
    try {
      if (!this.redisClient) {
        return;
      }

      const keys = await this.redisClient.keys('rl:*');
      let cleaned = 0;
      
      for (const key of keys) {
        const ttl = await this.redisClient.ttl(key);
        if (ttl === -1) { // No expiration set
          await this.redisClient.del(key);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        logger.info('Rate limiter cleanup completed', { cleaned });
      }
    } catch (error) {
      logger.logError(error, {
        context: 'rate_limiter_cleanup'
      });
    }
  }

  // Close Redis connection
  async close() {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
        logger.info('Rate limiter Redis client disconnected');
      }
    } catch (error) {
      logger.logError(error, {
        context: 'rate_limiter_close'
      });
    }
  }
}

// Export singleton instance
module.exports = new RateLimiter();