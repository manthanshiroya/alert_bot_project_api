const express = require('express');
const { body } = require('express-validator');
const adminController = require('../controllers/adminController');
const { verifyAdminToken } = require('../middleware/authMiddleware');
const { validatePaymentApproval, validatePaymentRejection } = require('../validators/paymentValidators');
const { validateSubscriptionApproval, validateSubscriptionRejection } = require('../validators/subscriptionValidators');
const { validateUPIConfig } = require('../validators/upiValidators');
const { validateSubscriptionPlan } = require('../validators/subscriptionPlanValidators');
const { validateUserUpdate } = require('../validators/userValidators');

const router = express.Router();

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: Get admin dashboard statistics
 *     description: Retrieves overview statistics for the admin dashboard including user counts, revenue, etc.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalUsers:
 *                       type: number
 *                       example: 1000
 *                     activeSubscriptions:
 *                       type: number
 *                       example: 500
 *                     monthlyRevenue:
 *                       type: number
 *                       example: 50000
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       500:
 *         description: Internal server error
 */
router.get('/dashboard', verifyAdminToken, adminController.getDashboard);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [User Management]
 *     summary: Get all users
 *     description: Retrieves a list of all users with pagination support
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of users per page
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                     totalCount:
 *                       type: number
 *                     currentPage:
 *                       type: number
 *                     totalPages:
 *                       type: number
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       500:
 *         description: Internal server error
 */
router.get('/users', verifyAdminToken, adminController.getUsers);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     tags: [User Management]
 *     summary: Get user by ID
 *     description: Retrieves detailed information about a specific user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         status:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get('/users/:id', verifyAdminToken, adminController.getUserById);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     tags: [User Management]
 *     summary: Update user
 *     description: Updates user information
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended]
 *     responses:
 *       200:
 *         description: User updated successfully
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
 *                   example: User updated successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.put('/users/:id', verifyAdminToken, validateUserUpdate, adminController.updateUser);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     tags: [User Management]
 *     summary: Delete user
 *     description: Soft deletes a user from the system
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
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
 *                   example: User deleted successfully
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.delete('/users/:id', verifyAdminToken, adminController.deleteUser);

/**
 * @swagger
 * /api/admin/payments/pending:
 *   get:
 *     tags: [Payment Management]
 *     summary: Get pending payments
 *     description: Retrieves a list of pending payments that require admin approval
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of payments per page
 *     responses:
 *       200:
 *         description: Pending payments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     payments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           userId:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           status:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     totalCount:
 *                       type: number
 *                     currentPage:
 *                       type: number
 *                     totalPages:
 *                       type: number
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       500:
 *         description: Internal server error
 */
router.get('/payments/pending', verifyAdminToken, adminController.getPendingPayments);

/**
 * @swagger
 * /api/admin/payments/{paymentId}/approve:
 *   post:
 *     tags: [Payment Management]
 *     summary: Approve payment
 *     description: Approves a pending payment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: Optional notes about the approval
 *     responses:
 *       200:
 *         description: Payment approved successfully
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
 *                   example: Payment approved successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Internal server error
 */
router.post('/payments/:paymentId/approve', verifyAdminToken, validatePaymentApproval, adminController.approvePayment);

/**
 * @swagger
 * /api/admin/payments/{paymentId}/reject:
 *   post:
 *     tags: [Payment Management]
 *     summary: Reject payment
 *     description: Rejects a pending payment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for rejection
 *     responses:
 *       200:
 *         description: Payment rejected successfully
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
 *                   example: Payment rejected successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Internal server error
 */
router.post('/payments/:paymentId/reject', verifyAdminToken, validatePaymentRejection, adminController.rejectPayment);







// Statistics routes
/**
 * @swagger
 * /api/admin/stats/system:
 *   get:
 *     tags: [Statistics]
 *     summary: Get system statistics
 *     description: Retrieves overall system statistics including user counts, subscription metrics, etc.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalUsers:
 *                       type: number
 *                     activeUsers:
 *                       type: number
 *                     totalSubscriptions:
 *                       type: number
 *                     activeSubscriptions:
 *                       type: number
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       500:
 *         description: Internal server error
 */
router.get('/stats/system', verifyAdminToken, adminController.getSystemStats);

/**
 * @swagger
 * /api/admin/stats/users:
 *   get:
 *     tags: [Statistics]
 *     summary: Get user statistics
 *     description: Retrieves detailed user-related statistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for statistics calculation
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for statistics calculation
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
 *                   type: object
 *                   properties:
 *                     newUsers:
 *                       type: number
 *                     activeUsers:
 *                       type: number
 *                     userGrowth:
 *                       type: number
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       500:
 *         description: Internal server error
 */
router.get('/stats/users', verifyAdminToken, adminController.getUserStats);

