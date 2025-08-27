const express = require('express');
const { AuthMiddleware, ValidationMiddleware, ErrorHandler } = require('../../../shared/middleware');
const { Logger } = require('../../../shared/utils/logger');
const { Plan } = require('../models');
const PlanController = require('../controllers/PlanController');
const router = express.Router();

// Initialize dependencies
const logger = new Logger('plan-routes');
const authMiddleware = new AuthMiddleware(logger);
const validationMiddleware = new ValidationMiddleware();
const errorHandler = new ErrorHandler(logger);
const planController = new PlanController();

/**
 * @route GET /api/v1/plans
 * @desc Get all available plans
 * @access Public
 */
router.get('/',
  validationMiddleware.validate({
    query: validationMiddleware.schemas.planQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      type,
      category,
      status = 'active',
      isPublic = true,
      page = 1,
      limit = 20,
      sort = 'sortOrder'
    } = req.query;
    
    const filters = { status };
    if (type) filters.type = type;
    if (category) filters.category = category;
    if (isPublic !== undefined) filters.isPublic = isPublic === 'true';
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: sort === 'price_asc' ? { 'pricing.monthly.amount': 1 } :
            sort === 'price_desc' ? { 'pricing.monthly.amount': -1 } :
            sort === 'name' ? { name: 1 } :
            { sortOrder: 1, createdAt: 1 }
    };
    
    const result = await planController.getPlans(filters, options);
    
    logger.info('Plans retrieved', {
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

/**
 * @route GET /api/v1/plans/public
 * @desc Get all public plans (for pricing page)
 * @access Public
 */
router.get('/public',
  errorHandler.asyncWrapper(async (req, res) => {
    const plans = await planController.getPublicPlans();
    
    logger.info('Public plans retrieved', {
      count: plans.length
    });
    
    res.json({
      success: true,
      data: plans
    });
  })
);

/**
 * @route GET /api/v1/plans/featured
 * @desc Get featured/recommended plans
 * @access Public
 */
router.get('/featured',
  errorHandler.asyncWrapper(async (req, res) => {
    const plans = await planController.getFeaturedPlans();
    
    logger.info('Featured plans retrieved', {
      count: plans.length
    });
    
    res.json({
      success: true,
      data: plans
    });
  })
);

/**
 * @route GET /api/v1/plans/compare
 * @desc Compare multiple plans
 * @access Public
 */
router.get('/compare',
  validationMiddleware.validate({
    query: validationMiddleware.schemas.planCompare
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { planIds } = req.query;
    const planIdArray = Array.isArray(planIds) ? planIds : [planIds];
    
    const comparison = await planController.comparePlans(planIdArray);
    
    logger.info('Plans compared', {
      planIds: planIdArray,
      count: comparison.plans.length
    });
    
    res.json({
      success: true,
      data: comparison
    });
  })
);

/**
 * @route GET /api/v1/plans/:identifier
 * @desc Get plan by ID or slug
 * @access Public
 */
router.get('/:identifier',
  validationMiddleware.validate({
    params: validationMiddleware.schemas.planIdentifier
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { identifier } = req.params;
    const { includePrivate = false } = req.query;
    
    const plan = await planController.getPlanByIdentifier(
      identifier,
      includePrivate === 'true'
    );
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    logger.info('Plan retrieved', {
      planId: plan.id,
      identifier
    });
    
    res.json({
      success: true,
      data: plan
    });
  })
);

/**
 * @route POST /api/v1/plans
 * @desc Create new plan
 * @access Private (Admin only)
 */
router.post('/',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.planCreate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const plan = await planController.createPlan(req.body);
    
    logger.info('Plan created', {
      planId: plan.id,
      name: plan.name,
      createdBy: req.user.id
    });
    
    res.status(201).json({
      success: true,
      message: 'Plan created successfully',
      data: plan
    });
  })
);

/**
 * @route PUT /api/v1/plans/:id
 * @desc Update plan
 * @access Private (Admin only)
 */
router.put('/:id',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.planUpdate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const plan = await planController.updatePlan(req.params.id, req.body);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    logger.info('Plan updated', {
      planId: plan.id,
      changes: Object.keys(req.body),
      updatedBy: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Plan updated successfully',
      data: plan
    });
  })
);

/**
 * @route DELETE /api/v1/plans/:id
 * @desc Delete plan
 * @access Private (Admin only)
 */
router.delete('/:id',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const result = await planController.deletePlan(req.params.id);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    logger.info('Plan deleted', {
      planId: req.params.id,
      deletedBy: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Plan deleted successfully'
    });
  })
);

