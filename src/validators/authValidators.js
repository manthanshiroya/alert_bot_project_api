const { body, validationResult } = require('express-validator');
const User = require('../models/User');

// Validation rules for user registration
const validateRegister = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
    .custom(async (email) => {
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        throw new Error('Email is already registered');
      }
      return true;
    }),
    
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match password');
      }
      return true;
    }),
    
  body('telegramUserId')
    .notEmpty()
    .withMessage('Telegram user ID is required')
    .isString()
    .withMessage('Telegram user ID must be a string')
    .isLength({ min: 1, max: 20 })
    .withMessage('Telegram user ID must be between 1 and 20 characters')
    .matches(/^\d+$/)
    .withMessage('Telegram user ID must contain only numbers')
    .custom(async (telegramUserId) => {
      const existingUser = await User.findByTelegramUserId(telegramUserId);
      if (existingUser) {
        throw new Error('This Telegram account is already registered');
      }
      return true;
    }),
    
  body('username')
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
];

// Validation rules for user login
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
    
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Validation rules for refresh token
const validateRefreshToken = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
    .isString()
    .withMessage('Refresh token must be a string')
];

// Validation rules for password reset request
const validatePasswordResetRequest = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
];

// Validation rules for password reset
const validatePasswordReset = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
    
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match password');
      }
      return true;
    })
];

// Validation rules for password change
const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
    
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),
    
  body('confirmNewPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    })
];

// Validation rules for profile update
const validateProfileUpdate = [
  body('username')
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    
  body('profile.firstName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters')
    .matches(/^[a-zA-Z\s]*$/)
    .withMessage('First name can only contain letters and spaces'),
    
  body('profile.lastName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters')
    .matches(/^[a-zA-Z\s]*$/)
    .withMessage('Last name can only contain letters and spaces'),
    
  body('profile.timezone')
    .optional()
    .isString()
    .withMessage('Timezone must be a string'),
    
  body('profile.preferences.notifications.email')
    .optional()
    .isBoolean()
    .withMessage('Email notification preference must be a boolean'),
    
  body('profile.preferences.notifications.telegram')
    .optional()
    .isBoolean()
    .withMessage('Telegram notification preference must be a boolean'),
    
  body('profile.preferences.alertFormat')
    .optional()
    .isIn(['simple', 'detailed', 'custom'])
    .withMessage('Alert format must be one of: simple, detailed, custom')
];

// Validation rules for API key creation
const validateApiKeyCreation = [
  body('name')
    .notEmpty()
    .withMessage('API key name is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('API key name must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9\s_-]+$/)
    .withMessage('API key name can only contain letters, numbers, spaces, underscores, and hyphens'),
    
  body('permissions')
    .isArray({ min: 1 })
    .withMessage('At least one permission is required')
    .custom((permissions) => {
      const validPermissions = ['read', 'write', 'admin'];
      const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
      if (invalidPermissions.length > 0) {
        throw new Error(`Invalid permissions: ${invalidPermissions.join(', ')}`);
      }
      return true;
    })
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// Rate limiting validation for sensitive operations
const validateRateLimit = (req, res, next) => {
  // This will be used with express-rate-limit middleware
  // Additional custom validation can be added here
  next();
};

// Sanitize input data
const sanitizeInput = (req, res, next) => {
  // Remove any potentially harmful characters
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Remove HTML tags and trim whitespace
        req.body[key] = req.body[key].replace(/<[^>]*>/g, '').trim();
      }
    });
  }
  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateRefreshToken,
  validatePasswordResetRequest,
  validatePasswordReset,
  validatePasswordChange,
  validateProfileUpdate,
  validateApiKeyCreation,
  handleValidationErrors,
  validateRateLimit,
  sanitizeInput
};