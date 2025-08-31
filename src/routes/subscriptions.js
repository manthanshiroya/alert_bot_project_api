const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticateToken } = require('../middleware/auth');
const { body } = require('express-validator');

// Validation middleware for onboarding subscription request
const validateOnboardingSubscriptionRequest = [
  body('planId')
    .isMongoId()
    .withMessage('Valid plan ID is required'),
  body('amount')
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Valid amount is required'),
  body('planName')
    .notEmpty()
    .trim()
    .withMessage('Plan name is required')
];

// Validation middleware for subscription request (legacy)
const validateSubscriptionRequest = [
  body('subscriptionPlanId')
    .isMongoId()
    .withMessage('Valid subscription plan ID is required'),
  body('payment.transactionId')
    .notEmpty()
    .trim()
    .withMessage('Transaction ID is required'),
  body('payment.amount')
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Valid payment amount is required'),
  body('payment.method')
    .optional()
    .isIn(['UPI', 'bank_transfer', 'other'])
    .withMessage('Invalid payment method'),
  body('payment.proofUrl')
    .optional()
    .isURL()
    .withMessage('Valid proof URL is required')
];

// Validation middleware for subscription update
const validateSubscriptionUpdate = [
  body('subscriptionId')
    .isMongoId()
    .withMessage('Valid subscription ID is required'),
  body('autoRenew')
    .optional()
    .isBoolean()
    .withMessage('Auto renew must be a boolean value')
];

// Validation middleware for subscription cancellation
const validateSubscriptionCancel = [
  body('subscriptionId')
    .isMongoId()
    .withMessage('Valid subscription ID is required')
];

// Subscription routes
router.get('/plans', subscriptionController.getPlans);
router.get('/plans/:planId', subscriptionController.getPlan);
router.post('/request', authenticateToken, validateOnboardingSubscriptionRequest, subscriptionController.createSubscriptionRequest);
router.post('/subscribe', authenticateToken, validateSubscriptionRequest, subscriptionController.subscribe);
router.post('/cancel', authenticateToken, validateSubscriptionCancel, subscriptionController.cancelSubscription);
router.put('/update', authenticateToken, validateSubscriptionUpdate, subscriptionController.updateSubscription);
router.get('/status', authenticateToken, subscriptionController.getSubscriptionStatus);
router.get('/billing-history', authenticateToken, subscriptionController.getBillingHistory);

module.exports = router;