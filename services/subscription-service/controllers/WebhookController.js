const { User, Subscription, Plan } = require('../models');
const { Logger } = require('../../../shared/utils/logger');
const { ValidationError, NotFoundError, AuthenticationError } = require('../../../shared/utils/errors');
const { PaymentGateway } = require('../../../shared/services/payment');
const { NotificationService } = require('../../../shared/services/notification');
const { EventEmitter } = require('../../../shared/services/events');
const { CacheService } = require('../../../shared/services/cache');
const crypto = require('crypto');
const moment = require('moment');

class WebhookController {
  constructor() {
    this.logger = new Logger('webhook-controller');
    this.paymentGateway = new PaymentGateway();
    this.notificationService = new NotificationService();
    this.eventEmitter = new EventEmitter();
    this.cacheService = new CacheService();
    
    // Webhook processing statistics
    this.stats = {
      processed: 0,
      failed: 0,
      retries: 0
    };
  }

  /**
   * Handle Stripe webhooks
   */
  async handleStripeWebhook(req, res) {
    try {
      const signature = req.headers['stripe-signature'];
      const payload = req.body;

      // Verify webhook signature
      const isValid = await this.paymentGateway.verifyStripeWebhook({
        payload,
        signature,
        endpointSecret: process.env.STRIPE_WEBHOOK_SECRET
      });

      if (!isValid) {
        throw new AuthenticationError('Invalid webhook signature');
      }

      const event = JSON.parse(payload);
      
      this.logger.info('Stripe webhook received', {
        type: event.type,
        id: event.id,
        created: event.created
      });

      // Process webhook event
      await this._processStripeEvent(event);

      this.stats.processed++;
      
      res.json({ received: true });
    } catch (error) {
      this.stats.failed++;
      this.logger.error('Error processing Stripe webhook', {
        error: error.message,
        headers: req.headers,
        body: req.body?.substring?.(0, 200)
      });
      
      // Return 200 to prevent Stripe retries for validation errors
      if (error instanceof AuthenticationError || error instanceof ValidationError) {
        res.status(200).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    }
  }

  /**
   * Handle PayPal webhooks
   */
  async handlePayPalWebhook(req, res) {
    try {
      const headers = req.headers;
      const payload = req.body;

      // Verify webhook signature
      const isValid = await this.paymentGateway.verifyPayPalWebhook({
        payload,
        headers,
        webhookId: process.env.PAYPAL_WEBHOOK_ID
      });

      if (!isValid) {
        throw new AuthenticationError('Invalid webhook signature');
      }

      const event = payload;
      
      this.logger.info('PayPal webhook received', {
        type: event.event_type,
        id: event.id,
        created: event.create_time
      });

      // Process webhook event
      await this._processPayPalEvent(event);

      this.stats.processed++;
      
      res.json({ received: true });
    } catch (error) {
      this.stats.failed++;
      this.logger.error('Error processing PayPal webhook', {
        error: error.message,
        headers: req.headers,
        body: req.body
      });
      
      if (error instanceof AuthenticationError || error instanceof ValidationError) {
        res.status(200).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    }
  }

  /**
   * Handle subscription expiration notifications
   */
  async handleSubscriptionExpiration(req, res) {
    try {
      const { subscriptionId, userId, expiresAt } = req.body;

      if (!subscriptionId || !userId) {
        throw new ValidationError('Subscription ID and User ID are required');
      }

      const subscription = await Subscription.findById(subscriptionId)
        .populate('userId', 'email profile.firstName profile.lastName preferences.notifications')
        .populate('planId', 'name slug type');

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      // Check if subscription is actually expiring
      const expirationDate = moment(expiresAt || subscription.dates.currentPeriodEnd);
      const daysUntilExpiration = expirationDate.diff(moment(), 'days');

      if (daysUntilExpiration > 7) {
        this.logger.warn('Subscription expiration notification too early', {
          subscriptionId,
          daysUntilExpiration
        });
        return res.json({ message: 'Notification scheduled for later' });
      }

      // Send expiration notification
      await this.notificationService.sendSubscriptionExpiring({
        userId: subscription.userId._id,
        email: subscription.userId.email,
        subscription: {
          id: subscription._id,
          plan: subscription.planId.name,
          expiresAt: expirationDate.toDate()
        },
        daysUntilExpiration
      });

      // Emit event
      this.eventEmitter.emit('subscription.expiring', {
        subscription,
        daysUntilExpiration,
        notifiedAt: new Date()
      });

      this.logger.info('Subscription expiration notification sent', {
        subscriptionId,
        userId,
        daysUntilExpiration
      });

      res.json({
        success: true,
        message: 'Expiration notification sent'
      });
    } catch (error) {
      this.logger.error('Error handling subscription expiration', {
        error: error.message,
        body: req.body
      });
      throw error;
    }
  }

  /**
   * Handle payment failure notifications
   */
  async handlePaymentFailure(req, res) {
    try {
      const { subscriptionId, userId, paymentIntentId, error: paymentError } = req.body;

      if (!subscriptionId || !userId) {
        throw new ValidationError('Subscription ID and User ID are required');
      }

      const subscription = await Subscription.findById(subscriptionId)
        .populate('userId', 'email profile.firstName profile.lastName')
        .populate('planId', 'name slug');

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      // Update subscription status
      subscription.status = 'past_due';
      subscription.billing.lastPaymentError = {
        code: paymentError?.code,
        message: paymentError?.message,
        occurredAt: new Date()
      };
      await subscription.save();

      // Send payment failure notification
      await this.notificationService.sendPaymentFailed({
        userId: subscription.userId._id,
        email: subscription.userId.email,
        subscription: {
          id: subscription._id,
          plan: subscription.planId.name,
          amount: subscription.billing.amount,
          currency: subscription.billing.currency
        },
        error: paymentError,
        retryDate: moment().add(3, 'days').toDate()
      });

      // Emit event
      this.eventEmitter.emit('payment.failed', {
        subscription,
        paymentIntentId,
        error: paymentError,
        failedAt: new Date()
      });

      this.logger.info('Payment failure notification sent', {
        subscriptionId,
        userId,
        paymentIntentId,
        error: paymentError?.message
      });

      res.json({
        success: true,
        message: 'Payment failure notification sent'
      });
    } catch (error) {
      this.logger.error('Error handling payment failure', {
        error: error.message,
        body: req.body
      });
      throw error;
    }
  }

  /**
   * Handle usage limit reached notifications
   */
  async handleUsageLimitReached(req, res) {
    try {
      const { subscriptionId, userId, metric, usage, limit } = req.body;

      if (!subscriptionId || !userId || !metric) {
        throw new ValidationError('Subscription ID, User ID, and metric are required');
      }

      const subscription = await Subscription.findById(subscriptionId)
        .populate('userId', 'email profile.firstName profile.lastName preferences.notifications')
        .populate('planId', 'name slug limits');

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      // Check if user wants usage notifications
      if (!subscription.userId.preferences?.notifications?.usage) {
        this.logger.info('Usage notifications disabled for user', {
          userId,
          subscriptionId
        });
        return res.json({ message: 'Notifications disabled' });
      }

      // Calculate usage percentage
      const usagePercentage = Math.round((usage / limit) * 100);

      // Send usage limit notification
      await this.notificationService.sendUsageLimitReached({
        userId: subscription.userId._id,
        email: subscription.userId.email,
        subscription: {
          id: subscription._id,
          plan: subscription.planId.name
        },
        usage: {
          metric,
          current: usage,
          limit,
          percentage: usagePercentage
        }
      });

      // Emit event
      this.eventEmitter.emit('usage.limit.reached', {
        subscription,
        metric,
        usage,
        limit,
        percentage: usagePercentage,
        notifiedAt: new Date()
      });

      this.logger.info('Usage limit notification sent', {
        subscriptionId,
        userId,
        metric,
        usage,
        limit,
        percentage: usagePercentage
      });

      res.json({
        success: true,
        message: 'Usage limit notification sent'
      });
    } catch (error) {
      this.logger.error('Error handling usage limit reached', {
        error: error.message,
        body: req.body
      });
      throw error;
    }
  }

  /**
   * Handle trial ending notifications
   */
  async handleTrialEnding(req, res) {
    try {
      const { subscriptionId, userId, trialEndsAt } = req.body;

      if (!subscriptionId || !userId) {
        throw new ValidationError('Subscription ID and User ID are required');
      }

      const subscription = await Subscription.findById(subscriptionId)
        .populate('userId', 'email profile.firstName profile.lastName')
        .populate('planId', 'name slug pricing');

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      if (subscription.status !== 'trialing') {
        this.logger.warn('Subscription is not in trial', {
          subscriptionId,
          status: subscription.status
        });
        return res.json({ message: 'Subscription not in trial' });
      }

      const trialEndDate = moment(trialEndsAt || subscription.dates.trialEnd);
      const daysUntilEnd = trialEndDate.diff(moment(), 'days');

      // Send trial ending notification
      await this.notificationService.sendTrialEnding({
        userId: subscription.userId._id,
        email: subscription.userId.email,
        subscription: {
          id: subscription._id,
          plan: subscription.planId.name,
          trialEndsAt: trialEndDate.toDate(),
          nextBillingAmount: subscription.billing.amount,
          currency: subscription.billing.currency
        },
        daysUntilEnd
      });

      // Emit event
      this.eventEmitter.emit('trial.ending', {
        subscription,
        daysUntilEnd,
        notifiedAt: new Date()
      });

      this.logger.info('Trial ending notification sent', {
        subscriptionId,
        userId,
        daysUntilEnd
      });

      res.json({
        success: true,
        message: 'Trial ending notification sent'
      });
    } catch (error) {
      this.logger.error('Error handling trial ending', {
        error: error.message,
        body: req.body
      });
      throw error;
    }
  }

  /**
   * Handle plan change notifications
   */
  async handlePlanChange(req, res) {
    try {
      const { subscriptionId, userId, oldPlanId, newPlanId, changeType } = req.body;

      if (!subscriptionId || !userId || !newPlanId) {
        throw new ValidationError('Subscription ID, User ID, and new plan ID are required');
      }

      const subscription = await Subscription.findById(subscriptionId)
        .populate('userId', 'email profile.firstName profile.lastName')
        .populate('planId', 'name slug pricing features');

      const oldPlan = oldPlanId ? await Plan.findById(oldPlanId) : null;
      const newPlan = await Plan.findById(newPlanId);

      if (!subscription || !newPlan) {
        throw new NotFoundError('Subscription or plan not found');
      }

      // Send plan change notification
      await this.notificationService.sendPlanChanged({
        userId: subscription.userId._id,
        email: subscription.userId.email,
        subscription: {
          id: subscription._id
        },
        planChange: {
          type: changeType || 'upgrade',
          oldPlan: oldPlan ? {
            name: oldPlan.name,
            price: oldPlan.pricing.amount
          } : null,
          newPlan: {
            name: newPlan.name,
            price: newPlan.pricing.amount,
            features: newPlan.features
          },
          effectiveDate: subscription.dates.currentPeriodEnd
        }
      });

      // Emit event
      this.eventEmitter.emit('plan.changed', {
        subscription,
        oldPlan,
        newPlan,
        changeType,
        changedAt: new Date()
      });

      this.logger.info('Plan change notification sent', {
        subscriptionId,
        userId,
        oldPlanId,
        newPlanId,
        changeType
      });

      res.json({
        success: true,
        message: 'Plan change notification sent'
      });
    } catch (error) {
      this.logger.error('Error handling plan change', {
        error: error.message,
        body: req.body
      });
      throw error;
    }
  }

  /**
   * Handle invoice generation notifications
   */
  async handleInvoiceGenerated(req, res) {
    try {
      const { subscriptionId, userId, invoiceId, amount, dueDate } = req.body;

      if (!subscriptionId || !userId || !invoiceId) {
        throw new ValidationError('Subscription ID, User ID, and invoice ID are required');
      }

      const subscription = await Subscription.findById(subscriptionId)
        .populate('userId', 'email profile.firstName profile.lastName preferences.notifications')
        .populate('planId', 'name slug');

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      // Check if user wants invoice notifications
      if (!subscription.userId.preferences?.notifications?.billing) {
        this.logger.info('Invoice notifications disabled for user', {
          userId,
          subscriptionId
        });
        return res.json({ message: 'Notifications disabled' });
      }

      // Send invoice generated notification
      await this.notificationService.sendInvoiceGenerated({
        userId: subscription.userId._id,
        email: subscription.userId.email,
        invoice: {
          id: invoiceId,
          amount,
          currency: subscription.billing.currency,
          dueDate: dueDate ? new Date(dueDate) : null,
          downloadUrl: `${process.env.APP_URL}/api/billing/invoices/${invoiceId}/download`
        },
        subscription: {
          id: subscription._id,
          plan: subscription.planId.name
        }
      });

      // Emit event
      this.eventEmitter.emit('invoice.generated', {
        subscription,
        invoiceId,
        amount,
        dueDate,
        generatedAt: new Date()
      });

      this.logger.info('Invoice generated notification sent', {
        subscriptionId,
        userId,
        invoiceId,
        amount
      });

      res.json({
        success: true,
        message: 'Invoice notification sent'
      });
    } catch (error) {
      this.logger.error('Error handling invoice generated', {
        error: error.message,
        body: req.body
      });
      throw error;
    }
  }

  /**
   * Handle refund processing notifications
   */
  async handleRefundProcessed(req, res) {
    try {
      const { subscriptionId, userId, refundId, amount, reason } = req.body;

      if (!subscriptionId || !userId || !refundId) {
        throw new ValidationError('Subscription ID, User ID, and refund ID are required');
      }

      const subscription = await Subscription.findById(subscriptionId)
        .populate('userId', 'email profile.firstName profile.lastName')
        .populate('planId', 'name slug');

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      // Send refund processed notification
      await this.notificationService.sendRefundProcessed({
        userId: subscription.userId._id,
        email: subscription.userId.email,
        refund: {
          id: refundId,
          amount,
          currency: subscription.billing.currency,
          reason,
          processedAt: new Date()
        },
        subscription: {
          id: subscription._id,
          plan: subscription.planId.name
        }
      });

      // Emit event
      this.eventEmitter.emit('refund.processed', {
        subscription,
        refundId,
        amount,
        reason,
        processedAt: new Date()
      });

      this.logger.info('Refund processed notification sent', {
        subscriptionId,
        userId,
        refundId,
        amount,
        reason
      });

      res.json({
        success: true,
        message: 'Refund notification sent'
      });
    } catch (error) {
      this.logger.error('Error handling refund processed', {
        error: error.message,
        body: req.body
      });
      throw error;
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req, res) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        stats: this.stats,
        version: process.env.npm_package_version || '1.0.0'
      };

      res.json(health);
    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
      res.status(500).json({
        status: 'unhealthy',
        error: error.message
      });
    }
  }