/**
 * @route PATCH /api/v1/plans/:id/status
 * @desc Update plan status
 * @access Private (Admin only)
 */
router.patch('/:id/status',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.planStatusUpdate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { status } = req.body;
    
    const plan = await planController.updatePlanStatus(req.params.id, status);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    logger.info('Plan status updated', {
      planId: plan.id,
      newStatus: status,
      updatedBy: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Plan status updated successfully',
      data: plan
    });
  })
);

/**
 * @route PATCH /api/v1/plans/:id/pricing
 * @desc Update plan pricing
 * @access Private (Admin only)
 */
router.patch('/:id/pricing',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.planPricingUpdate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const plan = await planController.updatePlanPricing(req.params.id, req.body);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    logger.info('Plan pricing updated', {
      planId: plan.id,
      updatedBy: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Plan pricing updated successfully',
      data: plan
    });
  })
);

/**
 * @route PATCH /api/v1/plans/:id/features
 * @desc Update plan features
 * @access Private (Admin only)
 */
router.patch('/:id/features',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.planFeaturesUpdate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const plan = await planController.updatePlanFeatures(req.params.id, req.body);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    logger.info('Plan features updated', {
      planId: plan.id,
      updatedBy: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Plan features updated successfully',
      data: plan
    });
  })
);

/**
 * @route PATCH /api/v1/plans/:id/limits
 * @desc Update plan limits
 * @access Private (Admin only)
 */
router.patch('/:id/limits',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.planLimitsUpdate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const plan = await planController.updatePlanLimits(req.params.id, req.body);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    logger.info('Plan limits updated', {
      planId: plan.id,
      updatedBy: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Plan limits updated successfully',
      data: plan
    });
  })
);

/**
 * @route POST /api/v1/plans/:id/duplicate
 * @desc Duplicate plan
 * @access Private (Admin only)
 */
router.post('/:id/duplicate',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.planDuplicate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { name, slug } = req.body;
    
    const newPlan = await planController.duplicatePlan(req.params.id, name, slug);
    
    if (!newPlan) {
      return res.status(404).json({
        success: false,
        message: 'Original plan not found'
      });
    }
    
    logger.info('Plan duplicated', {
      originalPlanId: req.params.id,
      newPlanId: newPlan.id,
      newName: name,
      createdBy: req.user.id
    });
    
    res.status(201).json({
      success: true,
      message: 'Plan duplicated successfully',
      data: newPlan
    });
  })
);

/**
 * @route GET /api/v1/plans/:id/subscribers
 * @desc Get plan subscribers count
 * @access Private (Admin only)
 */
router.get('/:id/subscribers',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const stats = await planController.getPlanSubscriberStats(req.params.id);
    
    if (!stats) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    logger.info('Plan subscriber stats retrieved', {
      planId: req.params.id,
      totalSubscribers: stats.totalSubscribers
    });
    
    res.json({
      success: true,
      data: stats
    });
  })
);

/**
 * @route GET /api/v1/plans/:id/revenue
 * @desc Get plan revenue statistics
 * @access Private (Admin only)
 */
router.get('/:id/revenue',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    query: validationMiddleware.schemas.dateRange
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { startDate, endDate } = req.query;
    
    const revenue = await planController.getPlanRevenue(
      req.params.id,
      startDate,
      endDate
    );
    
    if (!revenue) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    logger.info('Plan revenue retrieved', {
      planId: req.params.id,
      totalRevenue: revenue.totalRevenue
    });
    
    res.json({
      success: true,
      data: revenue
    });
  })
);

/**
 * @route POST /api/v1/plans/bulk-update
 * @desc Bulk update multiple plans
 * @access Private (Admin only)
 */
router.post('/bulk-update',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.planBulkUpdate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { planIds, updates } = req.body;
    
    const result = await planController.bulkUpdatePlans(planIds, updates);
    
    logger.info('Plans bulk updated', {
      planIds,
      updatedCount: result.modifiedCount,
      updatedBy: req.user.id
    });
    
    res.json({
      success: true,
      message: `${result.modifiedCount} plans updated successfully`,
      data: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      }
    });
  })
);

/**
 * @route GET /api/v1/plans/analytics/overview
 * @desc Get plans analytics overview
 * @access Private (Admin only)
 */
router.get('/analytics/overview',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  errorHandler.asyncWrapper(async (req, res) => {
    const analytics = await planController.getPlansAnalytics();
    
    logger.info('Plans analytics retrieved', {
      totalPlans: analytics.totalPlans,
      requestedBy: req.user.id
    });
    
    res.json({
      success: true,
      data: analytics
    });
  })
);

module.exports = router;