const SubscriptionPlan = require('../models/SubscriptionPlan');
const UserSubscription = require('../models/UserSubscription');
const Payment = require('../models/Payment');
const User = require('../models/User');
const paymentService = require('../services/paymentService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * Get all subscription plans
 */
const getPlans = async (req, res) => {
  try {
    const { status = 'active', popular } = req.query;
    
    let query = {};
    if (status) {
      query.status = status;
    }
    if (popular === 'true') {
      query['metadata.isPopular'] = true;
    }
    
    const plans = await SubscriptionPlan.find(query)
      .sort({ 'metadata.displayOrder': 1, 'pricing.amount': 1 })
      .select('-__v');
    
    res.status(200).json({
      status: 'success',
      data: {
        plans,
        count: plans.length
      }
    });
  } catch (error) {
    logger.error('Error fetching subscription plans:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch subscription plans'
    });
  }
};

/**
 * Get a specific subscription plan
 */
const getPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    
    const plan = await SubscriptionPlan.findById(planId)
      .populate('alertConfigurations')
      .select('-__v');
    
    if (!plan) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription plan not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: { plan }
    });
  } catch (error) {
    logger.error('Error fetching subscription plan:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch subscription plan'
    });
  }
};

/**
 * Create subscription request
 */
const subscribe = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const userId = req.user.id;
    const { subscriptionPlanId, payment } = req.body;
    
    // Check if subscription plan exists and is active
    const subscriptionPlan = await SubscriptionPlan.findById(subscriptionPlanId);
    if (!subscriptionPlan || !subscriptionPlan.isActive()) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription plan not found or inactive'
      });
    }
    
    // Check if user already has a pending or active subscription for this plan
    const existingSubscription = await UserSubscription.findOne({
      userId,
      subscriptionPlanId,
      $or: [
        { 'payment.status': 'pending' },
        { 'subscription.status': 'active' }
      ]
    });
    
    if (existingSubscription) {
      return res.status(409).json({
        status: 'error',
        message: 'You already have a pending or active subscription for this plan'
      });
    }
    
    // Create payment request using payment service
    const paymentRequest = await paymentService.createPaymentRequest({
      userId,
      subscriptionPlanId,
      amount: subscriptionPlan.pricing.amount,
      currency: subscriptionPlan.pricing.currency,
      method: payment?.method || 'UPI'
    });
    
    // Create subscription request with payment reference
    const subscription = new UserSubscription({
      userId,
      subscriptionPlanId,
      paymentId: paymentRequest.payment._id,
      // Legacy payment fields for backward compatibility
      payment: {
        transactionId: paymentRequest.payment.transactionId,
        amount: paymentRequest.payment.amount,
        currency: paymentRequest.payment.currency,
        method: paymentRequest.payment.method,
        status: 'pending'
      }
    });
    
    await subscription.save();
    
    // Populate plan details for response
    await subscription.populate(['subscriptionPlanId', 'paymentId']);
    
    logger.info(`Subscription request created for user ${userId}, plan ${subscriptionPlanId}`);
    
    res.status(201).json({
      status: 'success',
      data: {
        subscription,
        payment: paymentRequest.payment,
        qrCode: paymentRequest.qrCode,
        message: 'Subscription request created successfully. Please complete payment and upload proof.'
      }
    });
  } catch (error) {
    logger.error('Error creating subscription request:', error);
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to create subscription request'
    });
  }
};

/**
 * Cancel subscription
 */
const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subscriptionId } = req.body;
    
    const subscription = await UserSubscription.findOne({
      _id: subscriptionId,
      userId
    });
    
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription not found'
      });
    }
    
    if (subscription.subscription.status === 'cancelled') {
      return res.status(400).json({
        status: 'error',
        message: 'Subscription is already cancelled'
      });
    }
    
    subscription.subscription.status = 'cancelled';
    subscription.subscription.autoRenew = false;
    await subscription.save();
    
    logger.info(`Subscription ${subscriptionId} cancelled by user ${userId}`);
    
    res.status(200).json({
      status: 'success',
      message: 'Subscription cancelled successfully'
    });
  } catch (error) {
    logger.error('Error cancelling subscription:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel subscription'
    });
  }
};

/**
 * Update subscription preferences
 */
const updateSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subscriptionId, autoRenew } = req.body;
    
    const subscription = await UserSubscription.findOne({
      _id: subscriptionId,
      userId
    });
    
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription not found'
      });
    }
    
    if (typeof autoRenew === 'boolean') {
      subscription.subscription.autoRenew = autoRenew;
    }
    
    await subscription.save();
    
    res.status(200).json({
      status: 'success',
      data: { subscription },
      message: 'Subscription updated successfully'
    });
  } catch (error) {
    logger.error('Error updating subscription:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update subscription'
    });
  }
};

/**
 * Get user's subscription status
 */
const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const subscriptions = await UserSubscription.find({ userId })
      .populate('subscriptionPlanId')
      .sort({ createdAt: -1 })
      .select('-__v');
    
    const activeSubscriptions = subscriptions.filter(sub => sub.isActive());
    const pendingSubscriptions = subscriptions.filter(sub => sub.payment.status === 'pending');
    
    res.status(200).json({
      status: 'success',
      data: {
        subscriptions,
        activeSubscriptions,
        pendingSubscriptions,
        summary: {
          total: subscriptions.length,
          active: activeSubscriptions.length,
          pending: pendingSubscriptions.length
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching subscription status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch subscription status'
    });
  }
};

/**
 * Get user's billing history
 */
const getBillingHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const subscriptions = await UserSubscription.find({ userId })
      .populate('subscriptionPlanId', 'name pricing')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('payment subscription createdAt subscriptionPlanId');
    
    const total = await UserSubscription.countDocuments({ userId });
    
    const billingHistory = subscriptions.map(sub => ({
      id: sub._id,
      planName: sub.subscriptionPlanId?.name,
      amount: sub.payment.amount,
      currency: sub.payment.currency,
      transactionId: sub.payment.transactionId,
      paymentStatus: sub.payment.status,
      subscriptionStatus: sub.subscription.status,
      startDate: sub.subscription.startDate,
      endDate: sub.subscription.endDate,
      createdAt: sub.createdAt
    }));
    
    res.status(200).json({
      status: 'success',
      data: {
        billingHistory,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching billing history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch billing history'
    });
  }
};

module.exports = {
  getPlans,
  getPlan,
  subscribe,
  cancelSubscription,
  updateSubscription,
  getSubscriptionStatus,
  getBillingHistory
};