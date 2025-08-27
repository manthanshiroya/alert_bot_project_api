const express = require('express');
const { AuthMiddleware, ValidationMiddleware, ErrorHandler } = require('../../../shared/middleware');
const { Logger } = require('../../../shared/utils/logger');
const BillingController = require('../controllers/BillingController');
const router = express.Router();

// Initialize dependencies
const logger = new Logger('billing-routes');
const authMiddleware = new AuthMiddleware(logger);
const validationMiddleware = new ValidationMiddleware();
const errorHandler = new ErrorHandler(logger);
const billingController = new BillingController();

/**
 * @route GET /api/v1/billing/invoices
 * @desc Get user's invoices
 * @access Private
 */
router.get('/invoices',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.invoiceQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sort = '-createdAt'
    } = req.query;
    
    const filters = { userId: req.user.id };
    if (status) filters.status = status;
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort
    };
    
    const result = await billingController.getUserInvoices(filters, options);
    
    logger.info('User invoices retrieved', {
      userId: req.user.id,
      count: result.docs.length,
      total: result.totalDocs
    });
    
    res.json({
      success: true,
      data: result.docs,
      pagination: {
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        totalDocs: result.totalDocs,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage
      }
    });
  })
);

/**
 * @route GET /api/v1/billing/invoices/:id
 * @desc Get specific invoice
 * @access Private
 */
router.get('/invoices/:id',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const invoice = await billingController.getInvoice(req.params.id, req.user.id);
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    logger.info('Invoice retrieved', {
      invoiceId: invoice.id,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      data: invoice
    });
  })
);

/**
 * @route GET /api/v1/billing/invoices/:id/download
 * @desc Download invoice PDF
 * @access Private
 */
router.get('/invoices/:id/download',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const pdfBuffer = await billingController.downloadInvoice(req.params.id, req.user.id);
    
    if (!pdfBuffer) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found or cannot be downloaded'
      });
    }
    
    logger.info('Invoice downloaded', {
      invoiceId: req.params.id,
      userId: req.user.id
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  })
);

/**
 * @route POST /api/v1/billing/invoices/:id/pay
 * @desc Pay invoice
 * @access Private
 */
router.post('/invoices/:id/pay',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.invoicePayment
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { paymentMethodId, savePaymentMethod = false } = req.body;
    
    const result = await billingController.payInvoice(
      req.params.id,
      req.user.id,
      paymentMethodId,
      savePaymentMethod
    );
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
    
    logger.info('Invoice payment processed', {
      invoiceId: req.params.id,
      userId: req.user.id,
      paymentId: result.paymentId
    });
    
    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: result.data
    });
  })
);

/**
 * @route GET /api/v1/billing/payment-methods
 * @desc Get user's payment methods
 * @access Private
 */
router.get('/payment-methods',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  errorHandler.asyncWrapper(async (req, res) => {
    const paymentMethods = await billingController.getPaymentMethods(req.user.id);
    
    logger.info('Payment methods retrieved', {
      userId: req.user.id,
      count: paymentMethods.length
    });
    
    res.json({
      success: true,
      data: paymentMethods
    });
  })
);

/**
 * @route POST /api/v1/billing/payment-methods
 * @desc Add new payment method
 * @access Private
 */
router.post('/payment-methods',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.paymentMethodCreate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { token, type, setAsDefault = false } = req.body;
    
    const paymentMethod = await billingController.addPaymentMethod(
      req.user.id,
      token,
      type,
      setAsDefault
    );
    
    if (!paymentMethod.success) {
      return res.status(400).json({
        success: false,
        message: paymentMethod.message,
        error: paymentMethod.error
      });
    }
    
    logger.info('Payment method added', {
      userId: req.user.id,
      paymentMethodId: paymentMethod.data.id,
      type
    });
    
    res.status(201).json({
      success: true,
      message: 'Payment method added successfully',
      data: paymentMethod.data
    });
  })
);

/**
 * @route PUT /api/v1/billing/payment-methods/:id
 * @desc Update payment method
 * @access Private
 */
router.put('/payment-methods/:id',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.paymentMethodUpdate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const paymentMethod = await billingController.updatePaymentMethod(
      req.params.id,
      req.user.id,
      req.body
    );
    
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }
    
    logger.info('Payment method updated', {
      userId: req.user.id,
      paymentMethodId: req.params.id
    });
    
    res.json({
      success: true,
      message: 'Payment method updated successfully',
      data: paymentMethod
    });
  })
);

/**
 * @route DELETE /api/v1/billing/payment-methods/:id
 * @desc Delete payment method
 * @access Private
 */
router.delete('/payment-methods/:id',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const result = await billingController.deletePaymentMethod(
      req.params.id,
      req.user.id
    );
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }
    
    logger.info('Payment method deleted', {
      userId: req.user.id,
      paymentMethodId: req.params.id
    });
    
    res.json({
      success: true,
      message: 'Payment method deleted successfully'
    });
  })
);

/**
 * @route POST /api/v1/billing/payment-methods/:id/set-default
 * @desc Set payment method as default
 * @access Private
 */
router.post('/payment-methods/:id/set-default',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const result = await billingController.setDefaultPaymentMethod(
      req.params.id,
      req.user.id
    );
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }
    
    logger.info('Default payment method set', {
      userId: req.user.id,
      paymentMethodId: req.params.id
    });
    
    res.json({
      success: true,
      message: 'Default payment method updated successfully'
    });
  })
);

