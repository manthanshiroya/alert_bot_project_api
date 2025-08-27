const express = require('express');
const { AuthMiddleware, ValidationMiddleware, ErrorHandler } = require('../../../shared/middleware');
const { Logger } = require('../../../shared/utils/logger');
const { User, Plan, Subscription } = require('../models');
const SubscriptionController = require('../controllers/SubscriptionController');
const router = express.Router();

// Initialize dependencies
const logger = new Logger('subscription-routes');
const authMiddleware = new AuthMiddleware(logger);
const validationMiddleware = new ValidationMiddleware();
const errorHandler = new ErrorHandler(logger);
const subscriptionController = new SubscriptionController();

/**
 * @route GET /api/v1/subscriptions
 * @desc Get user's subscriptions
 * @access Private
 */
router.get('/',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  errorHandler.asyncWrapper(async (req, res) => {
    const { page = 1, limit = 10, status, planId } = req.query;
    
    const filters = { userId: req.user.id };
    if (status) filters.status = status;
    if (planId) filters.planId = planId;
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'planId', select: 'name slug type pricing features limits' }
      ]
    };
    
    const result = await subscriptionController.getSubscriptions(filters, options);
    
    logger.info('User subscriptions retrieved', {
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
 * @route GET /api/v1/subscriptions/current
 * @desc Get user's current active subscription
 * @access Private
 */
router.get('/current',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  errorHandler.asyncWrapper(async (req, res) => {
    const subscription = await subscriptionController.getCurrentSubscription(req.user.id);
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }
    
    logger.info('Current subscription retrieved', {
      userId: req.user.id,
      subscriptionId: subscription.id,
      planId: subscription.planId
    });
    
    res.json({
      success: true,
      data: subscription
    });
  })
);

/**
 * @route GET /api/v1/subscriptions/:id
 * @desc Get specific subscription by ID
 * @access Private
 */
router.get('/:id',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const subscription = await subscriptionController.getSubscriptionById(
      req.params.id,
      req.user.id
    );
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }
    
    logger.info('Subscription retrieved', {
      userId: req.user.id,
      subscriptionId: subscription.id
    });
    
    res.json({
      success: true,
      data: subscription
    });
  })
);

/**
 * @route POST /api/v1/subscriptions
 * @desc Create new subscription
 * @access Private
 */
router.post('/',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.subscriptionCreate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const subscriptionData = {
      ...req.body,
      userId: req.user.id
    };
    
    const subscription = await subscriptionController.createSubscription(subscriptionData);
    
    logger.info('Subscription created', {
      userId: req.user.id,
      subscriptionId: subscription.id,
      planId: subscription.planId
    });
    
    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: subscription
    });
  })
);

/**
 * @route PUT /api/v1/subscriptions/:id
 * @desc Update subscription
 * @access Private
 */
router.put('/:id',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.subscriptionUpdate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const subscription = await subscriptionController.updateSubscription(
      req.params.id,
      req.user.id,
      req.body
    );
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }
    
    logger.info('Subscription updated', {
      userId: req.user.id,
      subscriptionId: subscription.id,
      changes: Object.keys(req.body)
    });
    
    res.json({
      success: true,
      message: 'Subscription updated successfully',
      data: subscription
    });
  })
);

/**
 * @route POST /api/v1/subscriptions/:id/upgrade
 * @desc Upgrade subscription to a higher plan
 * @access Private
 */
router.post('/:id/upgrade',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.subscriptionUpgrade
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { newPlanId, billingCycle, promoCode } = req.body;
    
    const result = await subscriptionController.upgradeSubscription(
      req.params.id,
      req.user.id,
      newPlanId,
      billingCycle,
      promoCode
    );
    
    logger.info('Subscription upgraded', {
      userId: req.user.id,
      subscriptionId: req.params.id,
      newPlanId,
      billingCycle
    });
    
    res.json({
      success: true,
      message: 'Subscription upgraded successfully',
      data: result
    });
  })
);

/**
 * @route POST /api/v1/subscriptions/:id/downgrade
 * @desc Downgrade subscription to a lower plan
 * @access Private
 */
router.post('/:id/downgrade',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.subscriptionDowngrade
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { newPlanId, billingCycle, effectiveDate } = req.body;
    
    const result = await subscriptionController.downgradeSubscription(
      req.params.id,
      req.user.id,
      newPlanId,
      billingCycle,
      effectiveDate
    );
    
    logger.info('Subscription downgraded', {
      userId: req.user.id,
      subscriptionId: req.params.id,
      newPlanId,
      effectiveDate
    });
    
    res.json({
      success: true,
      message: 'Subscription downgraded successfully',
      data: result
    });
  })
);

