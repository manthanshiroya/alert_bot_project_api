const { body, param, query, validationResult } = require('express-validator');
const { helpers } = require('../utils');
const { logger } = require('../utils');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value,
      location: error.location
    }));

    logger.warn('Validation failed', {
      endpoint: req.originalUrl,
      method: req.method,
      errors: errorDetails,
      userId: req.user?.id
    });

    return res.status(400).json(
      helpers.errorResponse('Validation failed', errorDetails)
    );
  }
  
  next();
};

/**
 * Alert validation rules
 */
const alertValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Alert name must be between 1 and 100 characters')
      .matches(/^[a-zA-Z0-9\s\-_.,!?()]+$/)
      .withMessage('Alert name contains invalid characters'),
    
    body('type')
      .isIn(['price', 'volume', 'technical', 'news', 'custom'])
      .withMessage('Invalid alert type'),
    
    body('symbol')
      .trim()
      .isLength({ min: 1, max: 20 })
      .withMessage('Symbol must be between 1 and 20 characters')
      .matches(/^[A-Z0-9]+$/)
      .withMessage('Symbol must contain only uppercase letters and numbers'),
    
    body('exchange')
      .optional()
      .isIn(['BINANCE', 'COINBASE', 'COINGECKO'])
      .withMessage('Invalid exchange'),
    
    body('interval')
      .optional()
      .isIn(['1m', '5m', '15m', '30m', '1h', '4h', '1d'])
      .withMessage('Invalid interval'),
    
    body('conditions')
      .isArray({ min: 1, max: 5 })
      .withMessage('Must provide 1-5 conditions'),
    
    body('conditions.*.field')
      .isIn(['price', 'volume', 'priceChange', 'priceChangePercent', 'high', 'low', 'marketCap', 'sma', 'ema', 'rsi', 'macd', 'bollinger', 'custom'])
      .withMessage('Invalid condition field'),
    
    body('conditions.*.operator')
      .isIn(['>', '<', '>=', '<=', '==', '!=', 'between', 'crosses_above', 'crosses_below'])
      .withMessage('Invalid condition operator'),
    
    body('conditions.*.value')
      .custom((value, { req, path }) => {
        const conditionIndex = path.split('[')[1].split(']')[0];
        const operator = req.body.conditions[conditionIndex].operator;
        
        if (operator === 'between') {
          if (!Array.isArray(value) || value.length !== 2) {
            throw new Error('Between operator requires array of 2 values');
          }
          if (!value.every(v => typeof v === 'number' && !isNaN(v))) {
            throw new Error('Between values must be numbers');
          }
          if (value[0] >= value[1]) {
            throw new Error('First value must be less than second value');
          }
        } else {
          if (typeof value !== 'number' || isNaN(value)) {
            throw new Error('Condition value must be a number');
          }
        }
        return true;
      }),
    
    body('logicalOperator')
      .optional()
      .isIn(['AND', 'OR'])
      .withMessage('Logical operator must be AND or OR'),
    
    body('technicalIndicator')
      .optional()
      .isObject()
      .withMessage('Technical indicator must be an object'),
    
    body('technicalIndicator.type')
      .optional()
      .isIn(['sma', 'ema', 'rsi', 'macd', 'bollinger', 'stochastic', 'williams', 'atr', 'adx', 'obv', 'vwap'])
      .withMessage('Invalid technical indicator type'),
    
    body('technicalIndicator.period')
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage('Technical indicator period must be between 1 and 200'),
    
    body('customScript')
      .optional()
      .isLength({ max: 5000 })
      .withMessage('Custom script must not exceed 5000 characters'),
    
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'critical'])
      .withMessage('Invalid priority level'),
    
    body('frequency')
      .optional()
      .isIn(['once', 'recurring'])
      .withMessage('Frequency must be once or recurring'),
    
    body('maxTriggers')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Max triggers must be between 1 and 1000'),
    
    body('cooldownPeriod')
      .optional()
      .isInt({ min: 60, max: 86400 })
      .withMessage('Cooldown period must be between 60 seconds and 24 hours'),
    
    body('expiresAt')
      .optional()
      .isISO8601()
      .withMessage('Expiration date must be a valid ISO 8601 date')
      .custom((value) => {
        const expirationDate = new Date(value);
        const now = new Date();
        const maxExpiration = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year
        
        if (expirationDate <= now) {
          throw new Error('Expiration date must be in the future');
        }
        if (expirationDate > maxExpiration) {
          throw new Error('Expiration date cannot be more than 1 year in the future');
        }
        return true;
      }),
    
    body('notificationChannels')
      .optional()
      .isObject()
      .withMessage('Notification channels must be an object'),
    
    body('notificationChannels.telegram')
      .optional()
      .isBoolean()
      .withMessage('Telegram notification must be boolean'),
    
    body('notificationChannels.webhook')
      .optional()
      .isObject()
      .withMessage('Webhook notification must be an object'),
    
    body('notificationChannels.webhook.enabled')
      .optional()
      .isBoolean()
      .withMessage('Webhook enabled must be boolean'),
    
    body('notificationChannels.webhook.url')
      .optional()
      .isURL()
      .withMessage('Webhook URL must be valid'),
    
    body('notificationChannels.email')
      .optional()
      .isBoolean()
      .withMessage('Email notification must be boolean'),
    
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
    
    body('metadata.tags')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Maximum 10 tags allowed'),
    
    body('metadata.tags.*')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Each tag must be between 1 and 50 characters'),
    
    body('metadata.category')
      .optional()
      .isIn(['trading', 'investment', 'research', 'portfolio', 'news'])
      .withMessage('Invalid category'),
    
    body('metadata.riskLevel')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('Invalid risk level'),
    
    handleValidationErrors
  ],
  
  update: [
    param('id')
      .isMongoId()
      .withMessage('Invalid alert ID'),
    
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Alert name must be between 1 and 100 characters'),
    
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be boolean'),
    
    body('isPaused')
      .optional()
      .isBoolean()
      .withMessage('isPaused must be boolean'),
    
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'critical'])
      .withMessage('Invalid priority level'),
    
    body('cooldownPeriod')
      .optional()
      .isInt({ min: 60, max: 86400 })
      .withMessage('Cooldown period must be between 60 seconds and 24 hours'),
    
    body('maxTriggers')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Max triggers must be between 1 and 1000'),
    
    handleValidationErrors
  ],
  
  bulkAction: [
    body('action')
      .isIn(['pause', 'resume', 'activate', 'deactivate', 'delete'])
      .withMessage('Invalid bulk action'),
    
    body('alertIds')
      .isArray({ min: 1, max: 50 })
      .withMessage('Must provide 1-50 alert IDs'),
    
    body('alertIds.*')
      .isMongoId()
      .withMessage('Invalid alert ID'),
    
    handleValidationErrors
  ]
};

