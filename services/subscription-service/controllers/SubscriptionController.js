const { User, Plan, Subscription } = require('../models');
const { Logger } = require('../../../shared/utils/logger');
const { ValidationError, NotFoundError, ConflictError, PaymentError } = require('../../../shared/utils/errors');
const { PaymentGateway } = require('../../../shared/services/payment');
const { NotificationService } = require('../../../shared/services/notification');
const { CacheService } = require('../../../shared/services/cache');
const { EventEmitter } = require('../../../shared/services/events');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

class SubscriptionController {
  constructor() {
    this.logger = new Logger('subscription-controller');
    this.paymentGateway = new PaymentGateway();
    this.notificationService = new NotificationService();
    this.cacheService = new CacheService();
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Get all subscriptions for a user
   */
  async getSubscriptions(req, res) {
    try {
      const { userId } = req.user;
      const { status, plan, page = 1, limit = 10, sort = '-createdAt' } = req.query;

      const query = { userId };
      if (status) query.status = status;
      if (plan) query.planId = plan;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort,
        populate: [
          { path: 'planId', select: 'name slug type category pricing features limits' },
          { path: 'userId', select: 'email username profile.firstName profile.lastName' }
        ]
      };

      const subscriptions = await Subscription.paginate(query, options);

      this.logger.info('Subscriptions retrieved', {
        userId,
        count: subscriptions.docs.length,
        total: subscriptions.totalDocs
      });

      res.json({
        success: true,
        data: subscriptions.docs,
        pagination: {
          page: subscriptions.page,
          pages: subscriptions.totalPages,
          total: subscriptions.totalDocs,
          limit: subscriptions.limit
        }
      });
    } catch (error) {
      this.logger.error('Error retrieving subscriptions', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Get current active subscription
   */
  async getCurrentSubscription(req, res) {
    try {
      const { userId } = req.user;

      const subscription = await Subscription.findOne({
        userId,
        status: { $in: ['active', 'trialing', 'past_due'] }
      })
      .populate('planId', 'name slug type category pricing features limits')
      .populate('userId', 'email username profile.firstName profile.lastName');

      if (!subscription) {
        return res.json({
          success: true,
          data: null,
          message: 'No active subscription found'
        });
      }

      // Add computed fields
      const subscriptionData = subscription.toObject();
      subscriptionData.daysUntilRenewal = subscription.daysUntilRenewal;
      subscriptionData.isActive = subscription.isActive;
      subscriptionData.canUpgrade = await subscription.canUpgrade();
      subscriptionData.canDowngrade = await subscription.canDowngrade();

      this.logger.info('Current subscription retrieved', {
        userId,
        subscriptionId: subscription._id,
        status: subscription.status
      });

      res.json({
        success: true,
        data: subscriptionData
      });
    } catch (error) {
      this.logger.error('Error retrieving current subscription', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const subscription = await Subscription.findOne({ _id: id, userId })
        .populate('planId', 'name slug type category pricing features limits')
        .populate('userId', 'email username profile.firstName profile.lastName');

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      // Add computed fields
      const subscriptionData = subscription.toObject();
      subscriptionData.daysUntilRenewal = subscription.daysUntilRenewal;
      subscriptionData.isActive = subscription.isActive;
      subscriptionData.canUpgrade = await subscription.canUpgrade();
      subscriptionData.canDowngrade = await subscription.canDowngrade();

      this.logger.info('Subscription retrieved', {
        userId,
        subscriptionId: subscription._id
      });

      res.json({
        success: true,
        data: subscriptionData
      });
    } catch (error) {
      this.logger.error('Error retrieving subscription', { error: error.message, subscriptionId: req.params.id });
      throw error;
    }
  }

  /**
   * Create new subscription
   */
  async createSubscription(req, res) {
    try {
      const { userId } = req.user;
      const { planId, paymentMethodId, billingCycle = 'monthly', couponCode, source } = req.body;

      // Check if user already has an active subscription
      const existingSubscription = await Subscription.findActiveByUserId(userId);
      if (existingSubscription) {
        throw new ConflictError('User already has an active subscription');
      }

      // Validate plan
      const plan = await Plan.findById(planId);
      if (!plan || !plan.isActive) {
        throw new NotFoundError('Plan not found or inactive');
      }

      // Calculate pricing
      const pricing = plan.pricing[billingCycle];
      if (!pricing) {
        throw new ValidationError(`Billing cycle '${billingCycle}' not available for this plan`);
      }

      let amount = pricing.amount;
      let discount = null;

      // Apply coupon if provided
      if (couponCode) {
        // Validate and apply coupon logic here
        // This would integrate with a coupon service
      }

      // Create payment intent
      const paymentIntent = await this.paymentGateway.createPaymentIntent({
        amount: amount,
        currency: pricing.currency,
        paymentMethodId,
        customerId: userId,
        metadata: {
          planId,
          billingCycle,
          subscriptionType: 'new'
        }
      });

      // Create subscription
      const subscriptionData = {
        userId,
        planId,
        status: plan.pricing.trialDays > 0 ? 'trialing' : 'active',
        billing: {
          cycle: billingCycle,
          currency: pricing.currency,
          amount,
          discount,
          nextBillingDate: moment().add(
            plan.pricing.trialDays > 0 ? plan.pricing.trialDays : (billingCycle === 'monthly' ? 1 : 12),
            plan.pricing.trialDays > 0 ? 'days' : (billingCycle === 'monthly' ? 'month' : 'year')
          ).toDate()
        },
        dates: {
          trialStart: plan.pricing.trialDays > 0 ? new Date() : null,
          trialEnd: plan.pricing.trialDays > 0 ? moment().add(plan.pricing.trialDays, 'days').toDate() : null,
          currentPeriodStart: new Date(),
          currentPeriodEnd: moment().add(
            plan.pricing.trialDays > 0 ? plan.pricing.trialDays : (billingCycle === 'monthly' ? 1 : 12),
            plan.pricing.trialDays > 0 ? 'days' : (billingCycle === 'monthly' ? 'month' : 'year')
          ).toDate()
        },
        paymentMethod: {
          id: paymentMethodId,
          type: 'card' // This would be determined from payment method
        },
        gateway: {
          stripe: {
            customerId: paymentIntent.customerId,
            subscriptionId: paymentIntent.subscriptionId,
            paymentIntentId: paymentIntent.id
          }
        },
        metadata: {
          source: source || 'web',
          createdBy: userId
        }
      };

      const subscription = new Subscription(subscriptionData);
      await subscription.save();

      // Update user's current subscription
      await User.findByIdAndUpdate(userId, {
        'subscription.currentSubscriptionId': subscription._id,
        'subscription.currentPlanId': planId,
        'subscription.status': subscription.status
      });

      // Emit events
      this.eventEmitter.emit('subscription.created', {
        subscription,
        user: req.user,
        plan
      });

      // Send notification
      await this.notificationService.sendSubscriptionCreated({
        userId,
        subscription,
        plan
      });

      this.logger.info('Subscription created', {
        userId,
        subscriptionId: subscription._id,
        planId,
        amount,
        billingCycle
      });

      res.status(201).json({
        success: true,
        data: subscription,
        message: 'Subscription created successfully'
      });
    } catch (error) {
      this.logger.error('Error creating subscription', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Update subscription
   */
  async updateSubscription(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const updates = req.body;

      const subscription = await Subscription.findOne({ _id: id, userId });
      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      // Validate updates
      const allowedUpdates = ['metadata', 'notifications', 'autoRenew'];
      const updateKeys = Object.keys(updates);
      const isValidUpdate = updateKeys.every(key => allowedUpdates.includes(key));

      if (!isValidUpdate) {
        throw new ValidationError('Invalid update fields');
      }

      // Apply updates
      Object.keys(updates).forEach(key => {
        if (key === 'metadata') {
          subscription.metadata = { ...subscription.metadata, ...updates[key] };
        } else {
          subscription[key] = updates[key];
        }
      });

      subscription.updatedAt = new Date();
      await subscription.save();

      this.logger.info('Subscription updated', {
        userId,
        subscriptionId: subscription._id,
        updates: updateKeys
      });

      res.json({
        success: true,
        data: subscription,
        message: 'Subscription updated successfully'
      });
    } catch (error) {
      this.logger.error('Error updating subscription', { error: error.message, subscriptionId: req.params.id });
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const { reason, feedback, cancelAtPeriodEnd = true } = req.body;

      const subscription = await Subscription.findOne({ _id: id, userId })
        .populate('planId', 'name slug');

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      if (!subscription.isActive) {
        throw new ConflictError('Subscription is not active');
      }

      // Cancel with payment gateway
      if (subscription.gateway.stripe?.subscriptionId) {
        await this.paymentGateway.cancelSubscription({
          subscriptionId: subscription.gateway.stripe.subscriptionId,
          cancelAtPeriodEnd
        });
      }

      // Update subscription
      subscription.status = cancelAtPeriodEnd ? 'cancel_at_period_end' : 'canceled';
      subscription.cancellation = {
        canceledAt: new Date(),
        reason: reason || 'user_requested',
        feedback,
        cancelAtPeriodEnd,
        canceledBy: userId
      };

      if (!cancelAtPeriodEnd) {
        subscription.dates.canceledAt = new Date();
        subscription.autoRenew = false;
      }

      await subscription.save();

      // Update user status if immediately canceled
      if (!cancelAtPeriodEnd) {
        await User.findByIdAndUpdate(userId, {
          'subscription.status': 'canceled'
        });
      }

      // Emit events
      this.eventEmitter.emit('subscription.canceled', {
        subscription,
        user: req.user,
        reason,
        immediate: !cancelAtPeriodEnd
      });

      // Send notification
      await this.notificationService.sendSubscriptionCanceled({
        userId,
        subscription,
        reason,
        cancelAtPeriodEnd
      });

      this.logger.info('Subscription canceled', {
        userId,
        subscriptionId: subscription._id,
        reason,
        cancelAtPeriodEnd
      });

      res.json({
        success: true,
        data: subscription,
        message: cancelAtPeriodEnd 
          ? 'Subscription will be canceled at the end of the current period'
          : 'Subscription canceled immediately'
      });
    } catch (error) {
      this.logger.error('Error canceling subscription', { error: error.message, subscriptionId: req.params.id });
      throw error;
    }
  }

  /**
   * Pause subscription
   */
  async pauseSubscription(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const { reason, pauseUntil } = req.body;

      const subscription = await Subscription.findOne({ _id: id, userId });
      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      if (subscription.status !== 'active') {
        throw new ConflictError('Only active subscriptions can be paused');
      }

      // Pause with payment gateway
      if (subscription.gateway.stripe?.subscriptionId) {
        await this.paymentGateway.pauseSubscription({
          subscriptionId: subscription.gateway.stripe.subscriptionId,
          pauseUntil
        });
      }

      subscription.status = 'paused';
      subscription.pause = {
        pausedAt: new Date(),
        pauseUntil: pauseUntil ? new Date(pauseUntil) : null,
        reason: reason || 'user_requested',
        pausedBy: userId
      };

      await subscription.save();

      // Update user status
      await User.findByIdAndUpdate(userId, {
        'subscription.status': 'paused'
      });

      this.logger.info('Subscription paused', {
        userId,
        subscriptionId: subscription._id,
        reason,
        pauseUntil
      });

      res.json({
        success: true,
        data: subscription,
        message: 'Subscription paused successfully'
      });
    } catch (error) {
      this.logger.error('Error pausing subscription', { error: error.message, subscriptionId: req.params.id });
      throw error;
    }
  }

  /**
   * Resume subscription
   */
  async resumeSubscription(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const subscription = await Subscription.findOne({ _id: id, userId });
      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      if (subscription.status !== 'paused') {
        throw new ConflictError('Only paused subscriptions can be resumed');
      }

      // Resume with payment gateway
      if (subscription.gateway.stripe?.subscriptionId) {
        await this.paymentGateway.resumeSubscription({
          subscriptionId: subscription.gateway.stripe.subscriptionId
        });
      }

      subscription.status = 'active';
      subscription.pause = {
        ...subscription.pause,
        resumedAt: new Date(),
        resumedBy: userId
      };

      await subscription.save();

      // Update user status
      await User.findByIdAndUpdate(userId, {
        'subscription.status': 'active'
      });

      this.logger.info('Subscription resumed', {
        userId,
        subscriptionId: subscription._id
      });

      res.json({
        success: true,
        data: subscription,
        message: 'Subscription resumed successfully'
      });
    } catch (error) {
      this.logger.error('Error resuming subscription', { error: error.message, subscriptionId: req.params.id });
      throw error;
    }
  }

  /**
   * Get subscription usage
   */
  async getUsage(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const { period = 'current' } = req.query;

      const subscription = await Subscription.findOne({ _id: id, userId })
        .populate('planId', 'name limits');

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      const usage = period === 'current' ? subscription.usage.currentPeriod : subscription.usage.lifetime;
      const limits = subscription.planId.limits;

      // Calculate usage percentages
      const usageData = {
        alerts: {
          used: usage.alerts,
          limit: limits.alerts,
          percentage: limits.alerts > 0 ? Math.round((usage.alerts / limits.alerts) * 100) : 0,
          unlimited: limits.alerts === -1
        },
        apiCalls: {
          used: usage.apiCalls,
          limit: limits.apiCalls,
          percentage: limits.apiCalls > 0 ? Math.round((usage.apiCalls / limits.apiCalls) * 100) : 0,
          unlimited: limits.apiCalls === -1
        },
        webhooks: {
          used: usage.webhooks,
          limit: limits.webhooks,
          percentage: limits.webhooks > 0 ? Math.round((usage.webhooks / limits.webhooks) * 100) : 0,
          unlimited: limits.webhooks === -1
        },
        storage: {
          used: usage.storage,
          limit: limits.storage,
          percentage: limits.storage > 0 ? Math.round((usage.storage / limits.storage) * 100) : 0,
          unlimited: limits.storage === -1
        }
      };

      res.json({
        success: true,
        data: {
          period,
          usage: usageData,
          resetDate: subscription.dates.currentPeriodEnd
        }
      });
    } catch (error) {
      this.logger.error('Error retrieving usage', { error: error.message, subscriptionId: req.params.id });
      throw error;
    }
  }

  /**
   * Increment usage
   */
  async incrementUsage(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const { metric, amount = 1 } = req.body;

      const subscription = await Subscription.findOne({ _id: id, userId })
        .populate('planId', 'limits');

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      const result = await subscription.incrementUsage(metric, amount);

      if (!result.success) {
        throw new ValidationError(result.message);
      }

      res.json({
        success: true,
        data: {
          metric,
          amount,
          newUsage: result.newUsage,
          limit: result.limit,
          remaining: result.remaining
        },
        message: 'Usage updated successfully'
      });
    } catch (error) {
      this.logger.error('Error incrementing usage', { error: error.message, subscriptionId: req.params.id });
      throw error;
    }
  }
}

module.exports = SubscriptionController;