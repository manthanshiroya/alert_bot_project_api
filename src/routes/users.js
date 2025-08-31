const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');
const { body } = require('express-validator');

/**
 * @swagger
 * components:
 *   schemas:
 *     UserProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: User ID
 *         email:
 *           type: string
 *           format: email
 *           description: User email address
 *         firstName:
 *           type: string
 *           description: User's first name
 *         lastName:
 *           type: string
 *           description: User's last name
 *         username:
 *           type: string
 *           description: User's username
 *         telegramUserId:
 *           type: string
 *           description: Linked Telegram user ID
 *         timezone:
 *           type: string
 *           description: User's timezone
 *         emailNotifications:
 *           type: boolean
 *           description: Email notification preference
 *         telegramNotifications:
 *           type: boolean
 *           description: Telegram notification preference
 *         alertFormat:
 *           type: string
 *           enum: [simple, detailed, custom]
 *           description: Preferred alert format
 *         subscription:
 *           $ref: '#/components/schemas/UserSubscription'
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Account creation date
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last profile update
 *     UserSubscription:
 *       type: object
 *       properties:
 *         plan:
 *           type: string
 *           enum: [free, premium, pro]
 *           description: Subscription plan
 *         status:
 *           type: string
 *           enum: [active, inactive, expired, pending]
 *           description: Subscription status
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           description: Subscription expiration date
 *         features:
 *           type: array
 *           items:
 *             type: string
 *           description: Available features
 *     UserStats:
 *       type: object
 *       properties:
 *         alertsReceived:
 *           type: number
 *           description: Total alerts received
 *         tradesExecuted:
 *           type: number
 *           description: Total trades executed
 *         totalPnL:
 *           type: number
 *           description: Total profit/loss
 *         winRate:
 *           type: number
 *           description: Win rate percentage
 *         lastActivity:
 *           type: string
 *           format: date-time
 *           description: Last activity timestamp
 *     PasswordChangeRequest:
 *       type: object
 *       required:
 *         - currentPassword
 *         - newPassword
 *         - confirmPassword
 *       properties:
 *         currentPassword:
 *           type: string
 *           description: Current password
 *         newPassword:
 *           type: string
 *           minLength: 6
 *           description: New password (min 6 characters)
 *         confirmPassword:
 *           type: string
 *           description: Confirm new password
 *     AccountDeletionRequest:
 *       type: object
 *       required:
 *         - password
 *         - confirmDeletion
 *       properties:
 *         password:
 *           type: string
 *           description: Account password for verification
 *         confirmDeletion:
 *           type: string
 *           enum: [DELETE]
 *           description: Must be 'DELETE' to confirm
 */

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

// Routes

/**
 * @swagger
 * /api/v1/users/profile:
 *   get:
 *     summary: Get user profile
 *     description: Retrieve the authenticated user's profile information
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/profile', authenticateToken, userController.getProfile);

/**
 * @swagger
 * /api/v1/users/profile:
 *   put:
 *     summary: Update user profile
 *     description: Update the authenticated user's profile information
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 description: User's first name
 *               lastName:
 *                 type: string
 *                 description: User's last name
 *               username:
 *                 type: string
 *                 description: User's username
 *               timezone:
 *                 type: string
 *                 description: User's timezone
 *               emailNotifications:
 *                 type: boolean
 *                 description: Email notification preference
 *               telegramNotifications:
 *                 type: boolean
 *                 description: Telegram notification preference
 *               alertFormat:
 *                 type: string
 *                 enum: [simple, detailed, custom]
 *                 description: Preferred alert format
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Profile updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put('/profile', authenticateToken, validateProfileUpdate, userController.updateProfile);

/**
 * @swagger
 * /api/v1/users/change-password:
 *   post:
 *     summary: Change user password
 *     description: Change the authenticated user's password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordChangeRequest'
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Password changed successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/change-password', authenticateToken, validatePasswordChange, userController.changePassword);

/**
 * @swagger
 * /api/v1/users/account:
 *   delete:
 *     summary: Delete user account
 *     description: Permanently delete the authenticated user's account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AccountDeletionRequest'
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Account deleted successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete('/account', authenticateToken, validateAccountDeletion, userController.deleteAccount);

/**
 * @swagger
 * /api/v1/users/subscription:
 *   get:
 *     summary: Get user subscription
 *     description: Retrieve the authenticated user's subscription information
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/UserSubscription'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/subscription', authenticateToken, userController.getSubscription);

/**
 * @swagger
 * /api/v1/users/stats:
 *   get:
 *     summary: Get user statistics
 *     description: Retrieve the authenticated user's trading and activity statistics
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/UserStats'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/stats', authenticateToken, userController.getUserStats);

module.exports = router;