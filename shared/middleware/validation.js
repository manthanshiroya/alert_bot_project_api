const Joi = require('joi');
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

class ValidationMiddleware {
  // Generic validation middleware
  static validate(schema, options = {}) {
    return (req, res, next) => {
      try {
        const { body = true, query = false, params = false } = options;
        const validationData = {};

        // Collect data to validate
        if (body && req.body) {
          validationData.body = req.body;
        }
        if (query && req.query) {
          validationData.query = req.query;
        }
        if (params && req.params) {
          validationData.params = req.params;
        }

        // Validate data
        const { error, value } = schema.validate(validationData, {
          abortEarly: false,
          stripUnknown: true,
          allowUnknown: false
        });

        if (error) {
          const validationErrors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }));

          logger.logError(new Error('Validation failed'), {
            middleware: 'validate',
            endpoint: req.path,
            method: req.method,
            errors: validationErrors,
            userId: req.user?.id
          });

          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: validationErrors
          });
        }

        // Replace request data with validated data
        if (body && value.body) {
          req.body = value.body;
        }
        if (query && value.query) {
          req.query = value.query;
        }
        if (params && value.params) {
          req.params = value.params;
        }

        next();
      } catch (error) {
        logger.logError(error, {
          middleware: 'validate',
          endpoint: req.path,
          method: req.method
        });

        return res.status(500).json({
          success: false,
          error: 'Validation error',
          code: 'VALIDATION_SYSTEM_ERROR'
        });
      }
    };
  }

  // Sanitize input data
  static sanitize() {
    return (req, res, next) => {
      try {
        // Sanitize body
        if (req.body && typeof req.body === 'object') {
          req.body = this._sanitizeObject(req.body);
        }

        // Sanitize query
        if (req.query && typeof req.query === 'object') {
          req.query = this._sanitizeObject(req.query);
        }

        // Sanitize params
        if (req.params && typeof req.params === 'object') {
          req.params = this._sanitizeObject(req.params);
        }

        next();
      } catch (error) {
        logger.logError(error, {
          middleware: 'sanitize',
          endpoint: req.path,
          method: req.method
        });

        next(); // Don't block on sanitization errors
      }
    };
  }

  // Private method to sanitize object
  static _sanitizeObject(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => 
        typeof item === 'object' ? this._sanitizeObject(item) : 
        typeof item === 'string' ? Helpers.sanitizeInput(item) : item
      );
    }

    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          sanitized[key] = Helpers.sanitizeInput(value);
        } else if (typeof value === 'object') {
          sanitized[key] = this._sanitizeObject(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }

    return obj;
  }

  // Common validation schemas
  static get schemas() {
    return {
      // User registration
      userRegistration: Joi.object({
        body: Joi.object({
          telegramId: Joi.string().required().custom((value, helpers) => {
            if (!Helpers.isValidTelegramId(value)) {
              return helpers.error('any.invalid');
            }
            return value;
          }),
          email: Joi.string().email().optional(),
          firstName: Joi.string().min(1).max(50).required(),
          lastName: Joi.string().min(1).max(50).optional(),
          username: Joi.string().min(3).max(30).optional(),
          subscriptionPlan: Joi.string().valid('free', 'premium', 'pro').default('free')
        })
      }),

      // User login
      userLogin: Joi.object({
        body: Joi.object({
          telegramId: Joi.string().required().custom((value, helpers) => {
            if (!Helpers.isValidTelegramId(value)) {
              return helpers.error('any.invalid');
            }
            return value;
          })
        })
      }),

      // Alert condition creation
      alertCondition: Joi.object({
        body: Joi.object({
          symbol: Joi.string().required().custom((value, helpers) => {
            if (!Helpers.isValidSymbol(value)) {
              return helpers.error('any.invalid');
            }
            return value;
          }),
          timeframe: Joi.string().required().custom((value, helpers) => {
            if (!Helpers.isValidTimeframe(value)) {
              return helpers.error('any.invalid');
            }
            return value;
          }),
          condition: Joi.string().valid(
            'price_above', 'price_below', 'price_change_percent',
            'volume_above', 'rsi_above', 'rsi_below',
            'macd_bullish', 'macd_bearish', 'custom'
          ).required(),
          value: Joi.number().required(),
          message: Joi.string().max(500).optional(),
          isActive: Joi.boolean().default(true),
          expiresAt: Joi.date().greater('now').optional()
        })
      }),

      // Chart creation
      chartCreation: Joi.object({
        body: Joi.object({
          name: Joi.string().min(1).max(100).required(),
          symbol: Joi.string().required().custom((value, helpers) => {
            if (!Helpers.isValidSymbol(value)) {
              return helpers.error('any.invalid');
            }
            return value;
          }),
          timeframe: Joi.string().required().custom((value, helpers) => {
            if (!Helpers.isValidTimeframe(value)) {
              return helpers.error('any.invalid');
            }
            return value;
          }),
          description: Joi.string().max(500).optional(),
          isPublic: Joi.boolean().default(false),
          settings: Joi.object({
            indicators: Joi.array().items(Joi.string()).optional(),
            overlays: Joi.array().items(Joi.string()).optional(),
            theme: Joi.string().valid('light', 'dark').default('dark')
          }).optional()
        })
      }),

      // Webhook data
      webhookData: Joi.object({
        body: Joi.object({
          symbol: Joi.string().required(),
          price: Joi.number().positive().required(),
          volume: Joi.number().positive().optional(),
          timestamp: Joi.date().optional(),
          indicators: Joi.object().optional(),
          action: Joi.string().valid('buy', 'sell', 'alert').optional(),
          message: Joi.string().max(1000).optional()
        })
      }),

      // Subscription update
      subscriptionUpdate: Joi.object({
        body: Joi.object({
          plan: Joi.string().valid('free', 'premium', 'pro').required(),
          paymentMethod: Joi.string().valid('stripe', 'paypal', 'crypto').optional(),
          billingCycle: Joi.string().valid('monthly', 'yearly').optional()
        })
      }),

      // Admin user creation
      adminUserCreation: Joi.object({
        body: Joi.object({
          email: Joi.string().email().required(),
          password: Joi.string().min(8).required().custom((value, helpers) => {
            if (!Helpers.isValidPassword(value)) {
              return helpers.error('any.invalid');
            }
            return value;
          }),
          role: Joi.string().valid('admin', 'moderator').required(),
          firstName: Joi.string().min(1).max(50).required(),
          lastName: Joi.string().min(1).max(50).required(),
          permissions: Joi.array().items(Joi.string()).optional()
        })
      }),

      // Pagination
      pagination: Joi.object({
        query: Joi.object({
          page: Joi.number().integer().min(1).default(1),
          limit: Joi.number().integer().min(1).max(100).default(20),
          sort: Joi.string().optional(),
          order: Joi.string().valid('asc', 'desc').default('desc')
        })
      }),

      // Object ID parameter
      objectId: Joi.object({
        params: Joi.object({
          id: Joi.string().required().custom((value, helpers) => {
            if (!Helpers.isValidObjectId(value)) {
              return helpers.error('any.invalid');
            }
            return value;
          })
        })
      }),

      // Search query
      searchQuery: Joi.object({
        query: Joi.object({
          q: Joi.string().min(1).max(100).required(),
          type: Joi.string().valid('users', 'charts', 'alerts').optional(),
          filters: Joi.object().optional()
        })
      }),

      // Date range
      dateRange: Joi.object({
        query: Joi.object({
          startDate: Joi.date().optional(),
          endDate: Joi.date().greater(Joi.ref('startDate')).optional(),
          period: Joi.string().valid('1h', '1d', '1w', '1m', '3m', '6m', '1y').optional()
        })
      })
    };
  }

  // Specific validation methods
  static validateUserRegistration() {
    return this.validate(this.schemas.userRegistration);
  }

  static validateUserLogin() {
    return this.validate(this.schemas.userLogin);
  }

  static validateAlertCondition() {
    return this.validate(this.schemas.alertCondition);
  }

  static validateChartCreation() {
    return this.validate(this.schemas.chartCreation);
  }

  static validateWebhookData() {
    return this.validate(this.schemas.webhookData);
  }

  static validateSubscriptionUpdate() {
    return this.validate(this.schemas.subscriptionUpdate);
  }

  static validateAdminUserCreation() {
    return this.validate(this.schemas.adminUserCreation);
  }

  static validatePagination() {
    return this.validate(this.schemas.pagination, { query: true });
  }

  static validateObjectId() {
    return this.validate(this.schemas.objectId, { params: true });
  }

  static validateSearchQuery() {
    return this.validate(this.schemas.searchQuery, { query: true });
  }

  static validateDateRange() {
    return this.validate(this.schemas.dateRange, { query: true });
  }

  // File upload validation
  static validateFileUpload(options = {}) {
    const {
      maxSize = 5 * 1024 * 1024, // 5MB
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif'],
      required = false
    } = options;

    return (req, res, next) => {
      try {
        if (!req.file && !req.files) {
          if (required) {
            return res.status(400).json({
              success: false,
              error: 'File is required',
              code: 'FILE_REQUIRED'
            });
          }
          return next();
        }

        const files = req.files || [req.file];
        
        for (const file of files) {
          if (!file) continue;

          // Check file size
          if (file.size > maxSize) {
            return res.status(400).json({
              success: false,
              error: `File size exceeds ${maxSize} bytes`,
              code: 'FILE_TOO_LARGE'
            });
          }

          // Check file type
          if (!allowedTypes.includes(file.mimetype)) {
            return res.status(400).json({
              success: false,
              error: `File type ${file.mimetype} not allowed`,
              code: 'FILE_TYPE_NOT_ALLOWED',
              allowedTypes
            });
          }
        }

        next();
      } catch (error) {
        logger.logError(error, {
          middleware: 'validateFileUpload',
          endpoint: req.path,
          method: req.method
        });

        return res.status(500).json({
          success: false,
          error: 'File validation error',
          code: 'FILE_VALIDATION_ERROR'
        });
      }
    };
  }

  // Custom validation for specific business rules
  static validateBusinessRules() {
    return (req, res, next) => {
      try {
        const user = req.user;
        const endpoint = req.path;
        const method = req.method;

        // Check subscription limits
        if (user && endpoint.includes('/alerts') && method === 'POST') {
          const maxAlerts = {
            free: 5,
            premium: 50,
            pro: 500
          };

          const userMaxAlerts = maxAlerts[user.subscriptionPlan] || maxAlerts.free;
          
          // This would need to be checked against database
          // For now, we'll attach the limit to the request
          req.subscriptionLimits = {
            maxAlerts: userMaxAlerts,
            plan: user.subscriptionPlan
          };
        }

        // Check rate limits based on subscription
        if (user) {
          const rateLimits = {
            free: { requests: 100, window: 3600000 }, // 100 per hour
            premium: { requests: 1000, window: 3600000 }, // 1000 per hour
            pro: { requests: 10000, window: 3600000 } // 10000 per hour
          };

          req.rateLimits = rateLimits[user.subscriptionPlan] || rateLimits.free;
        }

        next();
      } catch (error) {
        logger.logError(error, {
          middleware: 'validateBusinessRules',
          endpoint: req.path,
          method: req.method
        });

        next(); // Don't block on business rule validation errors
      }
    };
  }
}

module.exports = ValidationMiddleware;