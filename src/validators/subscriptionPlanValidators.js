const { body } = require('express-validator');

const validateSubscriptionPlan = [
  body('name')
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage('Name must be between 3 and 50 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('duration')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Duration must be at least 1 day'),
  body('features')
    .optional()
    .isArray()
    .withMessage('Features must be an array'),
  body('features.*')
    .optional()
    .isString()
    .withMessage('Each feature must be a string'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('Must be a boolean value')
];

module.exports = {
  validateSubscriptionPlan
};