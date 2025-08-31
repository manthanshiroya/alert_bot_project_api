const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/auth');
const {
  validatePaymentRequest,
  validatePaymentProofUpload,
  validateGetPayment,
  validateGetUserPayments,
  validatePaymentApproval,
  validatePaymentRejection
} = require('../validators/paymentValidators');

/**
 * @swagger
 * components:
 *   schemas:
 *     Payment:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Payment ID
 *         userId:
 *           type: string
 *           description: User ID who made the payment
 *         amount:
 *           type: number
 *           description: Payment amount
 *         currency:
 *           type: string
 *           enum: [INR, USD]
 *           description: Payment currency
 *         subscriptionPlan:
 *           type: string
 *           enum: [premium, pro]
 *           description: Subscription plan
 *         status:
 *           type: string
 *           enum: [pending, approved, rejected, expired]
 *           description: Payment status
 *         paymentMethod:
 *           type: string
 *           enum: [upi, bank_transfer, card]
 *           description: Payment method
 *         upiQrCode:
 *           type: string
 *           description: UPI QR code for payment
 *         paymentProof:
 *           type: string
 *           description: URL to uploaded payment proof
 *         adminNotes:
 *           type: string
 *           description: Admin notes for approval/rejection
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           description: Payment request expiration
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Payment creation date
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update date
 *     PaymentRequest:
 *       type: object
 *       required:
 *         - amount
 *         - subscriptionPlan
 *       properties:
 *         amount:
 *           type: number
 *           minimum: 1
 *           description: Payment amount
 *         subscriptionPlan:
 *           type: string
 *           enum: [premium, pro]
 *           description: Subscription plan
 *         paymentMethod:
 *           type: string
 *           enum: [upi, bank_transfer]
 *           default: upi
 *           description: Payment method
 *     PaymentStats:
 *       type: object
 *       properties:
 *         totalPayments:
 *           type: number
 *           description: Total number of payments
 *         pendingPayments:
 *           type: number
 *           description: Number of pending payments
 *         approvedPayments:
 *           type: number
 *           description: Number of approved payments
 *         rejectedPayments:
 *           type: number
 *           description: Number of rejected payments
 *         totalRevenue:
 *           type: number
 *           description: Total revenue generated
 *         monthlyRevenue:
 *           type: number
 *           description: Current month revenue
 *         averagePaymentAmount:
 *           type: number
 *           description: Average payment amount
 */

// User payment routes

/**
 * @swagger
 * /api/v1/payments/request:
 *   post:
 *     summary: Create payment request
 *     description: Create a new payment request with UPI QR code for subscription
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentRequest'
 *     responses:
 *       201:
 *         description: Payment request created successfully
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
 *                   example: Payment request created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Payment'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/request', 
  authenticateToken, 
  validatePaymentRequest, 
  paymentController.createPaymentRequest
);

/**
 * @swagger
 * /api/v1/payments/{paymentId}/proof:
 *   post:
 *     summary: Upload payment proof
 *     description: Upload proof of payment for verification
 *     tags: [Payments]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               paymentProof:
 *                 type: string
 *                 format: binary
 *                 description: Payment proof image file
 *     responses:
 *       200:
 *         description: Payment proof uploaded successfully
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
 *                   example: Payment proof uploaded successfully
 *                 data:
 *                   $ref: '#/components/schemas/Payment'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Payment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/:paymentId/proof', 
  authenticateToken, 
  validatePaymentProofUpload,
  paymentController.upload.single('proof'),
  paymentController.uploadPaymentProof
);

/**
 * @swagger
 * /api/v1/payments/{paymentId}/status:
 *   get:
 *     summary: Get payment status for onboarding flow
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment status retrieved successfully
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
 *                     paymentId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, verified, rejected]
 *                     amount:
 *                       type: number
 *                     planName:
 *                       type: string
 *                     submittedAt:
 *                       type: string
 *                       format: date-time
 *                     verifiedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     rejectionReason:
 *                       type: string
 *                       nullable: true
 *       404:
 *         description: Payment not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:paymentId/status', 
  authenticateToken, 
  validateGetPayment, 
  paymentController.getPaymentStatus
);

/**
 * @swagger
 * /api/v1/payments/{paymentId}:
 *   get:
 *     summary: Get payment details
 *     description: Retrieve details of a specific payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Payment'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Payment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/:paymentId', 
  authenticateToken, 
  validateGetPayment, 
  paymentController.getPayment
);

/**
 * @swagger
 * /api/v1/payments:
 *   get:
 *     summary: Get user payment history
 *     description: Retrieve the authenticated user's payment history with pagination
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of payments per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, expired]
 *         description: Filter by payment status
 *     responses:
 *       200:
 *         description: Payment history retrieved successfully
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
 *                         $ref: '#/components/schemas/Payment'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/', 
  authenticateToken, 
  validateGetUserPayments, 
  paymentController.getUserPayments
);

// Admin payment routes

/**
 * @swagger
 * /api/v1/payments/admin/pending:
 *   get:
 *     summary: Get pending payments
 *     description: Retrieve all pending payments for admin review
 *     tags: [Payments, Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
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
 *                         $ref: '#/components/schemas/Payment'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/admin/pending', 
  authenticateToken, 
  paymentController.getPendingPayments
);

/**
 * @swagger
 * /api/v1/payments/admin/{paymentId}/approve:
 *   put:
 *     summary: Approve payment
 *     description: Approve a pending payment and activate user subscription
 *     tags: [Payments, Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID to approve
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: Admin notes for approval
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
 *                 data:
 *                   $ref: '#/components/schemas/Payment'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Payment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put('/admin/:paymentId/approve', 
  authenticateToken, 
  validatePaymentApproval, 
  paymentController.approvePayment
);

/**
 * @swagger
 * /api/v1/payments/admin/{paymentId}/reject:
 *   put:
 *     summary: Reject payment
 *     description: Reject a pending payment with reason
 *     tags: [Payments, Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID to reject
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for rejection
 *               notes:
 *                 type: string
 *                 description: Additional admin notes
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
 *                 data:
 *                   $ref: '#/components/schemas/Payment'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Payment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put('/admin/:paymentId/reject', 
  authenticateToken, 
  validatePaymentRejection, 
  paymentController.rejectPayment
);

/**
 * @swagger
 * /api/v1/payments/admin/stats:
 *   get:
 *     summary: Get payment statistics
 *     description: Retrieve comprehensive payment statistics for admin dashboard
 *     tags: [Payments, Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year]
 *           default: month
 *         description: Time period for statistics
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom period (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom period (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Payment statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/PaymentStats'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/admin/stats', 
  authenticateToken, 
  paymentController.getPaymentStats
);

module.exports = router;