const jwt = require('jsonwebtoken');
const environmentConfig = require('../config/environment');
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

class AuthMiddleware {
  // JWT Authentication middleware
  static authenticate(options = {}) {
    return async (req, res, next) => {
      try {
        const { required = true, roles = [] } = options;
        
        // Extract token from header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
          if (!required) {
            return next();
          }
          return res.status(401).json({
            success: false,
            error: 'Authorization header missing',
            code: 'AUTH_HEADER_MISSING'
          });
        }

        const token = authHeader.startsWith('Bearer ') 
          ? authHeader.slice(7) 
          : authHeader;

        if (!token) {
          if (!required) {
            return next();
          }
          return res.status(401).json({
            success: false,
            error: 'Token missing',
            code: 'TOKEN_MISSING'
          });
        }

        // Verify token
        let decoded;
        try {
          decoded = Helpers.verifyToken(token);
        } catch (error) {
          logger.logSecurityEvent('invalid_token_attempt', {
            token: token.substring(0, 20) + '...',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            error: error.message
          });
          
          return res.status(401).json({
            success: false,
            error: 'Invalid token',
            code: 'TOKEN_INVALID'
          });
        }

        // Check if token is expired
        if (decoded.exp && Date.now() >= decoded.exp * 1000) {
          return res.status(401).json({
            success: false,
            error: 'Token expired',
            code: 'TOKEN_EXPIRED'
          });
        }

        // Check user roles if specified
        if (roles.length > 0 && !roles.includes(decoded.role)) {
          logger.logSecurityEvent('insufficient_permissions', {
            userId: decoded.id,
            requiredRoles: roles,
            userRole: decoded.role,
            endpoint: req.path
          });
          
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions',
            code: 'INSUFFICIENT_PERMISSIONS'
          });
        }

        // Attach user info to request
        req.user = {
          id: decoded.id,
          telegramId: decoded.telegramId,
          role: decoded.role,
          email: decoded.email,
          isActive: decoded.isActive
        };

        // Log successful authentication
        logger.logUserAction(decoded.id, 'authenticated', {
          endpoint: req.path,
          method: req.method,
          ip: req.ip
        });

