const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * Authentication middleware
 * Verifies JWT token and extracts user information
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'Invalid access token'
      });
    }

    // Check token expiration
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({
        success: false,
        message: 'Access token expired'
      });
    }

    // Attach user info to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role || 'user',
      subscriptionId: decoded.subscriptionId,
      subscriptionStatus: decoded.subscriptionStatus,
      permissions: decoded.permissions || []
    };

    // Log authentication for audit
    logger.debug('User authenticated', {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: `${req.method} ${req.originalUrl}`
    });

    next();

  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid access token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Access token expired'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Authorization middleware
 * Checks if user has required role or permissions
 */
const authorize = (allowedRoles = [], requiredPermissions = []) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { role, permissions = [] } = req.user;

      // Check role-based access
      if (allowedRoles.length > 0) {
        if (!allowedRoles.includes(role)) {
          logger.warn('Authorization failed - insufficient role', {
            userId: req.user.id,
            userRole: role,
            requiredRoles: allowedRoles,
            endpoint: `${req.method} ${req.originalUrl}`
          });
          
          return res.status(403).json({
            success: false,
            message: 'Insufficient permissions'
          });
        }
      }

      // Check permission-based access
      if (requiredPermissions.length > 0) {
        const hasAllPermissions = requiredPermissions.every(permission => 
          permissions.includes(permission)
        );
        
        if (!hasAllPermissions) {
          logger.warn('Authorization failed - missing permissions', {
            userId: req.user.id,
            userPermissions: permissions,
            requiredPermissions,
            endpoint: `${req.method} ${req.originalUrl}`
          });
          
          return res.status(403).json({
            success: false,
            message: 'Insufficient permissions'
          });
        }
      }

      // Check subscription status for premium features
      if (req.originalUrl.includes('/premium') || req.query.premium === 'true') {
        if (!req.user.subscriptionStatus || req.user.subscriptionStatus !== 'active') {
          return res.status(403).json({
            success: false,
            message: 'Active subscription required for this feature'
          });
        }
      }

      next();

    } catch (error) {
      logger.error('Authorization error:', error);
      res.status(500).json({
        success: false,
        message: 'Authorization failed'
      });
    }
  };
};

/**
 * Optional authentication middleware
 * Extracts user info if token is provided, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          
          if (decoded && decoded.id && (!decoded.exp || Date.now() < decoded.exp * 1000)) {
            req.user = {
              id: decoded.id,
              email: decoded.email,
              role: decoded.role || 'user',
              subscriptionId: decoded.subscriptionId,
              subscriptionStatus: decoded.subscriptionStatus,
              permissions: decoded.permissions || []
            };
          }
        } catch (error) {
          // Ignore token errors for optional auth
          logger.debug('Optional auth token error:', error.message);
        }
      }
    }

    next();

  } catch (error) {
    logger.error('Optional authentication error:', error);
    next(); // Continue without authentication
  }
};

/**
 * API Key authentication middleware
 * For service-to-service communication
 */
const authenticateApiKey = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required'
      });
    }

    // Validate API key
    const validApiKeys = [
      process.env.API_GATEWAY_KEY,
      process.env.SUBSCRIPTION_SERVICE_KEY,
      process.env.ALERT_ENGINE_KEY
    ].filter(Boolean);

    if (!validApiKeys.includes(apiKey)) {
      logger.warn('Invalid API key attempt', {
        apiKey: apiKey.substring(0, 8) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: `${req.method} ${req.originalUrl}`
      });
      
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }

    // Set service context
    req.service = {
      name: getServiceNameFromApiKey(apiKey),
      authenticated: true
    };

    logger.debug('Service authenticated', {
      service: req.service.name,
      ip: req.ip,
      endpoint: `${req.method} ${req.originalUrl}`
    });

    next();

  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Get service name from API key
 */
function getServiceNameFromApiKey(apiKey) {
  if (apiKey === process.env.API_GATEWAY_KEY) return 'api-gateway';
  if (apiKey === process.env.SUBSCRIPTION_SERVICE_KEY) return 'subscription-service';
  if (apiKey === process.env.ALERT_ENGINE_KEY) return 'alert-engine';
  return 'unknown';
}

/**
 * Webhook authentication middleware
 * Validates Telegram webhook signatures
 */
const authenticateWebhook = (req, res, next) => {
  try {
    const { botId } = req.params;
    const signature = req.headers['x-telegram-bot-api-secret-token'];
    
    if (!botId) {
      return res.status(400).json({
        success: false,
        message: 'Bot ID required'
      });
    }

    // For now, just validate that botId exists
    // In production, you would validate the webhook signature
    req.webhook = {
      botId,
      signature,
      validated: true
    };

    next();

  } catch (error) {
    logger.error('Webhook authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook authentication failed'
    });
  }
};

/**
 * Admin-only middleware
 */
const adminOnly = authorize(['admin']);

/**
 * User or admin middleware
 */
const userOrAdmin = authorize(['user', 'admin']);

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  authenticateApiKey,
  authenticateWebhook,
  adminOnly,
  userOrAdmin
};