const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');

/**
 * Validation for creating payment request
 */
const validatePaymentRequest = [
  body('subscriptionPlanId')
    .notEmpty()
    .withMessage('Subscription plan ID is required')
    .isMongoId()
    .withMessage('Invalid subscription plan ID format'),
];

/**
 * Validation for payment proof upload
 */
const validatePaymentProofUpload = [
  param('paymentId')
    .notEmpty()
    .withMessage('Payment ID is required')
    .isMongoId()
    .withMessage('Invalid payment ID format'),
];

/**
 * Validation for getting payment details
 */
const validateGetPayment = [
  param('paymentId')
    .notEmpty()
    .withMessage('Payment ID is required')
    .isMongoId()
    .withMessage('Invalid payment ID format'),
];

/**
 * Validation for getting user payments
 */
const validateGetUserPayments = [
  query('status')
    .optional()
    .isIn(['initiated', 'pending', 'approved', 'rejected', 'expired'])
    .withMessage('Invalid payment status'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];

/**
 * Validation for payment approval
 */
const validatePaymentApproval = [
  param('paymentId')
    .notEmpty()
    .withMessage('Payment ID is required')
    .isMongoId()
    .withMessage('Invalid payment ID format'),
  body('notes')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be a string with maximum 500 characters'),
];

/**
 * Validation for payment rejection
 */
const validatePaymentRejection = [
  param('paymentId')
    .notEmpty()
    .withMessage('Payment ID is required')
    .isMongoId()
    .withMessage('Invalid payment ID format'),
  body('reason')
    .notEmpty()
    .withMessage('Rejection reason is required')
    .isString()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Rejection reason must be between 5 and 200 characters'),
  body('notes')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be a string with maximum 500 characters'),
];

/**
 * Validation for transaction ID lookup
 */
const validateTransactionLookup = [
  param('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .isString()
    .trim()
    .matches(/^TXN[0-9A-F]+$/)
    .withMessage('Invalid transaction ID format'),
];

/**
 * Validation for payment statistics query
 */
const validatePaymentStatsQuery = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('status')
    .optional()
    .isIn(['initiated', 'pending', 'approved', 'rejected', 'expired'])
    .withMessage('Invalid payment status'),
  query('method')
    .optional()
    .isIn(['UPI', 'bank_transfer', 'net_banking', 'card', 'other'])
    .withMessage('Invalid payment method'),
];

/**
 * Validation for bulk payment operations
 */
const validateBulkPaymentOperation = [
  body('paymentIds')
    .isArray({ min: 1, max: 50 })
    .withMessage('Payment IDs must be an array with 1-50 items')
    .custom((paymentIds) => {
      for (const id of paymentIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new Error('All payment IDs must be valid MongoDB ObjectIds');
        }
      }
      return true;
    }),
  body('action')
    .notEmpty()
    .withMessage('Action is required')
    .isIn(['approve', 'reject', 'expire'])
    .withMessage('Invalid action. Must be approve, reject, or expire'),
  body('reason')
    .if(body('action').equals('reject'))
    .notEmpty()
    .withMessage('Rejection reason is required when rejecting payments')
    .isString()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Rejection reason must be between 5 and 200 characters'),
  body('notes')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be a string with maximum 500 characters'),
];

/**
 * Validation for payment method configuration
 */
const validatePaymentMethodConfig = [
  body('method')
    .notEmpty()
    .withMessage('Payment method is required')
    .isIn(['UPI', 'bank_transfer', 'net_banking', 'card'])
    .withMessage('Invalid payment method'),
  body('config')
    .notEmpty()
    .withMessage('Payment method configuration is required')
    .isObject()
    .withMessage('Configuration must be an object'),
  body('config.enabled')
    .isBoolean()
    .withMessage('Enabled flag must be a boolean'),
  
  // UPI specific validations
  body('config.vpa')
    .if(body('method').equals('UPI'))
    .notEmpty()
    .withMessage('UPI VPA is required for UPI method')
    .matches(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/)
    .withMessage('Invalid UPI VPA format'),
  body('config.merchantName')
    .if(body('method').equals('UPI'))
    .notEmpty()
    .withMessage('Merchant name is required for UPI method')
    .isLength({ min: 2, max: 50 })
    .withMessage('Merchant name must be between 2 and 50 characters'),
  body('config.merchantCode')
    .if(body('method').equals('UPI'))
    .optional()
    .isLength({ min: 2, max: 20 })
    .withMessage('Merchant code must be between 2 and 20 characters'),
  
  // Bank transfer specific validations
  body('config.accountNumber')
    .if(body('method').equals('bank_transfer'))
    .notEmpty()
    .withMessage('Account number is required for bank transfer')
    .isNumeric()
    .withMessage('Account number must be numeric')
    .isLength({ min: 8, max: 20 })
    .withMessage('Account number must be between 8 and 20 digits'),
  body('config.ifscCode')
    .if(body('method').equals('bank_transfer'))
    .notEmpty()
    .withMessage('IFSC code is required for bank transfer')
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .withMessage('Invalid IFSC code format'),
  body('config.accountHolderName')
    .if(body('method').equals('bank_transfer'))
    .notEmpty()
    .withMessage('Account holder name is required for bank transfer')
    .isLength({ min: 2, max: 100 })
    .withMessage('Account holder name must be between 2 and 100 characters'),
  body('config.bankName')
    .if(body('method').equals('bank_transfer'))
    .notEmpty()
    .withMessage('Bank name is required for bank transfer')
    .isLength({ min: 2, max: 100 })
    .withMessage('Bank name must be between 2 and 100 characters'),
];

/**
 * Validation for payment webhook
 */
const validatePaymentWebhook = [
  body('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required')
    .isString()
    .trim(),
  body('status')
    .notEmpty()
    .withMessage('Payment status is required')
    .isIn(['success', 'failed', 'pending'])
    .withMessage('Invalid payment status'),
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isNumeric()
    .withMessage('Amount must be numeric')
    .custom((value) => {
      if (parseFloat(value) <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      return true;
    }),
  body('currency')
    .optional()
    .isIn(['INR', 'USD', 'EUR'])
    .withMessage('Invalid currency'),
  body('paymentMethod')
    .optional()
    .isIn(['UPI', 'bank_transfer', 'net_banking', 'card', 'wallet'])
    .withMessage('Invalid payment method'),
  body('gatewayTransactionId')
    .optional()
    .isString()
    .trim(),
  body('gatewayResponse')
    .optional()
    .isObject()
    .withMessage('Gateway response must be an object'),
  body('timestamp')
    .notEmpty()
    .withMessage('Timestamp is required')
    .isISO8601()
    .withMessage('Timestamp must be a valid ISO 8601 date'),
];

module.exports = {
  validatePaymentRequest,
  validatePaymentProofUpload,
  validateGetPayment,
  validateGetUserPayments,
  validatePaymentApproval,
  validatePaymentRejection,
  validateTransactionLookup,
  validatePaymentStatsQuery,
  validateBulkPaymentOperation,
  validatePaymentMethodConfig,
  validatePaymentWebhook
};