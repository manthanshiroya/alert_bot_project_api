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

// User payment routes

/**
 * @route   POST /api/v1/payments/request
 * @desc    Create payment request with UPI QR code
 * @access  Private (User)
 */
router.post('/request', 
  authenticateToken, 
  validatePaymentRequest, 
  paymentController.createPaymentRequest
);

/**
 * @route   POST /api/v1/payments/:paymentId/proof
 * @desc    Upload payment proof
 * @access  Private (User)
 */
router.post('/:paymentId/proof', 
  authenticateToken, 
  validatePaymentProofUpload,
  paymentController.upload.single('paymentProof'),
  paymentController.uploadPaymentProof
);

/**
 * @route   GET /api/v1/payments/:paymentId
 * @desc    Get payment details
 * @access  Private (User)
 */
router.get('/:paymentId', 
  authenticateToken, 
  validateGetPayment, 
  paymentController.getPayment
);

/**
 * @route   GET /api/v1/payments
 * @desc    Get user's payment history
 * @access  Private (User)
 */
router.get('/', 
  authenticateToken, 
  validateGetUserPayments, 
  paymentController.getUserPayments
);

// Admin payment routes

/**
 * @route   GET /api/v1/payments/admin/pending
 * @desc    Get pending payments for admin review
 * @access  Private (Admin)
 */
router.get('/admin/pending', 
  authenticateToken, 
  paymentController.getPendingPayments
);

/**
 * @route   PUT /api/v1/payments/admin/:paymentId/approve
 * @desc    Approve payment
 * @access  Private (Admin)
 */
router.put('/admin/:paymentId/approve', 
  authenticateToken, 
  validatePaymentApproval, 
  paymentController.approvePayment
);

/**
 * @route   PUT /api/v1/payments/admin/:paymentId/reject
 * @desc    Reject payment
 * @access  Private (Admin)
 */
router.put('/admin/:paymentId/reject', 
  authenticateToken, 
  validatePaymentRejection, 
  paymentController.rejectPayment
);

/**
 * @route   GET /api/v1/payments/admin/stats
 * @desc    Get payment statistics
 * @access  Private (Admin)
 */
router.get('/admin/stats', 
  authenticateToken, 
  paymentController.getPaymentStats
);

module.exports = router;