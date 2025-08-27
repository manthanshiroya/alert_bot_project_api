const jwt = require('jsonwebtoken');
const { logger } = require('../utils');
const { helpers } = require('../utils');

/**
 * Authentication middleware for Alert Engine
 * Validates JWT tokens and extracts user information
 */
const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json(
        helpers.errorResponse('Access denied. No token provided.')
      );
    }

    // Check if token starts with 'Bearer '
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json(
        helpers.errorResponse('Access denied. Invalid token format.')
      );
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json(
        helpers.errorResponse('Access denied. No token provided.')
      );
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add user info to request
    req.user = {
      id: decoded.userId || decoded.id,
      email: decoded.email,
      role: decoded.role || 'user',
      subscriptionPlan: decoded.subscriptionPlan || 'free',
      permissions: decoded.permissions || [],
      iat: decoded.iat,
      exp: decoded.exp
    };

    // Check if token is expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < currentTime) {
      return res.status(401).json(
        helpers.errorResponse('Access denied. Token has expired.')
      );
    }

    // Log successful authentication
    logger.debug('User authenticated successfully', {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      token: req.header('Authorization')?.substring(0, 20) + '...'
    });

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json(
        helpers.errorResponse('Access denied. Invalid token.')
      );
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json(
        helpers.errorResponse('Access denied. Token has expired.')
      );
    }

    res.status(401).json(
      helpers.errorResponse('Access denied. Authentication failed.')
    );
  }
};

/**
 * Optional authentication middleware
 * Adds user info if token is present and valid, but doesn't require authentication
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if token is expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < currentTime) {
        return next();
      }

      req.user = {
        id: decoded.userId || decoded.id,
        email: decoded.email,
        role: decoded.role || 'user',
        subscriptionPlan: decoded.subscriptionPlan || 'free',
        permissions: decoded.permissions || [],
        iat: decoded.iat,
        exp: decoded.exp
      };

      logger.debug('Optional authentication successful', {
        userId: req.user.id,
        email: req.user.email
      });
    } catch (tokenError) {
      // Invalid token, but continue without authentication
      logger.debug('Optional authentication failed, continuing without auth', {
        error: tokenError.message
      });
    }

    next();
  } catch (error) {
    logger.error('Optional authentication middleware error:', error);
    next(); // Continue without authentication
  }
};

/**
 * Role-based authorization middleware
 * Requires specific roles to access the endpoint
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(
        helpers.errorResponse('Access denied. Authentication required.')
      );
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      logger.warn('Authorization failed - insufficient role', {
        userId: req.user.id,
        userRole,
        requiredRoles: allowedRoles,
        endpoint: req.originalUrl
      });

      return res.status(403).json(
        helpers.errorResponse('Access denied. Insufficient permissions.')
      );
    }

    next();
  };
};

/**
 * Permission-based authorization middleware
 * Requires specific permissions to access the endpoint
 */
const requirePermission = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(
        helpers.errorResponse('Access denied. Authentication required.')
      );
    }

    const userPermissions = req.user.permissions || [];
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

    const hasPermission = requiredPermissions.some(permission => 
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      logger.warn('Authorization failed - insufficient permissions', {
        userId: req.user.id,
        userPermissions,
        requiredPermissions,
        endpoint: req.originalUrl
      });

      return res.status(403).json(
        helpers.errorResponse('Access denied. Insufficient permissions.')
      );
    }

    next();
  };
};

/**
 * Subscription plan authorization middleware
 * Requires specific subscription plans to access the endpoint
 */
const requireSubscription = (plans) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(
        helpers.errorResponse('Access denied. Authentication required.')
      );
    }

    const userPlan = req.user.subscriptionPlan;
    const allowedPlans = Array.isArray(plans) ? plans : [plans];

    if (!allowedPlans.includes(userPlan)) {
      logger.warn('Authorization failed - insufficient subscription plan', {
        userId: req.user.id,
        userPlan,
        requiredPlans: allowedPlans,
        endpoint: req.originalUrl
      });

      return res.status(403).json(
        helpers.errorResponse('Access denied. Upgrade your subscription to access this feature.')
      );
    }

    next();
  };
};

/**
 * API Key authentication middleware
 * For service-to-service communication
 */
const apiKeyAuth = (req, res, next) => {
  try {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
      return res.status(401).json(
        helpers.errorResponse('Access denied. API key required.')
      );
    }

    // Validate API key
    const validApiKeys = [
      process.env.API_GATEWAY_KEY,
      process.env.SUBSCRIPTION_SERVICE_KEY,
      process.env.TELEGRAM_SERVICE_KEY
    ].filter(Boolean);

    if (!validApiKeys.includes(apiKey)) {
      logger.warn('Invalid API key used', {
        apiKey: apiKey.substring(0, 8) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(401).json(
        helpers.errorResponse('Access denied. Invalid API key.')
      );
    }

    // Add service info to request
    req.service = {
      authenticated: true,
      type: 'api_key',
      timestamp: new Date()
    };

    logger.debug('API key authentication successful', {
      ip: req.ip,
      endpoint: req.originalUrl
    });

    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(500).json(
      helpers.errorResponse('Authentication service error.')
    );
  }
};

module.exports = {
  auth,
  optionalAuth,
  requireRole,
  requirePermission,
  requireSubscription,
  apiKeyAuth
};