/**
 * Market data validation rules
 */
const marketValidation = {
  symbol: [
    param('symbol')
      .trim()
      .isLength({ min: 1, max: 20 })
      .withMessage('Symbol must be between 1 and 20 characters')
      .matches(/^[A-Z0-9]+$/)
      .withMessage('Symbol must contain only uppercase letters and numbers'),
    
    handleValidationErrors
  ],
  
  batch: [
    query('symbols')
      .notEmpty()
      .withMessage('Symbols parameter is required')
      .custom((value) => {
        const symbols = value.split(',');
        if (symbols.length > 20) {
          throw new Error('Maximum 20 symbols allowed');
        }
        if (symbols.some(s => !s.trim() || !/^[A-Z0-9]+$/.test(s.trim()))) {
          throw new Error('All symbols must be valid');
        }
        return true;
      }),
    
    handleValidationErrors
  ]
};

/**
 * Common validation rules
 */
const commonValidation = {
  mongoId: [
    param('id')
      .isMongoId()
      .withMessage('Invalid ID format'),
    
    handleValidationErrors
  ],
  
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Page must be between 1 and 1000'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'updatedAt', 'name', 'priority', 'lastTriggered'])
      .withMessage('Invalid sort field'),
    
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc'),
    
    handleValidationErrors
  ],
  
  search: [
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search term must be between 1 and 100 characters')
      .matches(/^[a-zA-Z0-9\s\-_.,!?()]+$/)
      .withMessage('Search term contains invalid characters'),
    
    handleValidationErrors
  ]
};

