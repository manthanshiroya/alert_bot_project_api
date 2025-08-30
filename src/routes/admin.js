const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken } = require('../middleware/auth');
const { body } = require('express-validator');

// Validation middleware for user updates
const validateUserUpdate = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Valid email is required'),
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'banned'])
    .withMessage('Invalid status value'),
  body('profile.name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters')
];

// Validation middleware for subscription approval
const validateSubscriptionApproval = [
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Valid start date is required'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

// Validation middleware for subscription rejection
const validateSubscriptionRejection = [
  body('reason')
    .notEmpty()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Rejection reason must be between 10 and 500 characters')
];

// Validation middleware for payment approval
const validatePaymentApproval = [
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

// Validation middleware for payment rejection
const validatePaymentRejection = [
  body('reason')
    .notEmpty()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Rejection reason must be between 10 and 500 characters')
];

// Validation middleware for UPI config update
const validateUPIConfig = [
  body('merchantName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Merchant name must be between 1 and 100 characters'),
  body('merchantCode')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Merchant code must be between 1 and 20 characters'),
  body('vpa')
    .optional()
    .trim()
    .matches(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/)
    .withMessage('Valid UPI VPA is required')
];

// Validation middleware for subscription plan creation/update
const validateSubscriptionPlan = [
  body('name')
    .notEmpty()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Plan name is required and must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('price')
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Valid price is required'),
  body('duration')
    .isInt({ min: 1 })
    .withMessage('Duration must be a positive integer'),
  body('durationType')
    .isIn(['days', 'months', 'years'])
    .withMessage('Duration type must be days, months, or years'),
  body('features')
    .isArray()
    .withMessage('Features must be an array'),
  body('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('Status must be active or inactive')
];

// Admin routes (all require authentication)

// Dashboard
router.get('/dashboard', authenticateToken, adminController.getDashboard);

// User management
router.get('/users', authenticateToken, adminController.getUsers);
router.put('/users/:id', authenticateToken, validateUserUpdate, adminController.updateUser);
router.delete('/users/:id', authenticateToken, adminController.deleteUser);

// Payment management
router.get('/payments/pending', authenticateToken, adminController.getPendingPayments);
router.post('/payments/:paymentId/approve', authenticateToken, validatePaymentApproval, adminController.approvePayment);
router.post('/payments/:paymentId/reject', authenticateToken, validatePaymentRejection, adminController.rejectPayment);

// Subscription management (legacy support)
router.get('/subscriptions/pending', authenticateToken, adminController.getPendingSubscriptions);
router.post('/subscriptions/:id/approve', authenticateToken, validateSubscriptionApproval, adminController.approveSubscription);
router.post('/subscriptions/:id/reject', authenticateToken, validateSubscriptionRejection, adminController.rejectSubscription);

// Statistics routes
router.get('/stats/system', authenticateToken, adminController.getSystemStats);
router.get('/stats/alerts', authenticateToken, adminController.getAlertStats);
router.get('/stats/subscriptions', authenticateToken, adminController.getSubscriptionStats);
router.get('/stats/payments', authenticateToken, adminController.getPaymentStats);

// UPI Configuration routes
router.get('/upi/config', authenticateToken, adminController.getUPIConfig);
router.put('/upi/config', authenticateToken, validateUPIConfig, adminController.updateUPIConfig);

// Subscription Plan Management routes
router.get('/subscription-plans', authenticateToken, adminController.getSubscriptionPlans);
router.post('/subscription-plans', authenticateToken, validateSubscriptionPlan, adminController.createSubscriptionPlan);
router.put('/subscription-plans/:planId', authenticateToken, validateSubscriptionPlan, adminController.updateSubscriptionPlan);
router.delete('/subscription-plans/:planId', authenticateToken, adminController.deleteSubscriptionPlan);

module.exports = router;