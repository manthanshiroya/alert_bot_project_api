const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const Payment = require('../models/Payment');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const UserSubscription = require('../models/UserSubscription');
const logger = require('../utils/logger');

class PaymentService {
  constructor() {
    this.upiConfig = {
      merchantName: process.env.UPI_MERCHANT_NAME || 'TradingView Alert Bot',
      merchantCode: process.env.UPI_MERCHANT_CODE || 'TVAB001',
      vpa: process.env.UPI_VPA || 'alerts@paytm',
      qrCodeDir: path.join(process.cwd(), 'public', 'qr-codes')
    };
    
    // Ensure QR code directory exists
    this.ensureQRDirectory();
  }

  async ensureQRDirectory() {
    try {
      await fs.mkdir(this.upiConfig.qrCodeDir, { recursive: true });
    } catch (error) {
      logger.error('Error creating QR code directory:', error);
    }
  }

  /**
   * Generate UPI payment string
   */
  generateUPIString(amount, transactionId, note = '') {
    const upiParams = {
      pa: this.upiConfig.vpa,
      pn: this.upiConfig.merchantName,
      mc: this.upiConfig.merchantCode,
      tr: transactionId,
      tn: note || `Payment for subscription - ${transactionId}`,
      am: amount.toString(),
      cu: 'INR'
    };

    const paramString = Object.entries(upiParams)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');

    return `upi://pay?${paramString}`;
  }

  /**
   * Generate QR code for UPI payment
   */
  async generateQRCode(upiString, transactionId) {
    try {
      const qrFileName = `qr_${transactionId}_${Date.now()}.png`;
      const qrFilePath = path.join(this.upiConfig.qrCodeDir, qrFileName);
      
      await QRCode.toFile(qrFilePath, upiString, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      const qrUrl = `/qr-codes/${qrFileName}`;
      
      return {
        qrCodeUrl: qrUrl,
        qrCodePath: qrFilePath,
        qrCodeData: upiString
      };
    } catch (error) {
      logger.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Create payment request
   */
  async createPaymentRequest(userId, subscriptionPlanId, metadata = {}) {
    try {
      // Get subscription plan
      const subscriptionPlan = await SubscriptionPlan.findById(subscriptionPlanId);
      if (!subscriptionPlan) {
        throw new Error('Subscription plan not found');
      }

      // Generate unique transaction ID
      const transactionId = this.generateTransactionId();
      
      // Generate UPI string and QR code
      const amount = subscriptionPlan.pricing.amount;
      const upiString = this.generateUPIString(amount, transactionId);
      const qrData = await this.generateQRCode(upiString, transactionId);

      // Create payment record
      const payment = new Payment({
        userId,
        subscriptionPlanId,
        transactionId,
        amount,
        currency: subscriptionPlan.pricing.currency,
        method: 'UPI',
        upiDetails: {
          vpa: this.upiConfig.vpa,
          qrCodeUrl: qrData.qrCodeUrl,
          qrCodeData: qrData.qrCodeData,
          merchantName: this.upiConfig.merchantName,
          merchantCode: this.upiConfig.merchantCode
        },
        metadata: {
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent
        }
      });

      await payment.save();
      
      logger.info(`Payment request created: ${transactionId} for user ${userId}`);
      
      return payment;
    } catch (error) {
      logger.error('Error creating payment request:', error);
      throw error;
    }
  }

  /**
   * Upload payment proof
   */
  async uploadPaymentProof(paymentId, file, userId) {
    try {
      const payment = await Payment.findOne({ 
        _id: paymentId, 
        userId,
        status: { $in: ['initiated', 'pending'] }
      });

      if (!payment) {
        throw new Error('Payment not found or cannot be updated');
      }

      if (payment.isExpired()) {
        throw new Error('Payment has expired');
      }

      // Validate file
      this.validatePaymentProof(file);

      // Generate secure filename
      const fileExtension = path.extname(file.originalname);
      const secureFilename = `proof_${payment.transactionId}_${Date.now()}${fileExtension}`;
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'payment-proofs');
      const filePath = path.join(uploadDir, secureFilename);

      // Ensure upload directory exists
      await fs.mkdir(uploadDir, { recursive: true });

      // Save file
      await fs.writeFile(filePath, file.buffer);

      // Update payment record
      payment.proofUpload = {
        originalName: file.originalname,
        filename: secureFilename,
        path: filePath,
        url: `/uploads/payment-proofs/${secureFilename}`,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: new Date()
      };
      payment.status = 'pending';

      await payment.save();
      
      logger.info(`Payment proof uploaded for transaction: ${payment.transactionId}`);
      
      return payment;
    } catch (error) {
      logger.error('Error uploading payment proof:', error);
      throw error;
    }
  }

  /**
   * Validate payment proof file
   */
  validatePaymentProof(file) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error('Invalid file type. Only JPEG, PNG, WebP, and PDF files are allowed.');
    }

    if (file.size > maxSize) {
      throw new Error('File size too large. Maximum size is 5MB.');
    }
  }

