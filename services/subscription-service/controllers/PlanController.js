const { Plan, Subscription, User } = require('../models');
const { Logger } = require('../../../shared/utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../../../shared/utils/errors');
const { CacheService } = require('../../../shared/services/cache');
const { EventEmitter } = require('../../../shared/services/events');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

class PlanController {
  constructor() {
    this.logger = new Logger('plan-controller');
    this.cacheService = new CacheService();
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Get all plans (public)
   */
  async getPlans(req, res) {
    try {
      const { 
        type, 
        category, 
        status = 'active', 
        public: isPublic = true,
        sort = 'sortOrder',
        page = 1,
        limit = 20
      } = req.query;

      // Build query
      const query = {};
      if (type) query.type = type;
      if (category) query.category = category;
      if (status) query.status = status;
      if (isPublic !== undefined) query.isPublic = isPublic === 'true';

      // Cache key for public plans
      const cacheKey = `plans:${JSON.stringify(query)}:${sort}:${page}:${limit}`;
      
      // Try to get from cache first
      let result = await this.cacheService.get(cacheKey);
      
      if (!result) {
        const options = {
          page: parseInt(page),
          limit: parseInt(limit),
          sort,
          select: '-__v'
        };

        result = await Plan.paginate(query, options);
        
        // Cache for 5 minutes
        await this.cacheService.set(cacheKey, result, 300);
      }

      this.logger.info('Plans retrieved', {
        query,
        count: result.docs.length,
        total: result.totalDocs
      });

      res.json({
        success: true,
        data: result.docs,
        pagination: {
          page: result.page,
          pages: result.totalPages,
          total: result.totalDocs,
          limit: result.limit
        }
      });
    } catch (error) {
      this.logger.error('Error retrieving plans', { error: error.message });
      throw error;
    }
  }

  /**
   * Get public plans only
   */
  async getPublicPlans(req, res) {
    try {
      const { type, category, sort = 'sortOrder' } = req.query;

      const query = {
        status: 'active',
        isPublic: true
      };

      if (type) query.type = type;
      if (category) query.category = category;

      const cacheKey = `public-plans:${JSON.stringify(query)}:${sort}`;
      let plans = await this.cacheService.get(cacheKey);

      if (!plans) {
        plans = await Plan.find(query)
          .select('-__v -metadata.internalNotes')
          .sort(sort)
          .lean();

        // Add computed fields
        plans = plans.map(plan => ({
          ...plan,
          yearlySavings: plan.yearlySavings,
          effectiveMonthlyPrice: plan.effectiveMonthlyPrice
        }));

        // Cache for 10 minutes
        await this.cacheService.set(cacheKey, plans, 600);
      }

      this.logger.info('Public plans retrieved', {
        count: plans.length,
        type,
        category
      });

      res.json({
        success: true,
        data: plans
      });
    } catch (error) {
      this.logger.error('Error retrieving public plans', { error: error.message });
      throw error;
    }
  }

  /**
   * Get featured plans
   */
  async getFeaturedPlans(req, res) {
    try {
      const cacheKey = 'featured-plans';
      let plans = await this.cacheService.get(cacheKey);

      if (!plans) {
        plans = await Plan.find({
          status: 'active',
          isPublic: true,
          'metadata.featured': true
        })
        .select('-__v -metadata.internalNotes')
        .sort('sortOrder')
        .lean();

        // Add computed fields
        plans = plans.map(plan => ({
          ...plan,
          yearlySavings: plan.yearlySavings,
          effectiveMonthlyPrice: plan.effectiveMonthlyPrice
        }));

        // Cache for 15 minutes
        await this.cacheService.set(cacheKey, plans, 900);
      }

      this.logger.info('Featured plans retrieved', { count: plans.length });

      res.json({
        success: true,
        data: plans
      });
    } catch (error) {
      this.logger.error('Error retrieving featured plans', { error: error.message });
      throw error;
    }
  }

  /**
   * Compare plans
   */
  async comparePlans(req, res) {
    try {
      const { planIds } = req.query;

      if (!planIds || !Array.isArray(planIds) || planIds.length < 2) {
        throw new ValidationError('At least 2 plan IDs are required for comparison');
      }

      if (planIds.length > 5) {
        throw new ValidationError('Maximum 5 plans can be compared at once');
      }

      const plans = await Plan.find({
        _id: { $in: planIds },
        status: 'active',
        isPublic: true
      })
      .select('-__v -metadata.internalNotes')
      .lean();

      if (plans.length !== planIds.length) {
        throw new NotFoundError('One or more plans not found or not public');
      }

      // Add computed fields and comparison data
      const comparison = plans.map(plan => {
        const planData = {
          ...plan,
          yearlySavings: plan.yearlySavings,
          effectiveMonthlyPrice: plan.effectiveMonthlyPrice
        };

        // Add feature comparison flags
        planData.comparisonData = {
          hasBasicAlerts: plan.features.basicAlerts,
          hasAdvancedAlerts: plan.features.advancedAlerts,
          hasEmailNotifications: plan.features.notifications.email,
          hasSmsNotifications: plan.features.notifications.sms,
          hasPushNotifications: plan.features.notifications.push,
          hasWebhookNotifications: plan.features.notifications.webhook,
          hasApiAccess: plan.features.apiAccess.enabled,
          hasAnalytics: plan.features.analytics.enabled,
          hasCustomBranding: plan.features.customBranding,
          hasPrioritySupport: plan.features.prioritySupport,
          hasMultiUser: plan.features.multiUser
        };

        return planData;
      });

      // Sort by price for better comparison
      comparison.sort((a, b) => a.pricing.monthly.amount - b.pricing.monthly.amount);

      this.logger.info('Plans compared', {
        planIds,
        count: comparison.length
      });

      res.json({
        success: true,
        data: {
          plans: comparison,
          comparisonMatrix: this._generateComparisonMatrix(comparison)
        }
      });
    } catch (error) {
      this.logger.error('Error comparing plans', { error: error.message, planIds: req.query.planIds });
      throw error;
    }
  }

  /**
   * Get plan by ID or slug
   */
  async getPlan(req, res) {
    try {
      const { identifier } = req.params;
      const { includeStats = false } = req.query;

      // Try to find by ID first, then by slug
      let plan = await Plan.findById(identifier).lean();
      if (!plan) {
        plan = await Plan.findOne({ slug: identifier }).lean();
      }

      if (!plan) {
        throw new NotFoundError('Plan not found');
      }

      // Check if plan is public (for non-admin users)
      if (!req.user?.isAdmin && (!plan.isPublic || plan.status !== 'active')) {
        throw new NotFoundError('Plan not found');
      }

      // Add computed fields
      plan.yearlySavings = plan.yearlySavings;
      plan.effectiveMonthlyPrice = plan.effectiveMonthlyPrice;

      // Include statistics if requested and user is admin
      if (includeStats === 'true' && req.user?.isAdmin) {
        const stats = await this._getPlanStats(plan._id);
        plan.statistics = stats;
      }

      this.logger.info('Plan retrieved', {
        planId: plan._id,
        slug: plan.slug,
        includeStats
      });

      res.json({
        success: true,
        data: plan
      });
    } catch (error) {
      this.logger.error('Error retrieving plan', { error: error.message, identifier: req.params.identifier });
      throw error;
    }
  }

  /**
   * Create new plan (Admin only)
   */
  async createPlan(req, res) {
    try {
      const planData = req.body;

      // Validate required fields
      const requiredFields = ['name', 'type', 'category', 'pricing'];
      for (const field of requiredFields) {
        if (!planData[field]) {
          throw new ValidationError(`${field} is required`);
        }
      }

      // Check if plan with same name exists
      const existingPlan = await Plan.findOne({ name: planData.name });
      if (existingPlan) {
        throw new ConflictError('Plan with this name already exists');
      }

      // Set default values
      planData.status = planData.status || 'active';
      planData.isPublic = planData.isPublic !== undefined ? planData.isPublic : true;
      planData.metadata = {
        ...planData.metadata,
        createdBy: req.user.userId,
        version: 1
      };

      const plan = new Plan(planData);
      await plan.save();

      // Clear cache
      await this._clearPlanCache();

      // Emit event
      this.eventEmitter.emit('plan.created', {
        plan,
        createdBy: req.user
      });

      this.logger.info('Plan created', {
        planId: plan._id,
        name: plan.name,
        createdBy: req.user.userId
      });

      res.status(201).json({
        success: true,
        data: plan,
        message: 'Plan created successfully'
      });
    } catch (error) {
      this.logger.error('Error creating plan', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Update plan (Admin only)
   */
  async updatePlan(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const plan = await Plan.findById(id);
      if (!plan) {
        throw new NotFoundError('Plan not found');
      }

      // Check if name is being changed and if it conflicts
      if (updates.name && updates.name !== plan.name) {
        const existingPlan = await Plan.findOne({ name: updates.name, _id: { $ne: id } });
        if (existingPlan) {
          throw new ConflictError('Plan with this name already exists');
        }
      }

      // Update metadata
      updates.metadata = {
        ...plan.metadata,
        ...updates.metadata,
        updatedBy: req.user.userId,
        version: (plan.metadata.version || 1) + 1
      };

      // Apply updates
      Object.keys(updates).forEach(key => {
        plan[key] = updates[key];
      });

      await plan.save();

      // Clear cache
      await this._clearPlanCache();

      // Emit event
      this.eventEmitter.emit('plan.updated', {
        plan,
        updates,
        updatedBy: req.user
      });

      this.logger.info('Plan updated', {
        planId: plan._id,
        updates: Object.keys(updates),
        updatedBy: req.user.userId
      });

      res.json({
        success: true,
        data: plan,
        message: 'Plan updated successfully'
      });
    } catch (error) {
      this.logger.error('Error updating plan', { error: error.message, planId: req.params.id });
      throw error;
    }
  }

  /**
   * Delete plan (Admin only)
   */
  async deletePlan(req, res) {
    try {
      const { id } = req.params;
      const { force = false } = req.query;

      const plan = await Plan.findById(id);
      if (!plan) {
        throw new NotFoundError('Plan not found');
      }

      // Check if plan has active subscriptions
      const activeSubscriptions = await Subscription.countDocuments({
        planId: id,
        status: { $in: ['active', 'trialing', 'past_due'] }
      });

      if (activeSubscriptions > 0 && !force) {
        throw new ConflictError(
          `Cannot delete plan with ${activeSubscriptions} active subscriptions. Use force=true to override.`
        );
      }

      if (force && activeSubscriptions > 0) {
        // Move active subscriptions to a default plan or cancel them
        // This would require business logic to determine the appropriate action
        this.logger.warn('Force deleting plan with active subscriptions', {
          planId: id,
          activeSubscriptions
        });
      }

      await Plan.findByIdAndDelete(id);

      // Clear cache
      await this._clearPlanCache();

      // Emit event
      this.eventEmitter.emit('plan.deleted', {
        plan,
        deletedBy: req.user,
        force,
        activeSubscriptions
      });

      this.logger.info('Plan deleted', {
        planId: id,
        name: plan.name,
        deletedBy: req.user.userId,
        force
      });

      res.json({
        success: true,
        message: 'Plan deleted successfully'
      });
    } catch (error) {
      this.logger.error('Error deleting plan', { error: error.message, planId: req.params.id });
      throw error;
    }
  }

  /**
   * Duplicate plan (Admin only)
   */
  async duplicatePlan(req, res) {
    try {
      const { id } = req.params;
      const { name, slug } = req.body;

      const originalPlan = await Plan.findById(id);
      if (!originalPlan) {
        throw new NotFoundError('Plan not found');
      }

      // Check if new name/slug conflicts
      if (name) {
        const existingPlan = await Plan.findOne({ name });
        if (existingPlan) {
          throw new ConflictError('Plan with this name already exists');
        }
      }

      if (slug) {
        const existingPlan = await Plan.findOne({ slug });
        if (existingPlan) {
          throw new ConflictError('Plan with this slug already exists');
        }
      }

      // Create duplicate
      const duplicateData = originalPlan.toObject();
      delete duplicateData._id;
      delete duplicateData.createdAt;
      delete duplicateData.updatedAt;
      delete duplicateData.__v;

      duplicateData.name = name || `${originalPlan.name} (Copy)`;
      duplicateData.slug = slug || `${originalPlan.slug}-copy`;
      duplicateData.status = 'draft'; // New plans start as draft
      duplicateData.metadata = {
        ...duplicateData.metadata,
        createdBy: req.user.userId,
        duplicatedFrom: originalPlan._id,
        version: 1
      };

      const duplicatePlan = new Plan(duplicateData);
      await duplicatePlan.save();

      this.logger.info('Plan duplicated', {
        originalPlanId: id,
        duplicatePlanId: duplicatePlan._id,
        createdBy: req.user.userId
      });

      res.status(201).json({
        success: true,
        data: duplicatePlan,
        message: 'Plan duplicated successfully'
      });
    } catch (error) {
      this.logger.error('Error duplicating plan', { error: error.message, planId: req.params.id });
      throw error;
    }
  }

  /**
   * Get plan statistics (Admin only)
   */
  async getPlanStats(req, res) {
    try {
      const { id } = req.params;
      const { period = '30d' } = req.query;

      const plan = await Plan.findById(id);
      if (!plan) {
        throw new NotFoundError('Plan not found');
      }

      const stats = await this._getPlanStats(id, period);

      res.json({
        success: true,
        data: {
          plan: {
            id: plan._id,
            name: plan.name,
            slug: plan.slug
          },
          period,
          statistics: stats
        }
      });
    } catch (error) {
      this.logger.error('Error retrieving plan stats', { error: error.message, planId: req.params.id });
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  async _getPlanStats(planId, period = '30d') {
    const days = parseInt(period.replace('d', ''));
    const startDate = moment().subtract(days, 'days').toDate();

    const [subscriptions, revenue, churn] = await Promise.all([
      // Subscription stats
      Subscription.aggregate([
        { $match: { planId: planId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Revenue stats
      Subscription.aggregate([
        {
          $match: {
            planId: planId,
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$billing.amount' },
            averageRevenue: { $avg: '$billing.amount' },
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Churn stats
      Subscription.aggregate([
        {
          $match: {
            planId: planId,
            'dates.canceledAt': { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            churnCount: { $sum: 1 }
          }
        }
      ])
    ]);

    const subscriptionStats = subscriptions.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    return {
      subscriptions: {
        active: subscriptionStats.active || 0,
        trialing: subscriptionStats.trialing || 0,
        canceled: subscriptionStats.canceled || 0,
        paused: subscriptionStats.paused || 0,
        total: Object.values(subscriptionStats).reduce((sum, count) => sum + count, 0)
      },
      revenue: {
        total: revenue[0]?.totalRevenue || 0,
        average: revenue[0]?.averageRevenue || 0,
        subscriptions: revenue[0]?.count || 0
      },
      churn: {
        count: churn[0]?.churnCount || 0,
        rate: subscriptionStats.active > 0 
          ? Math.round(((churn[0]?.churnCount || 0) / subscriptionStats.active) * 100) 
          : 0
      }
    };
  }

  _generateComparisonMatrix(plans) {
    const features = [
      'basicAlerts', 'advancedAlerts', 'emailNotifications', 'smsNotifications',
      'pushNotifications', 'webhookNotifications', 'apiAccess', 'analytics',
      'customBranding', 'prioritySupport', 'multiUser'
    ];

    const matrix = {};
    features.forEach(feature => {
      matrix[feature] = plans.map(plan => plan.comparisonData[`has${feature.charAt(0).toUpperCase() + feature.slice(1)}`]);
    });

    return matrix;
  }

  async _clearPlanCache() {
    const patterns = ['plans:*', 'public-plans:*', 'featured-plans'];
    for (const pattern of patterns) {
      await this.cacheService.deletePattern(pattern);
    }
  }
}

module.exports = PlanController;