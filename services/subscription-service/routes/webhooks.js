const express = require('express');
const { ValidationMiddleware, ErrorHandler } = require('../../../shared/middleware');
const { Logger } = require('../../../shared/utils/logger');
const WebhookController = require('../controllers/WebhookController');
const router = express.Router();

// Initialize dependencies
const logger = new Logger('webhook-routes');
const validationMiddleware = new ValidationMiddleware();
const errorHandler = new ErrorHandler(logger);
const webhookController = new WebhookController();

/**
 * @route POST /api/v1/webhooks/stripe
 * @desc Handle Stripe webhooks
 * @access Public (Stripe signature verification)
 */
router.post('/stripe',
  express.raw({ type: 'application/json' }),
  errorHandler.asyncWrapper(async (req, res) => {
    const signature = req.headers['stripe-signature'];
    
    if (!signature) {
      logger.warn('Stripe webhook received without signature');
      return res.status(400).json({
        success: false,
        message: 'Missing Stripe signature'
      });
    }
    
    const result = await webhookController.handleStripeWebhook(
      req.body,
      signature
    );
    
    if (!result.success) {
      logger.error('Stripe webhook processing failed', {
        error: result.error,
        eventType: result.eventType
      });
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Stripe webhook processed successfully', {
      eventType: result.eventType,
      eventId: result.eventId
    });
    
    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });
  })
);

/**
 * @route POST /api/v1/webhooks/paypal
 * @desc Handle PayPal webhooks
 * @access Public (PayPal signature verification)
 */
router.post('/paypal',
  express.json(),
  errorHandler.asyncWrapper(async (req, res) => {
    const headers = {
      'paypal-transmission-id': req.headers['paypal-transmission-id'],
      'paypal-cert-id': req.headers['paypal-cert-id'],
      'paypal-auth-algo': req.headers['paypal-auth-algo'],
      'paypal-transmission-sig': req.headers['paypal-transmission-sig'],
      'paypal-transmission-time': req.headers['paypal-transmission-time']
    };
    
    const result = await webhookController.handlePayPalWebhook(
      req.body,
      headers
    );
    
    if (!result.success) {
      logger.error('PayPal webhook processing failed', {
        error: result.error,
        eventType: result.eventType
      });
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('PayPal webhook processed successfully', {
      eventType: result.eventType,
      eventId: result.eventId
    });
    
    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });
  })
);

/**
 * @route POST /api/v1/webhooks/subscription-expired
 * @desc Handle subscription expiration notifications
 * @access Internal
 */
router.post('/subscription-expired',
  validationMiddleware.validate({
    body: validationMiddleware.schemas.subscriptionExpiredWebhook
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { subscriptionId, userId, planId } = req.body;
    
    const result = await webhookController.handleSubscriptionExpired(
      subscriptionId,
      userId,
      planId
    );
    
    if (!result.success) {
      logger.error('Subscription expiration handling failed', {
        subscriptionId,
        userId,
        error: result.error
      });
      return res.status(500).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Subscription expiration handled', {
      subscriptionId,
      userId
    });
    
    res.json({
      success: true,
      message: 'Subscription expiration handled successfully'
    });
  })
);

/**
 * @route POST /api/v1/webhooks/payment-failed
 * @desc Handle payment failure notifications
 * @access Internal
 */
router.post('/payment-failed',
  validationMiddleware.validate({
    body: validationMiddleware.schemas.paymentFailedWebhook
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { subscriptionId, userId, amount, reason, attemptCount } = req.body;
    
    const result = await webhookController.handlePaymentFailed(
      subscriptionId,
      userId,
      amount,
      reason,
      attemptCount
    );
    
    if (!result.success) {
      logger.error('Payment failure handling failed', {
        subscriptionId,
        userId,
        error: result.error
      });
      return res.status(500).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Payment failure handled', {
      subscriptionId,
      userId,
      attemptCount
    });
    
    res.json({
      success: true,
      message: 'Payment failure handled successfully'
    });
  })
);

/**
 * @route POST /api/v1/webhooks/usage-limit-reached
 * @desc Handle usage limit notifications
 * @access Internal
 */
router.post('/usage-limit-reached',
  validationMiddleware.validate({
    body: validationMiddleware.schemas.usageLimitWebhook
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { userId, subscriptionId, limitType, currentUsage, limit, percentage } = req.body;
    
    const result = await webhookController.handleUsageLimitReached(
      userId,
      subscriptionId,
      limitType,
      currentUsage,
      limit,
      percentage
    );
    
    if (!result.success) {
      logger.error('Usage limit notification handling failed', {
        userId,
        subscriptionId,
        limitType,
        error: result.error
      });
      return res.status(500).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Usage limit notification handled', {
      userId,
      subscriptionId,
      limitType,
      percentage
    });
    
    res.json({
      success: true,
      message: 'Usage limit notification handled successfully'
    });
  })
);

/**
 * @route POST /api/v1/webhooks/trial-ending
 * @desc Handle trial ending notifications
 * @access Internal
 */