  /**
   * Approve payment
   */
  async approvePayment(paymentId, adminUserId, notes = '') {
    try {
      const payment = await Payment.findById(paymentId)
        .populate('userId')
        .populate('subscriptionPlanId');

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (!payment.canBeVerified()) {
        throw new Error('Payment cannot be verified in current state');
      }

      // Approve payment
      await payment.approve(adminUserId, notes);

      // Create or update user subscription
      await this.createUserSubscription(payment);

      logger.info(`Payment approved: ${payment.transactionId} by admin ${adminUserId}`);
      
      return payment;
    } catch (error) {
      logger.error('Error approving payment:', error);
      throw error;
    }
  }

  /**
   * Reject payment
   */
  async rejectPayment(paymentId, adminUserId, reason, notes = '') {
    try {
      const payment = await Payment.findById(paymentId);

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (!payment.canBeVerified()) {
        throw new Error('Payment cannot be verified in current state');
      }

      await payment.reject(adminUserId, reason, notes);

      logger.info(`Payment rejected: ${payment.transactionId} by admin ${adminUserId}`);
      
      return payment;
    } catch (error) {
      logger.error('Error rejecting payment:', error);
      throw error;
    }
  }

  /**
   * Create user subscription after payment approval
   */
  async createUserSubscription(payment) {
    try {
      const subscriptionPlan = payment.subscriptionPlanId;
      const startDate = new Date();
      const endDate = new Date();
      
      // Calculate end date based on plan duration
      if (subscriptionPlan.pricing.duration.months) {
        endDate.setMonth(endDate.getMonth() + subscriptionPlan.pricing.duration.months);
      }
      if (subscriptionPlan.pricing.duration.days) {
        endDate.setDate(endDate.getDate() + subscriptionPlan.pricing.duration.days);
      }

      // Check if user already has a subscription for this plan
      let userSubscription = await UserSubscription.findOne({
        userId: payment.userId._id,
        subscriptionPlanId: payment.subscriptionPlanId._id,
        'payment.transactionId': payment.transactionId
      });

      if (!userSubscription) {
        // Create new subscription
        userSubscription = new UserSubscription({
          userId: payment.userId._id,
          subscriptionPlanId: payment.subscriptionPlanId._id,
          payment: {
            transactionId: payment.transactionId,
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
            proofUrl: payment.proofUpload?.url,
            status: 'approved',
            approvedBy: payment.verification.verifiedBy,
            approvedAt: payment.verification.verifiedAt
          },
          subscription: {
            startDate,
            endDate,
            status: 'active',
            autoRenew: false
          }
        });
      } else {
        // Update existing subscription
        userSubscription.payment.status = 'approved';
        userSubscription.payment.approvedBy = payment.verification.verifiedBy;
        userSubscription.payment.approvedAt = payment.verification.verifiedAt;
        userSubscription.subscription.startDate = startDate;
        userSubscription.subscription.endDate = endDate;
        userSubscription.subscription.status = 'active';
      }

      await userSubscription.save();
      
      return userSubscription;
    } catch (error) {
      logger.error('Error creating user subscription:', error);
      throw error;
    }
  }

  /**
   * Get payment by transaction ID
   */
  async getPaymentByTransactionId(transactionId) {
    return Payment.findOne({ transactionId })
      .populate('userId', 'profile.name email')
      .populate('subscriptionPlanId', 'name pricing');
  }

  /**
   * Get user payments
   */
  async getUserPayments(userId, options = {}) {
    return Payment.findByUser(userId, options);
  }

  /**
   * Get pending payments for admin
   */
  async getPendingPayments() {
    return Payment.findPendingPayments();
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats() {
    const stats = await Payment.getPaymentStats();
    return stats[0] || { stats: [], totalPayments: 0, totalRevenue: 0 };
  }

  /**
   * Generate unique transaction ID
   */
  generateTransactionId() {
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `TXN${timestamp}${random}`;
  }

  /**
   * Clean up expired QR codes
   */
  async cleanupExpiredQRCodes() {
    try {
      const expiredPayments = await Payment.find({
        status: 'expired',
        'upiDetails.qrCodeUrl': { $exists: true }
      });

      for (const payment of expiredPayments) {
        try {
          const qrFileName = path.basename(payment.upiDetails.qrCodeUrl);
          const qrFilePath = path.join(this.upiConfig.qrCodeDir, qrFileName);
          await fs.unlink(qrFilePath);
          logger.info(`Cleaned up QR code: ${qrFileName}`);
        } catch (error) {
          logger.warn(`Failed to cleanup QR code for payment ${payment.transactionId}:`, error.message);
        }
      }
    } catch (error) {
      logger.error('Error during QR code cleanup:', error);
    }
  }
}

module.exports = new PaymentService();