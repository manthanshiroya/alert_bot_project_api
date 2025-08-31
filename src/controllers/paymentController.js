const { validationResult } = require('express-validator');
const multer = require('multer');
const Payment = require('../models/Payment');
const paymentService = require('../services/paymentService');
const logger = require('../utils/logger');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and PDF files are allowed.'), false);
    }
  }
});

/**
 * Create payment request with UPI QR code
 */
const createPaymentRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed'
        }
      });
    }

    const { subscriptionPlanId } = req.body;
    const userId = req.user.userId;
    
    // Get client metadata
    const metadata = {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    };

    // Check for existing pending payment
    const existingPayment = await Payment.findOne({
      userId,
      subscriptionPlanId,
      status: { $in: ['initiated', 'pending'] }
    });

    if (existingPayment && !existingPayment.isExpired()) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'PAYMENT_EXISTS',
          message: 'You already have a pending payment for this subscription plan'
        },
        data: {
          paymentId: existingPayment._id,
          transactionId: existingPayment.transactionId,
          expiresAt: existingPayment.expiresAt
        }
      });
    }

    // Create payment request
    const payment = await paymentService.createPaymentRequest(userId, subscriptionPlanId, metadata);
    
    // Populate subscription plan details
    await payment.populate('subscriptionPlanId', 'name pricing features');

    logger.info(`Payment request created: ${payment.transactionId} for user ${userId}`);

    res.status(201).json({
      status: 'success',
      data: {
        payment: {
          id: payment._id,
          transactionId: payment.transactionId,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          status: payment.status,
          expiresAt: payment.expiresAt,
          timeRemaining: payment.timeRemaining,
          upiDetails: {
            vpa: payment.upiDetails.vpa,
            qrCodeUrl: payment.upiDetails.qrCodeUrl,
            merchantName: payment.upiDetails.merchantName
          },
          subscriptionPlan: payment.subscriptionPlanId
        }
      },
      message: 'Payment request created successfully. Please complete the payment and upload proof.'
    });
  } catch (error) {
    logger.error('Error creating payment request:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create payment request'
      }
    });
  }
};

/**
 * Upload payment proof
 */
const uploadPaymentProof = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed'
        }
      });
    }

    const { paymentId } = req.params;
    const { transactionId, notes } = req.body;
    const userId = req.user.userId;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FILE',
          message: 'Payment proof file is required'
        }
      });
    }

    // Upload payment proof
    const payment = await paymentService.uploadPaymentProof(paymentId, file, userId, transactionId, notes);
    
    logger.info(`Payment proof uploaded for transaction: ${payment.transactionId}`);

    res.status(200).json({
      success: true,
      message: 'Payment proof uploaded successfully',
      data: {
        paymentId: payment._id,
        status: payment.status,
        submittedAt: payment.proofUpload.uploadedAt
      }
    });
  } catch (error) {
    logger.error('Error uploading payment proof:', error);
    
    if (error.message.includes('Payment not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Payment not found or cannot be updated'
        }
      });
    }
    
    if (error.message.includes('expired')) {
      return res.status(410).json({
        success: false,
        error: {
          code: 'PAYMENT_EXPIRED',
          message: 'Payment has expired. Please create a new payment request.'
        }
      });
    }
    
    if (error.message.includes('Invalid file type') || error.message.includes('File size')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE',
          message: error.message
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to upload payment proof'
      }
    });
  }
};

/**
 * Get payment status for onboarding flow
 */
const getPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.userId;

    const payment = await Payment.findOne({ _id: paymentId, userId })
      .populate('subscriptionPlanId', 'name');

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Payment not found'
        }
      });
    }

    // Map internal status to API status
    let apiStatus = 'pending';
    if (payment.status === 'verified' || payment.status === 'completed') {
      apiStatus = 'verified';
    } else if (payment.status === 'rejected') {
      apiStatus = 'rejected';
    }

    res.status(200).json({
      success: true,
      data: {
        paymentId: payment._id,
        status: apiStatus,
        amount: payment.amount,
        planName: payment.subscriptionPlanId ? payment.subscriptionPlanId.name : 'Unknown Plan',
        submittedAt: payment.proofUpload ? payment.proofUpload.uploadedAt : null,
        verifiedAt: payment.verification && payment.verification.verifiedAt ? payment.verification.verifiedAt : null,
        rejectionReason: payment.verification && payment.verification.rejectionReason ? payment.verification.rejectionReason : null
      }
    });
  } catch (error) {
    logger.error('Error getting payment status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get payment status'
      }
    });
  }
};

/**
 * Get payment details (legacy)
 */
const getPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.userId;

    const payment = await Payment.findOne({ _id: paymentId, userId })
      .populate('subscriptionPlanId', 'name pricing features');

    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        payment: {
          id: payment._id,
          transactionId: payment.transactionId,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          status: payment.status,
          expiresAt: payment.expiresAt,
          timeRemaining: payment.timeRemaining,
          ageInHours: payment.ageInHours,
          upiDetails: payment.method === 'UPI' ? {
            vpa: payment.upiDetails.vpa,
            qrCodeUrl: payment.upiDetails.qrCodeUrl,
            merchantName: payment.upiDetails.merchantName
          } : undefined,
          proofUpload: payment.proofUpload ? {
            originalName: payment.proofUpload.originalName,
            url: payment.proofUpload.url,
            uploadedAt: payment.proofUpload.uploadedAt
          } : undefined,
          verification: payment.verification.verifiedAt ? {
            verifiedAt: payment.verification.verifiedAt,
            rejectionReason: payment.verification.rejectionReason,
            notes: payment.verification.notes
          } : undefined,
          subscriptionPlan: payment.subscriptionPlanId,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt
        }
      }
    });
  } catch (error) {
    logger.error('Error getting payment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get payment details'
    });
  }
};