router.post('/trial-ending',
  validationMiddleware.validate({
    body: validationMiddleware.schemas.trialEndingWebhook
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { userId, subscriptionId, trialEndDate, daysRemaining } = req.body;
    
    const result = await webhookController.handleTrialEnding(
      userId,
      subscriptionId,
      trialEndDate,
      daysRemaining
    );
    
    if (!result.success) {
      logger.error('Trial ending notification handling failed', {
        userId,
        subscriptionId,
        error: result.error
      });
      return res.status(500).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Trial ending notification handled', {
      userId,
      subscriptionId,
      daysRemaining
    });
    
    res.json({
      success: true,
      message: 'Trial ending notification handled successfully'
    });
  })
);

/**
 * @route POST /api/v1/webhooks/plan-changed
 * @desc Handle plan change notifications
 * @access Internal
 */
router.post('/plan-changed',
  validationMiddleware.validate({
    body: validationMiddleware.schemas.planChangedWebhook
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { userId, subscriptionId, oldPlanId, newPlanId, changeType, effectiveDate } = req.body;
    
    const result = await webhookController.handlePlanChanged(
      userId,
      subscriptionId,
      oldPlanId,
      newPlanId,
      changeType,
      effectiveDate
    );
    
    if (!result.success) {
      logger.error('Plan change notification handling failed', {
        userId,
        subscriptionId,
        changeType,
        error: result.error
      });
      return res.status(500).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Plan change notification handled', {
      userId,
      subscriptionId,
      changeType,
      oldPlanId,
      newPlanId
    });
    
    res.json({
      success: true,
      message: 'Plan change notification handled successfully'
    });
  })
);

/**
 * @route POST /api/v1/webhooks/invoice-generated
 * @desc Handle invoice generation notifications
 * @access Internal
 */
router.post('/invoice-generated',
  validationMiddleware.validate({
    body: validationMiddleware.schemas.invoiceGeneratedWebhook
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { userId, subscriptionId, invoiceId, amount, dueDate } = req.body;
    
    const result = await webhookController.handleInvoiceGenerated(
      userId,
      subscriptionId,
      invoiceId,
      amount,
      dueDate
    );
    
    if (!result.success) {
      logger.error('Invoice generation notification handling failed', {
        userId,
        subscriptionId,
        invoiceId,
        error: result.error
      });
      return res.status(500).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Invoice generation notification handled', {
      userId,
      subscriptionId,
      invoiceId,
      amount
    });
    
    res.json({
      success: true,
      message: 'Invoice generation notification handled successfully'
    });
  })
);

/**
 * @route POST /api/v1/webhooks/refund-processed
 * @desc Handle refund processing notifications
 * @access Internal
 */
router.post('/refund-processed',
  validationMiddleware.validate({
    body: validationMiddleware.schemas.refundProcessedWebhook
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { userId, transactionId, refundId, amount, reason, status } = req.body;
    
    const result = await webhookController.handleRefundProcessed(
      userId,
      transactionId,
      refundId,
      amount,
      reason,
      status
    );
    
    if (!result.success) {
      logger.error('Refund processing notification handling failed', {
        userId,
        transactionId,
        refundId,
        error: result.error
      });
      return res.status(500).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Refund processing notification handled', {
      userId,
      transactionId,
      refundId,
      amount,
      status
    });
    
    res.json({
      success: true,
      message: 'Refund processing notification handled successfully'
    });
  })
);

/**
 * @route GET /api/v1/webhooks/health
 * @desc Webhook endpoint health check
 * @access Public
 */
router.get('/health',
  errorHandler.asyncWrapper(async (req, res) => {
    const health = await webhookController.getWebhookHealth();
    
    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * @route GET /api/v1/webhooks/stats
 * @desc Get webhook processing statistics
 * @access Private (Admin only)
 */
router.get('/stats',
  // Note: This would typically require admin authentication
  // authMiddleware.authenticate,
  // authMiddleware.requireAdmin,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.webhookStatsQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      startDate,
      endDate,
      provider,
      eventType,
      status
    } = req.query;
    
    const filters = {};
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }
    if (provider) filters.provider = provider;
    if (eventType) filters.eventType = eventType;
    if (status) filters.status = status;
    
    const stats = await webhookController.getWebhookStats(filters);
    
    logger.info('Webhook stats retrieved', {
      filters,
      totalEvents: stats.totalEvents
    });
    
    res.json({
      success: true,
      data: stats
    });
  })
);

/**
 * @route POST /api/v1/webhooks/retry/:eventId
 * @desc Retry failed webhook processing
 * @access Private (Admin only)
 */
router.post('/retry/:eventId',
  // Note: This would typically require admin authentication
  // authMiddleware.authenticate,
  // authMiddleware.requireAdmin,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('eventId')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const result = await webhookController.retryWebhookEvent(req.params.eventId);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Webhook event retried', {
      eventId: req.params.eventId,
      retryCount: result.retryCount
    });
    
    res.json({
      success: true,
      message: 'Webhook event retried successfully',
      data: result.data
    });
  })
);

/**
 * @route GET /api/v1/webhooks/events
 * @desc Get webhook event history
 * @access Private (Admin only)
 */
router.get('/events',
  // Note: This would typically require admin authentication
  // authMiddleware.authenticate,
  // authMiddleware.requireAdmin,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.webhookEventsQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      provider,
      eventType,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sort = '-createdAt'
    } = req.query;
    
    const filters = {};
    if (provider) filters.provider = provider;
    if (eventType) filters.eventType = eventType;
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
    
    const result = await webhookController.getWebhookEvents(filters, options);
    
    logger.info('Webhook events retrieved', {
      filters,
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

module.exports = router;