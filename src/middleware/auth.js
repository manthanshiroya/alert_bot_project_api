const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminUser = require('../models/AdminUser');
const logger = require('../utils/logger');

// Middleware to authenticate JWT tokens
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Access token has expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      return res.status(401).json({
        success: false,
        message: 'Invalid access token'
      });
    }
    
    // Check if token type is access
    if (decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type'
      });
    }
    
    // Check if user still exists and is active
    let user;
    if (decoded.role === 'admin') {
      user = await AdminUser.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Admin user not found'
        });
      }

      if (user.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Admin account is deactivated'
        });
      }

      // Check if account is locked
      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          message: 'Admin account is temporarily locked'
        });
      }

      // Attach admin user info to request
      req.user = {
        userId: user._id,
        email: user.email,
        username: user.username,
        role: 'admin',
        permissions: user.permissions
      };
    } else {
      user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      // Check if account is locked
      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          message: 'Account is temporarily locked'
        });
      }

      // Attach user info to request
      req.user = {
        userId: user._id,
        email: user.email,
        role: user.role,
        subscription: user.subscription
      };
    }
    
    next();
    
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication'
    });
  }
};

// Middleware to check if user has required role
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    
    next();
  };
};

// Middleware to check if user has active subscription
const requireActiveSubscription = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (!user.hasActiveSubscription()) {
      return res.status(403).json({
        success: false,
        message: 'Active subscription required',
        code: 'SUBSCRIPTION_REQUIRED'
      });
    }
    
    next();
    
  } catch (error) {
    logger.error('Subscription check middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during subscription check'
    });
  }
};

// Middleware to check subscription plan level
const requireSubscriptionPlan = (requiredPlans) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      const allowedPlans = Array.isArray(requiredPlans) ? requiredPlans : [requiredPlans];
      const userPlan = user.subscription.plan;
      
      if (!allowedPlans.includes(userPlan)) {
        return res.status(403).json({
          success: false,
          message: `${requiredPlans} subscription plan required`,
          code: 'PLAN_UPGRADE_REQUIRED',
          currentPlan: userPlan,
          requiredPlans: allowedPlans
        });
      }
      
      next();
      
    } catch (error) {
      logger.error('Subscription plan check middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during plan check'
      });
    }
  };
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return next(); // Continue without authentication
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded.type === 'access') {
        const user = await User.findById(decoded.userId);
        if (user && user.isActive && !user.isLocked) {
          req.user = {
            userId: user._id,
            email: user.email,
            role: user.role,
            subscription: user.subscription
          };
        }
      }
    } catch (error) {
      // Ignore token errors for optional auth
      logger.debug('Optional auth token error:', error.message);
    }
    
    next();
    
  } catch (error) {
    logger.error('Optional auth middleware error:', error);
    next(); // Continue even if there's an error
  }
};

// API Key authentication middleware
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key is required'
      });
    }
    
    // Find user with this API key
    const user = await User.findOne({
      'apiKeys.key': apiKey,
      'apiKeys.isActive': true
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }
    
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }
    
    // Find the specific API key
    const apiKeyObj = user.apiKeys.find(key => key.key === apiKey && key.isActive);
    if (!apiKeyObj) {
      return res.status(401).json({
        success: false,
        message: 'API key is inactive'
      });
    }
    
    // Update last used timestamp
    apiKeyObj.lastUsed = new Date();
    await user.save();
    
    // Attach user and API key info to request
    req.user = {
      userId: user._id,
      email: user.email,
      role: user.role,
      subscription: user.subscription
    };
    
    req.apiKey = {
      name: apiKeyObj.name,
      permissions: apiKeyObj.permissions
    };
    
    next();
    
  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during API key authentication'
    });
  }
};

// Check API key permissions
const requireApiPermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key authentication required'
      });
    }
    
    if (!req.apiKey.permissions.includes(permission) && !req.apiKey.permissions.includes('admin')) {
      return res.status(403).json({
        success: false,
        message: `API key requires '${permission}' permission`
      });
    }
    
    next();
  };
};

// Convenience middleware for admin role
const requireAdmin = requireRole('admin');

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireActiveSubscription,
  requireSubscriptionPlan,
  optionalAuth,
  authenticateApiKey,
  requireApiPermission
};