/**
 * Custom validation functions
 */
const customValidators = {
  /**
   * Validate alert ownership
   */
  validateAlertOwnership: async (req, res, next) => {
    try {
      const { Alert } = require('../models');
      const alertId = req.params.id;
      const userId = req.user.id;
      
      const alert = await Alert.findById(alertId);
      
      if (!alert) {
        return res.status(404).json(
          helpers.errorResponse('Alert not found')
        );
      }
      
      if (alert.userId.toString() !== userId) {
        return res.status(403).json(
          helpers.errorResponse('Access denied. You can only access your own alerts.')
        );
      }
      
      req.alert = alert;
      next();
    } catch (error) {
      logger.error('Alert ownership validation error:', error);
      res.status(500).json(
        helpers.errorResponse('Validation error')
      );
    }
  },
  
  /**
   * Validate user alert limits based on subscription
   */
  validateAlertLimits: async (req, res, next) => {
    try {
      const { Alert } = require('../models');
      const userId = req.user.id;
      const subscriptionPlan = req.user.subscriptionPlan || 'free';
      
      // Define limits per subscription plan
      const limits = {
        free: 5,
        basic: 25,
        pro: 100,
        premium: 500
      };
      
      const userAlertCount = await Alert.countDocuments({ 
        userId, 
        isActive: true 
      });
      
      const limit = limits[subscriptionPlan] || limits.free;
      
      if (userAlertCount >= limit) {
        return res.status(403).json(
          helpers.errorResponse(
            `Alert limit reached. Your ${subscriptionPlan} plan allows ${limit} active alerts.`
          )
        );
      }
      
      next();
    } catch (error) {
      logger.error('Alert limits validation error:', error);
      res.status(500).json(
        helpers.errorResponse('Validation error')
      );
    }
  },
  
  /**
   * Validate symbol exists in supported exchanges
   */
  validateSymbol: async (req, res, next) => {
    try {
      const { DataSourceManager } = require('../services');
      const symbol = req.params.symbol || req.body.symbol;
      const exchange = req.query.exchange || req.body.exchange || 'BINANCE';
      
      const dataSourceManager = new DataSourceManager();
      const supportedSymbols = await dataSourceManager.getSupportedSymbols(exchange);
      
      if (!supportedSymbols.includes(symbol.toUpperCase())) {
        return res.status(400).json(
          helpers.errorResponse(`Symbol ${symbol} is not supported on ${exchange}`)
        );
      }
      
      next();
    } catch (error) {
      logger.warn('Symbol validation error:', error);
      // Continue without validation if service is unavailable
      next();
    }
  },
  
  /**
   * Sanitize input data
   */
  sanitizeInput: (req, res, next) => {
    // Remove any potential XSS or injection attempts
    const sanitizeObject = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          // Remove script tags and other dangerous content
          obj[key] = obj[key]
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<[^>]*>/g, '')
            .trim();
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      }
    };
    
    if (req.body && typeof req.body === 'object') {
      sanitizeObject(req.body);
    }
    
    if (req.query && typeof req.query === 'object') {
      sanitizeObject(req.query);
    }
    
    next();
  }
};

module.exports = {
  handleValidationErrors,
  alertValidation,
  marketValidation,
  commonValidation,
  customValidators
};