/**
 * @route POST /api/v1/subscriptions/:id/cancel
 * @desc Cancel subscription
 * @access Private
 */
router.post('/:id/cancel',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.subscriptionCancel
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { reason, feedback, cancelAtPeriodEnd = true } = req.body;
    
    const subscription = await subscriptionController.cancelSubscription(
      req.params.id,
      req.user.id,
      reason,
      feedback,
      cancelAtPeriodEnd
    );
    
    logger.info('Subscription canceled', {
      userId: req.user.id,
      subscriptionId: req.params.id,
      reason,
      cancelAtPeriodEnd
    });
    
    res.json({
      success: true,
      message: 'Subscription canceled successfully',
      data: subscription
    });
  })
);

/**
 * @route POST /api/v1/subscriptions/:id/pause
 * @desc Pause subscription
 * @access Private
 */
router.post('/:id/pause',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const subscription = await subscriptionController.pauseSubscription(
      req.params.id,
      req.user.id
    );
    
    logger.info('Subscription paused', {
      userId: req.user.id,
      subscriptionId: req.params.id
    });
    
    res.json({
      success: true,
      message: 'Subscription paused successfully',
      data: subscription
    });
  })
);

/**
 * @route POST /api/v1/subscriptions/:id/resume
 * @desc Resume paused subscription
 * @access Private
 */
router.post('/:id/resume',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const subscription = await subscriptionController.resumeSubscription(
      req.params.id,
      req.user.id
    );
    
    logger.info('Subscription resumed', {
      userId: req.user.id,
      subscriptionId: req.params.id
    });
    
    res.json({
      success: true,
      message: 'Subscription resumed successfully',
      data: subscription
    });
  })
);

/**
 * @route GET /api/v1/subscriptions/:id/usage
 * @desc Get subscription usage statistics
 * @access Private
 */
router.get('/:id/usage',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const usage = await subscriptionController.getSubscriptionUsage(
      req.params.id,
      req.user.id
    );
    
    if (!usage) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }
    
    logger.info('Subscription usage retrieved', {
      userId: req.user.id,
      subscriptionId: req.params.id
    });
    
    res.json({
      success: true,
      data: usage
    });
  })
);

/**
 * @route POST /api/v1/subscriptions/:id/usage/increment
 * @desc Increment usage for a specific metric
 * @access Private
 */
router.post('/:id/usage/increment',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.usageIncrement
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { metric, amount = 1 } = req.body;
    
    const result = await subscriptionController.incrementUsage(
      req.params.id,
      req.user.id,
      metric,
      amount
    );
    
    logger.info('Usage incremented', {
      userId: req.user.id,
      subscriptionId: req.params.id,
      metric,
      amount
    });
    
    res.json({
      success: true,
      message: 'Usage updated successfully',
      data: result
    });
  })
);

/**
 * @route GET /api/v1/subscriptions/:id/invoices
 * @desc Get subscription invoices
 * @access Private
 */
router.get('/:id/invoices',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    query: validationMiddleware.schemas.pagination
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    
    const invoices = await subscriptionController.getSubscriptionInvoices(
      req.params.id,
      req.user.id,
      { page: parseInt(page), limit: parseInt(limit) }
    );
    
    logger.info('Subscription invoices retrieved', {
      userId: req.user.id,
      subscriptionId: req.params.id,
      count: invoices.length
    });
    
    res.json({
      success: true,
      data: invoices
    });
  })
);

/**
 * @route POST /api/v1/subscriptions/:id/payment-method
 * @desc Update subscription payment method
 * @access Private
 */
router.post('/:id/payment-method',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.paymentMethodUpdate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const subscription = await subscriptionController.updatePaymentMethod(
      req.params.id,
      req.user.id,
      req.body
    );
    
    logger.info('Payment method updated', {
      userId: req.user.id,
      subscriptionId: req.params.id
    });
    
    res.json({
      success: true,
      message: 'Payment method updated successfully',
      data: subscription
    });
  })
);

/**
 * @route GET /api/v1/subscriptions/:id/preview-change
 * @desc Preview subscription change (upgrade/downgrade)
 * @access Private
 */
router.get('/:id/preview-change',
  authMiddleware.authenticate,
  authMiddleware.checkActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    query: validationMiddleware.schemas.subscriptionPreview
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { newPlanId, billingCycle, promoCode } = req.query;
    
    const preview = await subscriptionController.previewSubscriptionChange(
      req.params.id,
      req.user.id,
      newPlanId,
      billingCycle,
      promoCode
    );
    
    logger.info('Subscription change previewed', {
      userId: req.user.id,
      subscriptionId: req.params.id,
      newPlanId
    });
    
    res.json({
      success: true,
      data: preview
    });
  })
);

module.exports = router;