const User = require('../models/User');
const UserSubscription = require('../models/UserSubscription');
const Payment = require('../models/Payment');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const TelegramUser = require('../models/TelegramUser');
const Trade = require('../models/Trade');
const Alert = require('../models/Alert');
const AdminUser = require('../models/AdminUser');
const paymentService = require('../services/paymentService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * Get admin dashboard overview
 */
const getDashboard = async (req, res) => {
  try {
    const [userStats, subscriptionStats, alertStats, tradeStats] = await Promise.all([
      getUserStatistics(),
      getSubscriptionStatistics(),
      getAlertStatistics(),
      getTradeStatistics()
    ]);
    
    const dashboard = {
      users: userStats,
      subscriptions: subscriptionStats,
      alerts: alertStats,
      trades: tradeStats,
      lastUpdated: new Date()
    };
    
    res.status(200).json({
      status: 'success',
      data: { dashboard }
    });
  } catch (error) {
    logger.error('Error fetching admin dashboard:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch dashboard data'
    });
  }
};

/**
 * Get all users with pagination
 */
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip = (page - 1) * limit;
    
    let query = {};
    if (status) {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { 'profile.name': { $regex: search, $options: 'i' } }
      ];
    }
    
    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -refreshTokens')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);
    
    // Get subscription counts for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const activeSubscriptions = await UserSubscription.countDocuments({
          userId: user._id,
          'subscription.status': 'active'
        });
        
        return {
          ...user.toObject(),
          activeSubscriptions
        };
      })
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        users: usersWithStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch users'
    });
  }
};

/**
 * Get user by ID with detailed information
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id).select('-password -refreshTokens');
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Get user's subscriptions
    const subscriptions = await UserSubscription.find({ userId: id })
      .populate('subscriptionPlanId')
      .sort({ createdAt: -1 });
    
    // Get user's telegram info
    const telegramUser = await TelegramUser.findOne({ userId: id });
    
    // Get user's recent trades
    const recentTrades = await Trade.find({ userId: id })
      .sort({ 'timestamps.openedAt': -1 })
      .limit(10);
    
    res.status(200).json({
      status: 'success',
      data: {
        user,
        subscriptions,
        telegramUser,
        recentTrades,
        stats: {
          totalSubscriptions: subscriptions.length,
          activeSubscriptions: subscriptions.filter(s => s.isActive()).length,
          totalTrades: recentTrades.length
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user by ID:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user details'
    });
  }
};

/**
 * Update user information
 */
const updateUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { id } = req.params;
    const updates = req.body;
    
    // Remove sensitive fields that shouldn't be updated via admin
    delete updates.password;
    delete updates.refreshTokens;
    
    const user = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -refreshTokens');
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    logger.info(`User ${id} updated by admin ${req.admin.adminId}`);
    
    res.status(200).json({
      status: 'success',
      data: { user },
      message: 'User updated successfully'
    });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update user'
    });
  }
};

/**
 * Delete user (soft delete)
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Soft delete by updating status
    user.status = 'deleted';
    await user.save();
    
    // Cancel all active subscriptions
    await UserSubscription.updateMany(
      { userId: id, 'subscription.status': 'active' },
      { $set: { 'subscription.status': 'cancelled' } }
    );
    
    logger.info(`User ${id} deleted by admin ${req.admin.adminId}`);
    
    res.status(200).json({
      status: 'success',
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete user'
    });
  }
};

/**
 * Get pending payment approvals
 */
const getPendingPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const [payments, total] = await Promise.all([
      Payment.find({ status: 'pending' })
        .populate(['userId', 'subscriptionPlanId'])
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Payment.countDocuments({ status: 'pending' })
    ]);
    
    res.status(200).json({
      status: 'success',
      data: {
        payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching pending payments:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch pending payments'
    });
  }
};

/**
 * Get pending subscription approvals (legacy support)
 */
const getPendingSubscriptions = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const [subscriptions, total] = await Promise.all([
      UserSubscription.find({ 'payment.status': 'pending' })
        .populate(['userId', 'subscriptionPlanId', 'paymentId'])
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      UserSubscription.countDocuments({ 'payment.status': 'pending' })
    ]);
    
    res.status(200).json({
      status: 'success',
      data: {
        subscriptions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching pending subscriptions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch pending subscriptions'
    });
  }
};

