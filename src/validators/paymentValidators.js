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

module.exports = {
  validatePaymentRequest,
  validatePaymentProofUpload,
  validateGetPayment,
  validateGetUserPayments,
  validatePaymentApproval,
  validatePaymentRejection
};