/**
 * @swagger
 * /api/admin/stats/revenue:
 *   get:
 *     tags: [Statistics]
 *     summary: Get revenue statistics
 *     description: Retrieves detailed revenue-related statistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for statistics calculation
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for statistics calculation
 *     responses:
 *       200:
 *         description: Revenue statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRevenue:
 *                       type: number
 *                     monthlyRevenue:
 *                       type: number
 *                     revenueGrowth:
 *                       type: number
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       500:
 *         description: Internal server error
 */
router.get('/stats/revenue', verifyAdminToken, adminController.getRevenueStats);

/**
 * @swagger
 * /api/admin/upi/config:
 *   get:
 *     tags: [UPI Configuration]
 *     summary: Get UPI configuration
 *     description: Retrieves the current UPI payment configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: UPI configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     upiId:
 *                       type: string
 *                     merchantName:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       500:
 *         description: Internal server error
 */
router.get('/upi/config', verifyAdminToken, adminController.getUPIConfig);

/**
 * @swagger
 * /api/admin/upi/config:
 *   put:
 *     tags: [UPI Configuration]
 *     summary: Update UPI configuration
 *     description: Updates the UPI payment configuration
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - upiId
 *               - merchantName
 *               - isActive
 *             properties:
 *               upiId:
 *                 type: string
 *                 description: UPI ID for payments
 *               merchantName:
 *                 type: string
 *                 description: Name of the merchant
 *               isActive:
 *                 type: boolean
 *                 description: Whether UPI payments are enabled
 *     responses:
 *       200:
 *         description: UPI configuration updated successfully
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
 *                   example: UPI configuration updated successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       500:
 *         description: Internal server error
 */
router.put('/upi/config', verifyAdminToken, validateUPIConfig, adminController.updateUPIConfig);

/**
 * @swagger
 * /api/admin/subscription-plans:
 *   get:
 *     tags: [Subscription Plans]
 *     summary: Get all subscription plans
 *     description: Retrieves a list of all subscription plans
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription plans retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       price:
 *                         type: number
 *                       duration:
 *                         type: number
 *                       features:
 *                         type: array
 *                         items:
 *                           type: string
 *                       isActive:
 *                         type: boolean
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       500:
 *         description: Internal server error
 */
router.get('/subscription-plans', verifyAdminToken, adminController.getSubscriptionPlans);

/**
 * @swagger
 * /api/admin/subscription-plans:
 *   post:
 *     tags: [Subscription Plans]
 *     summary: Create subscription plan
 *     description: Creates a new subscription plan
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - price
 *               - duration
 *               - features
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the subscription plan
 *               description:
 *                 type: string
 *                 description: Description of the plan
 *               price:
 *                 type: number
 *                 description: Price of the plan
 *               duration:
 *                 type: number
 *                 description: Duration in days
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of features included in the plan
 *               isActive:
 *                 type: boolean
 *                 default: true
 *                 description: Whether the plan is active
 *     responses:
 *       201:
 *         description: Subscription plan created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     price:
 *                       type: number
 *                     duration:
 *                       type: number
 *                     features:
 *                       type: array
 *                       items:
 *                         type: string
 *                     isActive:
 *                       type: boolean
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       500:
 *         description: Internal server error
 */
router.post('/subscription-plans', verifyAdminToken, validateSubscriptionPlan, adminController.createSubscriptionPlan);

/**
 * @swagger
 * /api/admin/subscription-plans/{planId}:
 *   put:
 *     tags: [Subscription Plans]
 *     summary: Update subscription plan
 *     description: Updates an existing subscription plan
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *         description: Subscription plan ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the subscription plan
 *               description:
 *                 type: string
 *                 description: Description of the plan
 *               price:
 *                 type: number
 *                 description: Price of the plan
 *               duration:
 *                 type: number
 *                 description: Duration in days
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of features included in the plan
 *               isActive:
 *                 type: boolean
 *                 description: Whether the plan is active
 *     responses:
 *       200:
 *         description: Subscription plan updated successfully
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
 *                   example: Subscription plan updated successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       404:
 *         description: Subscription plan not found
 *       500:
 *         description: Internal server error
 */
router.put('/subscription-plans/:planId', verifyAdminToken, validateSubscriptionPlan, adminController.updateSubscriptionPlan);

/**
 * @swagger
 * /api/admin/subscription-plans/{planId}:
 *   delete:
 *     tags: [Subscription Plans]
 *     summary: Delete subscription plan
 *     description: Deletes a subscription plan if it has no active subscriptions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *         description: Subscription plan ID
 *     responses:
 *       200:
 *         description: Subscription plan deleted successfully
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
 *                   example: Subscription plan deleted successfully
 *       401:
 *         description: Unauthorized - Invalid or missing admin token
 *       404:
 *         description: Subscription plan not found
 *       409:
 *         description: Cannot delete plan with active subscriptions
 *       500:
 *         description: Internal server error
 */
router.delete('/subscription-plans/:planId', verifyAdminToken, adminController.deleteSubscriptionPlan);

module.exports = router;