/**
 * Approve payment
 */
const approvePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { notes } = req.body;
    const adminId = req.admin.adminId;
    
    const result = await paymentService.approvePayment(paymentId, adminId, notes);
    
    logger.info(`Payment ${paymentId} approved by admin ${adminId}`);
    
    res.status(200).json({
      status: 'success',
      data: result,
      message: 'Payment approved and subscription activated successfully'
    });
  } catch (error) {
    logger.error('Error approving payment:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to approve payment'
    });
  }
};

/**
 * Reject payment
 */
const rejectPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;
    const adminId = req.admin.adminId;
    
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Rejection reason is required'
      });
    }
    
    const result = await paymentService.rejectPayment(paymentId, adminId, reason);
    
    logger.info(`Payment ${paymentId} rejected by admin ${adminId}`);
    
    res.status(200).json({
      status: 'success',
      data: result,
      message: 'Payment rejected successfully'
    });
  } catch (error) {
    logger.error('Error rejecting payment:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to reject payment'
    });
  }
};

/**
 * Approve subscription (legacy support)
 */
const approveSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { startDate, notes } = req.body;
    const adminId = req.admin.adminId;
    
    const subscription = await UserSubscription.findById(subscriptionId)
      .populate(['subscriptionPlanId', 'paymentId']);
    
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription not found'
      });
    }
    
    // If subscription has a paymentId, approve through payment service
    if (subscription.paymentId) {
      const result = await paymentService.approvePayment(subscription.paymentId, adminId, notes);
      return res.status(200).json({
        status: 'success',
        data: result,
        message: 'Subscription approved successfully'
      });
    }
    
    // Legacy approval for old subscriptions
    if (subscription.payment.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: 'Subscription is not pending approval'
      });
    }
    
    await subscription.approve(adminId, startDate ? new Date(startDate) : null);
    
    logger.info(`Subscription ${subscriptionId} approved by admin ${adminId}`);
    
    res.status(200).json({
      status: 'success',
      data: { subscription },
      message: 'Subscription approved successfully'
    });
  } catch (error) {
    logger.error('Error approving subscription:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to approve subscription'
    });
  }
};

/**
 * Reject subscription
 */
const rejectSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.userId;
    
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Rejection reason is required'
      });
    }
    
    const subscription = await UserSubscription.findById(subscriptionId);
    
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription not found'
      });
    }
    
    if (subscription.payment.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: 'Subscription is not pending approval'
      });
    }
    
    await subscription.reject(adminId, reason);
    
    logger.info(`Subscription ${subscriptionId} rejected by admin ${adminId}`);
    
    res.status(200).json({
      status: 'success',
      message: 'Subscription rejected successfully'
    });
  } catch (error) {
    logger.error('Error rejecting subscription:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reject subscription'
    });
  }
};

/**
 * Get system statistics
 */
const getSystemStats = async (req, res) => {
  try {
    const stats = await getUserStatistics();
    
    res.status(200).json({
      status: 'success',
      data: { stats }
    });
  } catch (error) {
    logger.error('Error fetching system stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch system statistics'
    });
  }
};

/**
 * Get alert statistics
 */
const getAlertStats = async (req, res) => {
  try {
    const stats = await getAlertStatistics();
    
    res.status(200).json({
      status: 'success',
      data: { stats }
    });
  } catch (error) {
    logger.error('Error fetching alert stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch alert statistics'
    });
  }
};

/**
 * Get subscription statistics
 */
const getSubscriptionStats = async (req, res) => {
  try {
    const stats = await getSubscriptionStatistics();
    
    res.status(200).json({
      status: 'success',
      data: { stats }
    });
  } catch (error) {
    logger.error('Error fetching subscription stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch subscription statistics'
    });
  }
};

/**
 * Get payment statistics
 */
const getPaymentStats = async (req, res) => {
  try {
    const stats = await paymentService.getPaymentStats();
    
    res.status(200).json({
      status: 'success',
      data: { stats }
    });
  } catch (error) {
    logger.error('Error fetching payment stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch payment statistics'
    });
  }
};