  /**
   * Get webhook statistics
   */
  async getStats(req, res) {
    try {
      const stats = {
        ...this.stats,
        successRate: this.stats.processed > 0 ? 
          ((this.stats.processed / (this.stats.processed + this.stats.failed)) * 100).toFixed(2) + '%' : '0%',
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.logger.error('Error retrieving webhook stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Retry failed webhook event
   */
  async retryEvent(req, res) {
    try {
      const { eventId } = req.params;
      const { eventType, payload } = req.body;

      if (!eventId || !eventType || !payload) {
        throw new ValidationError('Event ID, type, and payload are required');
      }

      this.logger.info('Retrying webhook event', {
        eventId,
        eventType
      });

      // Process the event based on type
      if (eventType.startsWith('stripe.')) {
        await this._processStripeEvent(payload);
      } else if (eventType.startsWith('paypal.')) {
        await this._processPayPalEvent(payload);
      } else {
        throw new ValidationError('Unsupported event type');
      }

      this.stats.retries++;

      this.logger.info('Webhook event retried successfully', {
        eventId,
        eventType
      });

      res.json({
        success: true,
        message: 'Event retried successfully'
      });
    } catch (error) {
      this.logger.error('Error retrying webhook event', {
        error: error.message,
        eventId: req.params.eventId
      });
      throw error;
    }
  }

  /**
   * Get webhook event history
   */
  async getEventHistory(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        status,
        startDate,
        endDate
      } = req.query;

      // This would typically query a WebhookEvent collection
      // For now, return sample data
      const events = this._generateSampleEventHistory({
        page: parseInt(page),
        limit: parseInt(limit),
        type,
        status,
        startDate,
        endDate
      });

      res.json({
        success: true,
        data: events.docs,
        pagination: {
          page: events.page,
          pages: events.totalPages,
          total: events.totalDocs,
          limit: events.limit
        }
      });
    } catch (error) {
      this.logger.error('Error retrieving event history', { error: error.message });
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  async _processStripeEvent(event) {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this._handleInvoicePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this._handleInvoicePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this._handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this._handleSubscriptionDeleted(event.data.object);
        break;
      case 'customer.subscription.trial_will_end':
        await this._handleTrialWillEnd(event.data.object);
        break;
      default:
        this.logger.info('Unhandled Stripe event type', { type: event.type });
    }
  }

  async _processPayPalEvent(event) {
    switch (event.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await this._handlePayPalSubscriptionActivated(event.resource);
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await this._handlePayPalSubscriptionCancelled(event.resource);
        break;
      case 'PAYMENT.SALE.COMPLETED':
        await this._handlePayPalPaymentCompleted(event.resource);
        break;
      default:
        this.logger.info('Unhandled PayPal event type', { type: event.event_type });
    }
  }

  async _handleInvoicePaymentSucceeded(invoice) {
    const subscription = await Subscription.findOne({
      'billing.stripeSubscriptionId': invoice.subscription
    });

    if (subscription) {
      subscription.status = 'active';
      subscription.billing.lastPaymentAt = new Date(invoice.status_transitions.paid_at * 1000);
      subscription.billing.lastPaymentError = null;
      await subscription.save();

      this.eventEmitter.emit('payment.succeeded', {
        subscription,
        invoice,
        paidAt: new Date()
      });
    }
  }

  async _handleInvoicePaymentFailed(invoice) {
    const subscription = await Subscription.findOne({
      'billing.stripeSubscriptionId': invoice.subscription
    });

    if (subscription) {
      subscription.status = 'past_due';
      subscription.billing.lastPaymentError = {
        code: invoice.last_finalization_error?.code,
        message: invoice.last_finalization_error?.message,
        occurredAt: new Date()
      };
      await subscription.save();

      this.eventEmitter.emit('payment.failed', {
        subscription,
        invoice,
        failedAt: new Date()
      });
    }
  }

  async _handleSubscriptionUpdated(stripeSubscription) {
    const subscription = await Subscription.findOne({
      'billing.stripeSubscriptionId': stripeSubscription.id
    });

    if (subscription) {
      subscription.status = stripeSubscription.status;
      subscription.dates.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
      subscription.dates.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
      await subscription.save();

      this.eventEmitter.emit('subscription.updated', {
        subscription,
        stripeData: stripeSubscription,
        updatedAt: new Date()
      });
    }
  }

  async _handleSubscriptionDeleted(stripeSubscription) {
    const subscription = await Subscription.findOne({
      'billing.stripeSubscriptionId': stripeSubscription.id
    });

    if (subscription) {
      subscription.status = 'canceled';
      subscription.dates.canceledAt = new Date();
      await subscription.save();

      this.eventEmitter.emit('subscription.canceled', {
        subscription,
        canceledAt: new Date()
      });
    }
  }

  async _handleTrialWillEnd(stripeSubscription) {
    const subscription = await Subscription.findOne({
      'billing.stripeSubscriptionId': stripeSubscription.id
    });

    if (subscription) {
      this.eventEmitter.emit('trial.ending', {
        subscription,
        trialEndsAt: new Date(stripeSubscription.trial_end * 1000)
      });
    }
  }

  async _handlePayPalSubscriptionActivated(resource) {
    const subscription = await Subscription.findOne({
      'billing.paypalSubscriptionId': resource.id
    });

    if (subscription) {
      subscription.status = 'active';
      await subscription.save();

      this.eventEmitter.emit('subscription.activated', {
        subscription,
        activatedAt: new Date()
      });
    }
  }

  async _handlePayPalSubscriptionCancelled(resource) {
    const subscription = await Subscription.findOne({
      'billing.paypalSubscriptionId': resource.id
    });

    if (subscription) {
      subscription.status = 'canceled';
      subscription.dates.canceledAt = new Date();
      await subscription.save();

      this.eventEmitter.emit('subscription.canceled', {
        subscription,
        canceledAt: new Date()
      });
    }
  }

  async _handlePayPalPaymentCompleted(resource) {
    // Handle PayPal payment completion
    this.logger.info('PayPal payment completed', {
      paymentId: resource.id,
      amount: resource.amount
    });
  }

  _generateSampleEventHistory(options) {
    // Generate sample webhook event history
    const events = [
      {
        id: 'evt_1',
        type: 'stripe.invoice.payment_succeeded',
        status: 'processed',
        createdAt: new Date(),
        processedAt: new Date(),
        attempts: 1
      },
      {
        id: 'evt_2',
        type: 'paypal.subscription.activated',
        status: 'processed',
        createdAt: new Date(),
        processedAt: new Date(),
        attempts: 1
      }
    ];

    return {
      docs: events,
      totalDocs: events.length,
      page: options.page,
      totalPages: Math.ceil(events.length / options.limit),
      limit: options.limit
    };
  }
}

module.exports = WebhookController;