        next();
      } catch (error) {
        logger.logError(error, {
          middleware: 'authenticate',
          endpoint: req.path,
          method: req.method
        });
        
        return res.status(500).json({
          success: false,
          error: 'Authentication error',
          code: 'AUTH_ERROR'
        });
      }
    };
  }

  // API Key authentication middleware
  static authenticateApiKey(options = {}) {
    return async (req, res, next) => {
      try {
        const { required = true, validKeys = [] } = options;
        
        // Extract API key from header or query
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        
        if (!apiKey) {
          if (!required) {
            return next();
          }
          return res.status(401).json({
            success: false,
            error: 'API key missing',
            code: 'API_KEY_MISSING'
          });
        }

        // Validate API key
        const isValidKey = validKeys.length > 0 
          ? validKeys.includes(apiKey)
          : apiKey === environmentConfig.get('TRADINGVIEW_WEBHOOK_SECRET');

        if (!isValidKey) {
          logger.logSecurityEvent('invalid_api_key_attempt', {
            apiKey: apiKey.substring(0, 8) + '...',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path
          });
          
          return res.status(401).json({
            success: false,
            error: 'Invalid API key',
            code: 'API_KEY_INVALID'
          });
        }

        // Attach API key info to request
        req.apiKey = {
          key: apiKey,
          type: 'webhook'
        };

        logger.info('API key authenticated', {
          endpoint: req.path,
          method: req.method,
          ip: req.ip
        });

        next();
      } catch (error) {
        logger.logError(error, {
          middleware: 'authenticateApiKey',
          endpoint: req.path,
          method: req.method
        });
        
        return res.status(500).json({
          success: false,
          error: 'API key authentication error',
          code: 'API_KEY_AUTH_ERROR'
        });
      }
    };
  }

  // Role-based authorization middleware
  static authorize(allowedRoles) {
    return (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
          });
        }

        const userRole = req.user.role;
        const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

        if (!roles.includes(userRole)) {
          logger.logSecurityEvent('authorization_failed', {
            userId: req.user.id,
            userRole,
            requiredRoles: roles,
            endpoint: req.path,
            method: req.method
          });
          
          return res.status(403).json({
            success: false,
            error: 'Access denied',
            code: 'ACCESS_DENIED'
          });
        }

        next();
      } catch (error) {
        logger.logError(error, {
          middleware: 'authorize',
          endpoint: req.path,
          method: req.method
        });
        
        return res.status(500).json({
          success: false,
          error: 'Authorization error',
          code: 'AUTHORIZATION_ERROR'
        });
      }
    };
  }

  // Admin-only authorization
  static requireAdmin() {
    return this.authorize(['admin']);
  }

  // User or Admin authorization
  static requireUser() {
    return this.authorize(['user', 'admin']);
  }

  // Optional authentication (doesn't fail if no token)
  static optionalAuth() {
    return this.authenticate({ required: false });
  }

  // Check if user is active
  static requireActiveUser() {
    return (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
          });
        }

        if (!req.user.isActive) {
          logger.logSecurityEvent('inactive_user_access_attempt', {
            userId: req.user.id,
            endpoint: req.path,
            method: req.method
          });
          
          return res.status(403).json({
            success: false,
            error: 'Account is inactive',
            code: 'ACCOUNT_INACTIVE'
          });
        }

        next();
      } catch (error) {
        logger.logError(error, {
          middleware: 'requireActiveUser',
          endpoint: req.path,
          method: req.method
        });
        
        return res.status(500).json({
          success: false,
          error: 'User status check error',
          code: 'USER_STATUS_ERROR'
        });
      }
    };
  }

  // Rate limiting by user
  static rateLimitByUser(options = {}) {
    const { maxRequests = 100, windowMs = 15 * 60 * 1000 } = options;
    const userRequests = new Map();

    return (req, res, next) => {
      try {
        const userId = req.user?.id || req.ip;
        const now = Date.now();
        const windowStart = now - windowMs;

        // Clean old entries
        if (userRequests.has(userId)) {
          const requests = userRequests.get(userId).filter(time => time > windowStart);
          userRequests.set(userId, requests);
        }

        // Check current requests
        const currentRequests = userRequests.get(userId) || [];
        
        if (currentRequests.length >= maxRequests) {
          logger.logSecurityEvent('rate_limit_exceeded', {
            userId,
            requestCount: currentRequests.length,
            maxRequests,
            endpoint: req.path,
            ip: req.ip
          });
          
          return res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil(windowMs / 1000)
          });
        }

        // Add current request
        currentRequests.push(now);
        userRequests.set(userId, currentRequests);

        next();
      } catch (error) {
        logger.logError(error, {
          middleware: 'rateLimitByUser',
          endpoint: req.path,
          method: req.method
        });
        
        next(); // Don't block on rate limiting errors
      }
    };
  }

  // Webhook signature validation
  static validateWebhookSignature(secret) {
    return (req, res, next) => {
      try {
        const signature = req.headers['x-signature'] || req.headers['x-hub-signature-256'];
        
        if (!signature) {
          return res.status(401).json({
            success: false,
            error: 'Webhook signature missing',
            code: 'WEBHOOK_SIGNATURE_MISSING'
          });
        }

        const body = JSON.stringify(req.body);
        const expectedSignature = `sha256=${require('crypto')
          .createHmac('sha256', secret)
          .update(body)
          .digest('hex')}`;

        if (signature !== expectedSignature) {
          logger.logSecurityEvent('invalid_webhook_signature', {
            receivedSignature: signature,
            expectedSignature,
            ip: req.ip,
            endpoint: req.path
          });
          
          return res.status(401).json({
            success: false,
            error: 'Invalid webhook signature',
            code: 'WEBHOOK_SIGNATURE_INVALID'
          });
        }

        next();
      } catch (error) {
        logger.logError(error, {
          middleware: 'validateWebhookSignature',
          endpoint: req.path,
          method: req.method
        });
        
        return res.status(500).json({
          success: false,
          error: 'Webhook signature validation error',
          code: 'WEBHOOK_SIGNATURE_ERROR'
        });
      }
    };
  }
}

module.exports = AuthMiddleware;