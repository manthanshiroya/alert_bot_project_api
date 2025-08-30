const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');
const { body } = require('express-validator');

// Validation middleware
const validateProfileUpdate = [
  body('firstName').optional().isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
  body('lastName').optional().isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
  body('username').optional().isLength({ max: 50 }).withMessage('Username cannot exceed 50 characters'),
  body('timezone').optional().isString().withMessage('Timezone must be a string'),
  body('emailNotifications').optional().isBoolean().withMessage('Email notifications must be boolean'),
  body('telegramNotifications').optional().isBoolean().withMessage('Telegram notifications must be boolean'),
  body('alertFormat').optional().isIn(['simple', 'detailed', 'custom']).withMessage('Invalid alert format')
];

const validatePasswordChange = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long'),
  body('confirmPassword').notEmpty().withMessage('Password confirmation is required')
];

const validateAccountDeletion = [
  body('password').notEmpty().withMessage('Password is required'),
  body('confirmDeletion').equals('DELETE').withMessage('Please type DELETE to confirm account deletion')
];

// User routes (all require authentication)
router.get('/profile', authenticateToken, userController.getProfile);
router.put('/profile', authenticateToken, validateProfileUpdate, userController.updateProfile);
router.post('/change-password', authenticateToken, validatePasswordChange, userController.changePassword);
router.delete('/account', authenticateToken, validateAccountDeletion, userController.deleteAccount);
router.get('/subscription', authenticateToken, userController.getSubscription);
router.get('/stats', authenticateToken, userController.getUserStats);

module.exports = router;