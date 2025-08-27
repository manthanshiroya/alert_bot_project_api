const { User, Plan, Subscription } = require('../models');
const { Logger } = require('../../../shared/utils/logger');
const { ValidationError, NotFoundError, PaymentError } = require('../../../shared/utils/errors');
const { PaymentGateway } = require('../../../shared/services/payment');
const { NotificationService } = require('../../../shared/services/notification');
const { CacheService } = require('../../../shared/services/cache');
const { EventEmitter } = require('../../../shared/services/events');
const { PDFGenerator } = require('../../../shared/utils/pdf');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

class BillingController {
  constructor() {
    this.logger = new Logger('billing-controller');
    this.paymentGateway = new PaymentGateway();
    this.notificationService = new NotificationService();
    this.cacheService = new CacheService();
    this.eventEmitter = new EventEmitter();
    this.pdfGenerator = new PDFGenerator();
  }

  /**
   * Get user invoices
   */
  async getInvoices(req, res) {
    try {
      const { userId } = req.user;
      const { 
        status, 
        startDate, 
        endDate, 
        page = 1, 
        limit = 10, 
        sort = '-createdAt' 
      } = req.query;

      // Build query for user's subscriptions
      const subscriptions = await Subscription.find({ userId }).select('_id');
      const subscriptionIds = subscriptions.map(sub => sub._id);

      // This would typically query an Invoice model
      // For now, we'll simulate invoice data from subscription billing history
      const query = {
        subscriptionId: { $in: subscriptionIds }
      };

      if (status) query.status = status;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      // Simulate invoice data from subscriptions
      const invoices = await this._generateInvoiceData(subscriptionIds, query, {
        page: parseInt(page),
        limit: parseInt(limit),
        sort
      });

      this.logger.info('Invoices retrieved', {
        userId,
        count: invoices.docs.length,
        total: invoices.totalDocs
      });

      res.json({
        success: true,
        data: invoices.docs,
        pagination: {
          page: invoices.page,
          pages: invoices.totalPages,
          total: invoices.totalDocs,
          limit: invoices.limit
        }
      });
    } catch (error) {
      this.logger.error('Error retrieving invoices', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Get specific invoice
   */
  async getInvoice(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      // Verify user owns this invoice
      const invoice = await this._getInvoiceById(id, userId);
      if (!invoice) {
        throw new NotFoundError('Invoice not found');
      }

      this.logger.info('Invoice retrieved', {
        userId,
        invoiceId: id
      });

      res.json({
        success: true,
        data: invoice
      });
    } catch (error) {
      this.logger.error('Error retrieving invoice', { error: error.message, invoiceId: req.params.id });
      throw error;
    }
  }

  /**
   * Download invoice as PDF
   */
  async downloadInvoice(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const invoice = await this._getInvoiceById(id, userId);
      if (!invoice) {
        throw new NotFoundError('Invoice not found');
      }

      // Generate PDF
      const pdfBuffer = await this.pdfGenerator.generateInvoice(invoice);

      this.logger.info('Invoice PDF generated', {
        userId,
        invoiceId: id
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.number}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      this.logger.error('Error downloading invoice', { error: error.message, invoiceId: req.params.id });
      throw error;
    }
  }

  /**
   * Pay invoice
   */
  async payInvoice(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const { paymentMethodId } = req.body;

      const invoice = await this._getInvoiceById(id, userId);
      if (!invoice) {
        throw new NotFoundError('Invoice not found');
      }

      if (invoice.status === 'paid') {
        throw new ValidationError('Invoice is already paid');
      }

      if (invoice.status === 'void') {
        throw new ValidationError('Cannot pay a voided invoice');
      }

      // Process payment
      const paymentResult = await this.paymentGateway.processPayment({
        amount: invoice.amount,
        currency: invoice.currency,
        paymentMethodId,
        customerId: userId,
        metadata: {
          invoiceId: id,
          type: 'invoice_payment'
        }
      });

      if (!paymentResult.success) {
        throw new PaymentError(paymentResult.error || 'Payment failed');
      }

      // Update invoice status
      await this._updateInvoiceStatus(id, 'paid', {
        paidAt: new Date(),
        paymentIntentId: paymentResult.paymentIntentId,
        paymentMethodId
      });

      // Emit event
      this.eventEmitter.emit('invoice.paid', {
        invoice,
        payment: paymentResult,
        userId
      });

      // Send notification
      await this.notificationService.sendInvoicePaid({
        userId,
        invoice,
        amount: invoice.amount
      });

      this.logger.info('Invoice paid', {
        userId,
        invoiceId: id,
        amount: invoice.amount,
        paymentIntentId: paymentResult.paymentIntentId
      });

      res.json({
        success: true,
        data: {
          invoiceId: id,
          paymentIntentId: paymentResult.paymentIntentId,
          amount: invoice.amount,
          currency: invoice.currency
        },
        message: 'Invoice paid successfully'
      });
    } catch (error) {
      this.logger.error('Error paying invoice', { error: error.message, invoiceId: req.params.id });
      throw error;
    }
  }

  /**
   * Get payment methods
   */
  async getPaymentMethods(req, res) {
    try {
      const { userId } = req.user;

      const paymentMethods = await this.paymentGateway.getPaymentMethods(userId);

      this.logger.info('Payment methods retrieved', {
        userId,
        count: paymentMethods.length
      });

      res.json({
        success: true,
        data: paymentMethods
      });
    } catch (error) {
      this.logger.error('Error retrieving payment methods', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Add payment method
   */
  async addPaymentMethod(req, res) {
    try {
      const { userId } = req.user;
      const { paymentMethodId, setAsDefault = false } = req.body;

      if (!paymentMethodId) {
        throw new ValidationError('Payment method ID is required');
      }

      const result = await this.paymentGateway.attachPaymentMethod({
        paymentMethodId,
        customerId: userId,
        setAsDefault
      });

      if (!result.success) {
        throw new PaymentError(result.error || 'Failed to add payment method');
      }

      // Update user's payment method info
      await User.findByIdAndUpdate(userId, {
        'billing.hasPaymentMethod': true,
        'billing.defaultPaymentMethodId': setAsDefault ? paymentMethodId : undefined
      });

      this.logger.info('Payment method added', {
        userId,
        paymentMethodId,
        setAsDefault
      });

      res.json({
        success: true,
        data: result.paymentMethod,
        message: 'Payment method added successfully'
      });
    } catch (error) {
      this.logger.error('Error adding payment method', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Update payment method
   */
  async updatePaymentMethod(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const updates = req.body;

      const result = await this.paymentGateway.updatePaymentMethod({
        paymentMethodId: id,
        customerId: userId,
        updates
      });

      if (!result.success) {
        throw new PaymentError(result.error || 'Failed to update payment method');
      }

      this.logger.info('Payment method updated', {
        userId,
        paymentMethodId: id,
        updates: Object.keys(updates)
      });

      res.json({
        success: true,
        data: result.paymentMethod,
        message: 'Payment method updated successfully'
      });
    } catch (error) {
      this.logger.error('Error updating payment method', { error: error.message, paymentMethodId: req.params.id });
      throw error;
    }
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const result = await this.paymentGateway.detachPaymentMethod({
        paymentMethodId: id,
        customerId: userId
      });

      if (!result.success) {
        throw new PaymentError(result.error || 'Failed to delete payment method');
      }

      // Check if this was the default payment method
      const user = await User.findById(userId);
      if (user.billing.defaultPaymentMethodId === id) {
        await User.findByIdAndUpdate(userId, {
          'billing.defaultPaymentMethodId': null
        });
      }

      this.logger.info('Payment method deleted', {
        userId,
        paymentMethodId: id
      });

      res.json({
        success: true,
        message: 'Payment method deleted successfully'
      });
    } catch (error) {
      this.logger.error('Error deleting payment method', { error: error.message, paymentMethodId: req.params.id });
      throw error;
    }
  }

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const result = await this.paymentGateway.setDefaultPaymentMethod({
        paymentMethodId: id,
        customerId: userId
      });

      if (!result.success) {
        throw new PaymentError(result.error || 'Failed to set default payment method');
      }

      // Update user record
      await User.findByIdAndUpdate(userId, {
        'billing.defaultPaymentMethodId': id
      });

      this.logger.info('Default payment method set', {
        userId,
        paymentMethodId: id
      });

      res.json({
        success: true,
        message: 'Default payment method updated successfully'
      });
    } catch (error) {
      this.logger.error('Error setting default payment method', { error: error.message, paymentMethodId: req.params.id });
      throw error;
    }
  }

  /**
   * Get transaction history
   */
  async getTransactions(req, res) {
    try {
      const { userId } = req.user;
      const { 
        type, 
        status, 
        startDate, 
        endDate, 
        page = 1, 
        limit = 20, 
        sort = '-createdAt' 
      } = req.query;

      const transactions = await this.paymentGateway.getTransactions({
        customerId: userId,
        type,
        status,
        startDate,
        endDate,
        page: parseInt(page),
        limit: parseInt(limit),
        sort
      });

      this.logger.info('Transactions retrieved', {
        userId,
        count: transactions.data.length,
        total: transactions.total
      });

      res.json({
        success: true,
        data: transactions.data,
        pagination: {
          page: transactions.page,
          pages: transactions.pages,
          total: transactions.total,
          limit: transactions.limit
        }
      });
    } catch (error) {
      this.logger.error('Error retrieving transactions', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Request refund
   */
  async requestRefund(req, res) {
    try {
      const { transactionId } = req.params;
      const { userId } = req.user;
      const { amount, reason } = req.body;

      // Verify transaction belongs to user
      const transaction = await this.paymentGateway.getTransaction({
        transactionId,
        customerId: userId
      });

      if (!transaction) {
        throw new NotFoundError('Transaction not found');
      }

      if (transaction.status !== 'succeeded') {
        throw new ValidationError('Only successful transactions can be refunded');
      }

      // Process refund
      const refundResult = await this.paymentGateway.createRefund({
        transactionId,
        amount: amount || transaction.amount,
        reason: reason || 'requested_by_customer',
        metadata: {
          userId,
          requestedAt: new Date().toISOString()
        }
      });

      if (!refundResult.success) {
        throw new PaymentError(refundResult.error || 'Refund failed');
      }

      // Emit event
      this.eventEmitter.emit('refund.requested', {
        transaction,
        refund: refundResult,
        userId,
        reason
      });

      // Send notification
      await this.notificationService.sendRefundRequested({
        userId,
        transaction,
        refund: refundResult
      });

      this.logger.info('Refund requested', {
        userId,
        transactionId,
        refundId: refundResult.refundId,
        amount: refundResult.amount
      });

      res.json({
        success: true,
        data: {
          refundId: refundResult.refundId,
          amount: refundResult.amount,
          status: refundResult.status,
          estimatedArrival: refundResult.estimatedArrival
        },
        message: 'Refund requested successfully'
      });
    } catch (error) {
      this.logger.error('Error requesting refund', { error: error.message, transactionId: req.params.transactionId });
      throw error;
    }
  }

  /**
   * Get current usage
   */
  async getCurrentUsage(req, res) {
    try {
      const { userId } = req.user;

      const subscription = await Subscription.findOne({
        userId,
        status: { $in: ['active', 'trialing', 'past_due'] }
      }).populate('planId', 'name limits');

      if (!subscription) {
        return res.json({
          success: true,
          data: null,
          message: 'No active subscription found'
        });
      }

      const usage = subscription.usage.currentPeriod;
      const limits = subscription.planId.limits;

      const usageData = {
        period: {
          start: subscription.dates.currentPeriodStart,
          end: subscription.dates.currentPeriodEnd,
          daysRemaining: Math.max(0, moment(subscription.dates.currentPeriodEnd).diff(moment(), 'days'))
        },
        alerts: {
          used: usage.alerts,
          limit: limits.alerts,
          percentage: limits.alerts > 0 ? Math.round((usage.alerts / limits.alerts) * 100) : 0,
          unlimited: limits.alerts === -1,
          remaining: limits.alerts > 0 ? Math.max(0, limits.alerts - usage.alerts) : -1
        },
        apiCalls: {
          used: usage.apiCalls,
          limit: limits.apiCalls,
          percentage: limits.apiCalls > 0 ? Math.round((usage.apiCalls / limits.apiCalls) * 100) : 0,
          unlimited: limits.apiCalls === -1,
          remaining: limits.apiCalls > 0 ? Math.max(0, limits.apiCalls - usage.apiCalls) : -1
        },
        webhooks: {
          used: usage.webhooks,
          limit: limits.webhooks,
          percentage: limits.webhooks > 0 ? Math.round((usage.webhooks / limits.webhooks) * 100) : 0,
          unlimited: limits.webhooks === -1,
          remaining: limits.webhooks > 0 ? Math.max(0, limits.webhooks - usage.webhooks) : -1
        },
        storage: {
          used: usage.storage,
          limit: limits.storage,
          percentage: limits.storage > 0 ? Math.round((usage.storage / limits.storage) * 100) : 0,
          unlimited: limits.storage === -1,
          remaining: limits.storage > 0 ? Math.max(0, limits.storage - usage.storage) : -1
        }
      };

      res.json({
        success: true,
        data: usageData
      });
    } catch (error) {
      this.logger.error('Error retrieving current usage', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Get usage history
   */
  async getUsageHistory(req, res) {
    try {
      const { userId } = req.user;
      const { period = '6m', metric } = req.query;

      const months = parseInt(period.replace('m', ''));
      const startDate = moment().subtract(months, 'months').startOf('month').toDate();

      // This would typically query usage history from a dedicated collection
      // For now, we'll simulate historical data
      const history = await this._generateUsageHistory(userId, startDate, metric);

      res.json({
        success: true,
        data: {
          period,
          metric,
          history
        }
      });
    } catch (error) {
      this.logger.error('Error retrieving usage history', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Estimate upgrade cost
   */
  async estimateUpgrade(req, res) {
    try {
      const { userId } = req.user;
      const { planId, billingCycle } = req.body;

      const currentSubscription = await Subscription.findOne({
        userId,
        status: { $in: ['active', 'trialing'] }
      }).populate('planId');

      if (!currentSubscription) {
        throw new NotFoundError('No active subscription found');
      }

      const newPlan = await Plan.findById(planId);
      if (!newPlan) {
        throw new NotFoundError('Plan not found');
      }

      const estimate = await this._calculateUpgradeEstimate(
        currentSubscription,
        newPlan,
        billingCycle || currentSubscription.billing.cycle
      );

      res.json({
        success: true,
        data: estimate
      });
    } catch (error) {
      this.logger.error('Error estimating upgrade cost', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  async _generateInvoiceData(subscriptionIds, query, options) {
    // This would typically query an Invoice collection
    // For now, simulate invoice data from subscription billing
    const subscriptions = await Subscription.find({
      _id: { $in: subscriptionIds }
    })
    .populate('planId', 'name')
    .sort(options.sort)
    .limit(options.limit)
    .skip((options.page - 1) * options.limit);

    const invoices = subscriptions.map(sub => ({
      id: `inv_${sub._id}`,
      number: `INV-${sub._id.toString().slice(-8).toUpperCase()}`,
      subscriptionId: sub._id,
      amount: sub.billing.amount,
      currency: sub.billing.currency,
      status: 'paid', // Simulate status
      createdAt: sub.createdAt,
      dueDate: sub.dates.nextBillingDate,
      paidAt: sub.createdAt,
      plan: sub.planId.name,
      period: {
        start: sub.dates.currentPeriodStart,
        end: sub.dates.currentPeriodEnd
      }
    }));

    return {
      docs: invoices,
      totalDocs: subscriptions.length,
      page: options.page,
      totalPages: Math.ceil(subscriptions.length / options.limit),
      limit: options.limit
    };
  }

  async _getInvoiceById(invoiceId, userId) {
    // Extract subscription ID from invoice ID
    const subscriptionId = invoiceId.replace('inv_', '');
    
    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      userId
    }).populate('planId', 'name');

    if (!subscription) return null;

    return {
      id: invoiceId,
      number: `INV-${subscription._id.toString().slice(-8).toUpperCase()}`,
      subscriptionId: subscription._id,
      amount: subscription.billing.amount,
      currency: subscription.billing.currency,
      status: 'paid',
      createdAt: subscription.createdAt,
      dueDate: subscription.dates.nextBillingDate,
      paidAt: subscription.createdAt,
      plan: subscription.planId.name,
      period: {
        start: subscription.dates.currentPeriodStart,
        end: subscription.dates.currentPeriodEnd
      }
    };
  }

  async _updateInvoiceStatus(invoiceId, status, metadata = {}) {
    // This would update an Invoice collection
    // For now, just log the update
    this.logger.info('Invoice status updated', {
      invoiceId,
      status,
      metadata
    });
  }

  async _generateUsageHistory(userId, startDate, metric) {
    // This would query historical usage data
    // For now, generate sample data
    const months = [];
    const current = moment(startDate);
    const now = moment();

    while (current.isSameOrBefore(now, 'month')) {
      months.push({
        month: current.format('YYYY-MM'),
        alerts: Math.floor(Math.random() * 1000),
        apiCalls: Math.floor(Math.random() * 5000),
        webhooks: Math.floor(Math.random() * 500),
        storage: Math.floor(Math.random() * 1000)
      });
      current.add(1, 'month');
    }

    return months;
  }

  async _calculateUpgradeEstimate(currentSubscription, newPlan, billingCycle) {
    const currentAmount = currentSubscription.billing.amount;
    const newAmount = newPlan.pricing[billingCycle].amount;
    const daysRemaining = moment(currentSubscription.dates.currentPeriodEnd).diff(moment(), 'days');
    const totalDays = moment(currentSubscription.dates.currentPeriodEnd).diff(
      moment(currentSubscription.dates.currentPeriodStart), 'days'
    );

    const prorationCredit = Math.round((currentAmount * daysRemaining) / totalDays);
    const immediateCharge = Math.max(0, newAmount - prorationCredit);

    return {
      currentPlan: {
        name: currentSubscription.planId.name,
        amount: currentAmount,
        currency: currentSubscription.billing.currency
      },
      newPlan: {
        name: newPlan.name,
        amount: newAmount,
        currency: newPlan.pricing[billingCycle].currency
      },
      proration: {
        daysRemaining,
        credit: prorationCredit,
        immediateCharge,
        nextBillingAmount: newAmount
      },
      effectiveDate: new Date(),
      nextBillingDate: currentSubscription.dates.currentPeriodEnd
    };
  }
}

module.exports = BillingController;