/**
 * @route GET /api/v1/billing/transactions
 * @desc Get user's transaction history
 * @access Private
 */
router.get('/transactions',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.transactionQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      type,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sort = '-createdAt'
    } = req.query;
    
    const filters = { userId: req.user.id };
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort
    };
    
    const result = await billingController.getTransactions(filters, options);
    
    logger.info('User transactions retrieved', {
      userId: req.user.id,
      count: result.docs.length,
      total: result.totalDocs
    });
    
    res.json({
      success: true,
      data: result.docs,
      pagination: {
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        totalDocs: result.totalDocs,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage
      }
    });
  })
);

/**
 * @route GET /api/v1/billing/transactions/:id
 * @desc Get specific transaction
 * @access Private
 */
router.get('/transactions/:id',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const transaction = await billingController.getTransaction(req.params.id, req.user.id);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    logger.info('Transaction retrieved', {
      transactionId: transaction.id,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      data: transaction
    });
  })
);

/**
 * @route POST /api/v1/billing/refund/:transactionId
 * @desc Request refund for transaction
 * @access Private
 */
router.post('/refund/:transactionId',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('transactionId'),
    body: validationMiddleware.schemas.refundRequest
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { reason, amount } = req.body;
    
    const result = await billingController.requestRefund(
      req.params.transactionId,
      req.user.id,
      reason,
      amount
    );
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
    
    logger.info('Refund requested', {
      transactionId: req.params.transactionId,
      userId: req.user.id,
      refundId: result.refundId,
      amount
    });
    
    res.json({
      success: true,
      message: 'Refund request submitted successfully',
      data: result.data
    });
  })
);

/**
 * @route GET /api/v1/billing/usage
 * @desc Get current billing period usage
 * @access Private
 */
router.get('/usage',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  errorHandler.asyncWrapper(async (req, res) => {
    const usage = await billingController.getCurrentUsage(req.user.id);
    
    if (!usage) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }
    
    logger.info('Usage retrieved', {
      userId: req.user.id,
      subscriptionId: usage.subscriptionId
    });
    
    res.json({
      success: true,
      data: usage
    });
  })
);

/**
 * @route GET /api/v1/billing/usage/history
 * @desc Get usage history
 * @access Private
 */
router.get('/usage/history',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.usageHistoryQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      startDate,
      endDate,
      granularity = 'daily',
      metric
    } = req.query;
    
    const usage = await billingController.getUsageHistory(
      req.user.id,
      startDate,
      endDate,
      granularity,
      metric
    );
    
    logger.info('Usage history retrieved', {
      userId: req.user.id,
      granularity,
      metric,
      dataPoints: usage.length
    });
    
    res.json({
      success: true,
      data: usage
    });
  })
);

/**
 * @route GET /api/v1/billing/estimates/upgrade
 * @desc Get upgrade cost estimate
 * @access Private
 */
router.get('/estimates/upgrade',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.upgradeEstimate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { planId, billingCycle } = req.query;
    
    const estimate = await billingController.getUpgradeEstimate(
      req.user.id,
      planId,
      billingCycle
    );
    
    if (!estimate.success) {
      return res.status(400).json({
        success: false,
        message: estimate.message
      });
    }
    
    logger.info('Upgrade estimate calculated', {
      userId: req.user.id,
      targetPlanId: planId,
      estimatedCost: estimate.data.totalCost
    });
    
    res.json({
      success: true,
      data: estimate.data
    });
  })
);

/**
 * @route POST /api/v1/billing/coupons/apply
 * @desc Apply coupon code
 * @access Private
 */
router.post('/coupons/apply',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.couponApply
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { couponCode, subscriptionId } = req.body;
    
    const result = await billingController.applyCoupon(
      req.user.id,
      couponCode,
      subscriptionId
    );
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
    
    logger.info('Coupon applied', {
      userId: req.user.id,
      couponCode,
      subscriptionId,
      discountAmount: result.data.discountAmount
    });
    
    res.json({
      success: true,
      message: 'Coupon applied successfully',
      data: result.data
    });
  })
);

/**
 * @route DELETE /api/v1/billing/coupons/:couponId
 * @desc Remove applied coupon
 * @access Private
 */
router.delete('/coupons/:couponId',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('couponId')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const result = await billingController.removeCoupon(
      req.user.id,
      req.params.couponId
    );
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found or cannot be removed'
      });
    }
    
    logger.info('Coupon removed', {
      userId: req.user.id,
      couponId: req.params.couponId
    });
    
    res.json({
      success: true,
      message: 'Coupon removed successfully'
    });
  })
);

/**
 * @route GET /api/v1/billing/tax/calculate
 * @desc Calculate tax for amount
 * @access Private
 */
router.get('/tax/calculate',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.taxCalculation
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { amount, country, state, zipCode } = req.query;
    
    const tax = await billingController.calculateTax(
      parseFloat(amount),
      country,
      state,
      zipCode
    );
    
    logger.info('Tax calculated', {
      userId: req.user.id,
      amount: parseFloat(amount),
      taxAmount: tax.taxAmount,
      country
    });
    
    res.json({
      success: true,
      data: tax
    });
  })
);

module.exports = router;