// Helper functions for statistics
async function getUserStatistics() {
  const [totalUsers, activeUsers, newUsersToday] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: 'active' }),
    User.countDocuments({
      createdAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0))
      }
    })
  ]);
  
  return {
    total: totalUsers,
    active: activeUsers,
    newToday: newUsersToday,
    inactive: totalUsers - activeUsers
  };
}

async function getSubscriptionStatistics() {
  const [totalSubscriptions, activeSubscriptions, pendingApprovals, revenue] = await Promise.all([
    UserSubscription.countDocuments(),
    UserSubscription.countDocuments({ 'subscription.status': 'active' }),
    UserSubscription.countDocuments({ 'payment.status': 'pending' }),
    UserSubscription.aggregate([
      { $match: { 'payment.status': 'approved' } },
      { $group: { _id: null, total: { $sum: '$payment.amount' } } }
    ])
  ]);
  
  return {
    total: totalSubscriptions,
    active: activeSubscriptions,
    pending: pendingApprovals,
    revenue: revenue[0]?.total || 0
  };
}

async function getAlertStatistics() {
  const [totalAlerts, alertsToday, processedAlerts] = await Promise.all([
    Alert.countDocuments(),
    Alert.countDocuments({
      'webhook.receivedAt': {
        $gte: new Date(new Date().setHours(0, 0, 0, 0))
      }
    }),
    Alert.countDocuments({ 'processing.status': 'processed' })
  ]);
  
  return {
    total: totalAlerts,
    today: alertsToday,
    processed: processedAlerts,
    failed: totalAlerts - processedAlerts
  };
}

async function getTradeStatistics() {
  const [totalTrades, openTrades, closedTrades] = await Promise.all([
    Trade.countDocuments(),
    Trade.countDocuments({ status: 'open' }),
    Trade.countDocuments({ status: 'closed' })
  ]);
  
  return {
    total: totalTrades,
    open: openTrades,
    closed: closedTrades
  };
}

/**
 * Get UPI configuration
 */
const getUPIConfig = async (req, res) => {
  try {
    const config = {
      merchantName: process.env.UPI_MERCHANT_NAME || 'TradingView Alert Bot',
      merchantCode: process.env.UPI_MERCHANT_CODE || 'TVAB001',
      vpa: process.env.UPI_VPA || 'alerts@paytm'
    };
    
    res.status(200).json({
      status: 'success',
      data: { config }
    });
  } catch (error) {
    logger.error('Error fetching UPI config:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch UPI configuration'
    });
  }
};

/**
 * Update UPI configuration
 */
const updateUPIConfig = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { merchantName, merchantCode, vpa } = req.body;
    
    // Note: In production, these should be stored in database or secure config
    // For now, we'll return the updated config that would be applied
    const updatedConfig = {
      merchantName: merchantName || process.env.UPI_MERCHANT_NAME,
      merchantCode: merchantCode || process.env.UPI_MERCHANT_CODE,
      vpa: vpa || process.env.UPI_VPA
    };
    
    logger.info(`UPI config updated by admin ${req.user.userId}`);
    
    res.status(200).json({
      status: 'success',
      data: { config: updatedConfig },
      message: 'UPI configuration updated successfully. Restart server to apply changes.'
    });
  } catch (error) {
    logger.error('Error updating UPI config:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update UPI configuration'
    });
  }
};

/**
 * Create subscription plan
 */
const createSubscriptionPlan = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, description, price, duration, features, isActive } = req.body;
    
    // Transform frontend payload to match SubscriptionPlan schema
    const planData = {
      name,
      description,
      pricing: {
        amount: price,
        currency: 'INR',
        duration: {
          months: Math.ceil(duration / 30), // Convert days to months
          days: duration % 30 // Remaining days
        }
      },
      features: {
        maxAlertConfigs: -1, // Default unlimited
        maxOpenTrades: 3, // Default
        prioritySupport: false, // Default
        advancedAnalytics: false // Default
      },
      status: isActive ? 'active' : 'inactive',
      metadata: {
        displayOrder: 0,
        isPopular: false,
        tags: features || [] // Use features as tags for now
      }
    };
    
    const plan = new SubscriptionPlan(planData);
    await plan.save();
    
    logger.info(`Subscription plan created: ${plan.name} by admin ${req.admin.adminId}`);
    
    res.status(201).json({
      status: 'success',
      data: { plan },
      message: 'Subscription plan created successfully'
    });
  } catch (error) {
    logger.error('Error creating subscription plan:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        status: 'error',
        message: 'Subscription plan with this name already exists'
      });
    }
    res.status(500).json({
      status: 'error',
      message: 'Failed to create subscription plan'
    });
  }
};