/**
 * Get user's payment history
 */
const getUserPayments = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status, limit = 20 } = req.query;
    
    const options = {
      limit: parseInt(limit),
      status: status || undefined
    };

    const payments = await paymentService.getUserPayments(userId, options);

    res.status(200).json({
      status: 'success',
      data: {
        payments: payments.map(payment => ({
          id: payment._id,
          transactionId: payment.transactionId,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          status: payment.status,
          subscriptionPlan: {
            id: payment.subscriptionPlanId._id,
            name: payment.subscriptionPlanId.name,
            pricing: payment.subscriptionPlanId.pricing
          },
          proofUpload: payment.proofUpload ? {
            uploadedAt: payment.proofUpload.uploadedAt
          } : undefined,
          verification: payment.verification.verifiedAt ? {
            verifiedAt: payment.verification.verifiedAt,
            rejectionReason: payment.verification.rejectionReason
          } : undefined,
          createdAt: payment.createdAt
        })),
        count: payments.length
      }
    });
  } catch (error) {
    logger.error('Error getting user payments:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get payment history'
      }
    });
  }
};

/**
 * Admin: Get pending payments
 */
const getPendingPayments = async (req, res) => {
  try {
    const payments = await paymentService.getPendingPayments();

    res.status(200).json({
      status: 'success',
      data: {
        payments: payments.map(payment => ({
          id: payment._id,
          transactionId: payment.transactionId,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          status: payment.status,
          user: {
            id: payment.userId._id,
            name: payment.userId.profile?.name,
            email: payment.userId.email
          },
          subscriptionPlan: {
            id: payment.subscriptionPlanId._id,
            name: payment.subscriptionPlanId.name,
            pricing: payment.subscriptionPlanId.pricing
          },
          proofUpload: payment.proofUpload ? {
            originalName: payment.proofUpload.originalName,
            url: payment.proofUpload.url,
            uploadedAt: payment.proofUpload.uploadedAt
          } : undefined,
          ageInHours: payment.ageInHours,
          createdAt: payment.createdAt
        })),
        count: payments.length
      }
    });
  } catch (error) {
    logger.error('Error getting pending payments:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get pending payments'
      }
    });
  }
};

/**
 * Admin: Approve payment
 */
const approvePayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed'
        }
      });
    }

    const { paymentId } = req.params;
    const { notes } = req.body;
    const adminUserId = req.user.userId;

    const payment = await paymentService.approvePayment(paymentId, adminUserId, notes);
    
    await payment.populate([
      { path: 'userId', select: 'profile.name email' },
      { path: 'subscriptionPlanId', select: 'name pricing' }
    ]);

    logger.info(`Payment approved: ${payment.transactionId} by admin ${adminUserId}`);

    res.status(200).json({
      status: 'success',
      data: {
        payment: {
          id: payment._id,
          transactionId: payment.transactionId,
          status: payment.status,
          verification: {
            verifiedBy: payment.verification.verifiedBy,
            verifiedAt: payment.verification.verifiedAt,
            notes: payment.verification.notes
          }
        }
      },
      message: 'Payment approved successfully. User subscription has been activated.'
    });
  } catch (error) {
    logger.error('Error approving payment:', error);
    
    if (error.message.includes('Payment not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Payment not found'
        }
      });
    }
    
    if (error.message.includes('cannot be verified')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAYMENT_STATE',
          message: 'Payment cannot be verified in current state'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to approve payment'
      }
    });
  }
};

/**
 * Admin: Reject payment
 */
const rejectPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed'
        }
      });
    }

    const { paymentId } = req.params;
    const { reason, notes } = req.body;
    const adminUserId = req.user.userId;

    const payment = await paymentService.rejectPayment(paymentId, adminUserId, reason, notes);
    
    await payment.populate([
      { path: 'userId', select: 'profile.name email' },
      { path: 'subscriptionPlanId', select: 'name pricing' }
    ]);

    logger.info(`Payment rejected: ${payment.transactionId} by admin ${adminUserId}`);

    res.status(200).json({
      status: 'success',
      data: {
        payment: {
          id: payment._id,
          transactionId: payment.transactionId,
          status: payment.status,
          verification: {
            verifiedBy: payment.verification.verifiedBy,
            verifiedAt: payment.verification.verifiedAt,
            rejectionReason: payment.verification.rejectionReason,
            notes: payment.verification.notes
          }
        }
      },
      message: 'Payment rejected successfully.'
    });
  } catch (error) {
    logger.error('Error rejecting payment:', error);
    
    if (error.message.includes('Payment not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Payment not found'
        }
      });
    }
    
    if (error.message.includes('cannot be verified')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAYMENT_STATE',
          message: 'Payment cannot be verified in current state'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reject payment'
      }
    });
  }
};

/**
 * Admin: Get payment statistics
 */
const getPaymentStats = async (req, res) => {
  try {
    const stats = await paymentService.getPaymentStats();

    res.status(200).json({
      status: 'success',
      data: {
        statistics: stats
      }
    });
  } catch (error) {
    logger.error('Error getting payment statistics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get payment statistics'
      }
    });
  }
};

module.exports = {
  upload,
  createPaymentRequest,
  uploadPaymentProof,
  getPaymentStatus,
  getPayment,
  getUserPayments,
  getPendingPayments,
  approvePayment,
  rejectPayment,
  getPaymentStats
};