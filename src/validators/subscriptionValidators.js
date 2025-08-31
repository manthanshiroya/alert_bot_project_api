const { body, param } = require('express-validator');

/**
 * Validation for subscription approval
 */
const validateSubscriptionApproval = [
  param('subscriptionId')
    .notEmpty()
    .withMessage('Subscription ID is required')
    .isMongoId()
    .withMessage('Invalid subscription ID format'),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  body('notes')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be a string with maximum 500 characters')
];

/**
 * Validation for subscription rejection
 */
const validateSubscriptionRejection = [
  param('subscriptionId')
    .notEmpty()
    .withMessage('Subscription ID is required')
    .isMongoId()
    .withMessage('Invalid subscription ID format'),
  body('reason')
    .notEmpty()
    .withMessage('Rejection reason is required')
    .isString()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Rejection reason must be between 10 and 500 characters')
];

module.exports = {
  validateSubscriptionApproval,
  validateSubscriptionRejection
};