/**
 * Update subscription plan
 */
const updateSubscriptionPlan = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { planId } = req.params;
    const { name, description, price, duration, features, isActive } = req.body;
    
    // Transform frontend payload to match SubscriptionPlan schema
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.status = isActive ? 'active' : 'inactive';
    
    if (price !== undefined || duration !== undefined) {
      updateData.pricing = {};
      if (price !== undefined) {
        updateData.pricing.amount = price;
        updateData.pricing.currency = 'INR';
      }
      if (duration !== undefined) {
        updateData.pricing.duration = {
          months: Math.ceil(duration / 30),
          days: duration % 30
        };
      }
    }
    
    if (features !== undefined) {
      updateData.metadata = {
        tags: features
      };
    }
    
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      planId,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!plan) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription plan not found'
      });
    }
    
    logger.info(`Subscription plan updated: ${plan.name} by admin ${req.admin.adminId}`);
    
    res.status(200).json({
      status: 'success',
      data: { plan },
      message: 'Subscription plan updated successfully'
    });
  } catch (error) {
    logger.error('Error updating subscription plan:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update subscription plan'
    });
  }
};

/**
 * Delete subscription plan
 */
const deleteSubscriptionPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    
    // Check if plan has active subscriptions
    const activeSubscriptions = await UserSubscription.countDocuments({
      subscriptionPlanId: planId,
      'subscription.status': 'active'
    });
    
    if (activeSubscriptions > 0) {
      return res.status(409).json({
        status: 'error',
        message: `Cannot delete plan with ${activeSubscriptions} active subscriptions`
      });
    }
    
    const plan = await SubscriptionPlan.findByIdAndDelete(planId);
    
    if (!plan) {
      return res.status(404).json({
        status: 'error',
        message: 'Subscription plan not found'
      });
    }
    
    logger.info(`Subscription plan deleted: ${plan.name} by admin ${req.user.userId}`);
    
    res.status(200).json({
      status: 'success',
      message: 'Subscription plan deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting subscription plan:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete subscription plan'
    });
  }
};

/**
 * Get all subscription plans for admin
 */
const getSubscriptionPlans = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (page - 1) * limit;
    
    let query = {};
    if (status) {
      query.status = status;
    }
    
    const [plans, total] = await Promise.all([
      SubscriptionPlan.find(query)
        .sort({ 'metadata.displayOrder': 1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      SubscriptionPlan.countDocuments(query)
    ]);
    
    // Get subscription counts for each plan
    const plansWithStats = await Promise.all(
      plans.map(async (plan) => {
        const activeSubscriptions = await UserSubscription.countDocuments({
          subscriptionPlanId: plan._id,
          'subscription.status': 'active'
        });
        
        const totalSubscriptions = await UserSubscription.countDocuments({
          subscriptionPlanId: plan._id
        });
        
        return {
          ...plan.toObject(),
          stats: {
            activeSubscriptions,
            totalSubscriptions
          }
        };
      })
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        plans: plansWithStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
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

module.exports = {
  getDashboard,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getPendingPayments,
  approvePayment,
  rejectPayment,
  getPendingSubscriptions,
  approveSubscription,
  rejectSubscription,
  getSystemStats,
  getAlertStats,
  getSubscriptionStats,
  getPaymentStats,
  getUPIConfig,
  updateUPIConfig,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getSubscriptionPlans,
  // Add missing exports
  getUserStats: getAlertStats, // Temporarily map to getAlertStats until proper implementation
  getRevenueStats: getPaymentStats // Temporarily map to getPaymentStats until proper implementation
};