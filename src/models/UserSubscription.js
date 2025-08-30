const mongoose = require('mongoose');

const userSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  subscriptionPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: [true, 'Subscription plan ID is required'],
    index: true
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: [true, 'Payment ID is required'],
    index: true
  },
  // Legacy payment fields for backward compatibility
  payment: {
    transactionId: {
      type: String,
      trim: true
    },
    amount: {
      type: Number,
      min: [0, 'Amount cannot be negative']
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true
    },
    method: {
      type: String,
      enum: ['UPI', 'bank_transfer', 'other'],
      default: 'UPI'
    },
    proofUrl: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    approvedAt: {
      type: Date
    },
    rejectionReason: {
      type: String,
      trim: true
    }
  },
  subscription: {
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'expired', 'cancelled'],
      default: 'pending',
      index: true
    },
    autoRenew: {
      type: Boolean,
      default: false
    },
    renewalNotificationSent: {
      type: Boolean,
      default: false
    }
  },
  usage: {
    alertsReceived: {
      type: Number,
      default: 0,
      min: [0, 'Alerts received cannot be negative']
    },
    tradesOpened: {
      type: Number,
      default: 0,
      min: [0, 'Trades opened cannot be negative']
    },
    lastActivityAt: {
      type: Date
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes
userSubscriptionSchema.index({ userId: 1, 'subscription.status': 1 });
userSubscriptionSchema.index({ 'subscription.endDate': 1 });
userSubscriptionSchema.index({ paymentId: 1 });
userSubscriptionSchema.index({ 'payment.transactionId': 1 }, { sparse: true });

// Virtual for days remaining
userSubscriptionSchema.virtual('daysRemaining').get(function() {
  if (!this.subscription.endDate || this.subscription.status !== 'active') {
    return 0;
  }
  const now = new Date();
  const endDate = new Date(this.subscription.endDate);
  const diffTime = endDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});

// Virtual for subscription duration
userSubscriptionSchema.virtual('subscriptionDuration').get(function() {
  if (!this.subscription.startDate || !this.subscription.endDate) {
    return 0;
  }
  const startDate = new Date(this.subscription.startDate);
  const endDate = new Date(this.subscription.endDate);
  const diffTime = endDate - startDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Static method to get user's active subscriptions
userSubscriptionSchema.statics.getUserActiveSubscriptions = function(userId) {
  return this.find({
    userId: userId,
    'subscription.status': 'active',
    'subscription.endDate': { $gt: new Date() }
  }).populate('subscriptionPlanId');
};

// Static method to get pending payment approvals
userSubscriptionSchema.statics.getPendingApprovals = function() {
  return this.find({
    'payment.status': 'pending'
  }).populate(['userId', 'subscriptionPlanId'])
    .sort({ createdAt: 1 });
};

// Static method to get expiring subscriptions
userSubscriptionSchema.statics.getExpiringSubscriptions = function(days = 7) {
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + days);
  
  return this.find({
    'subscription.status': 'active',
    'subscription.endDate': {
      $lte: expirationDate,
      $gte: new Date()
    },
    'subscription.renewalNotificationSent': false
  }).populate(['userId', 'subscriptionPlanId']);
};

// Instance method to approve subscription
userSubscriptionSchema.methods.approve = function(adminUserId, startDate = null) {
  this.payment.status = 'approved';
  this.payment.approvedBy = adminUserId;
  this.payment.approvedAt = new Date();
  
  this.subscription.status = 'active';
  this.subscription.startDate = startDate || new Date();
  
  // Calculate end date based on subscription plan duration
  if (this.subscriptionPlanId && this.subscriptionPlanId.pricing) {
    const endDate = new Date(this.subscription.startDate);
    const months = this.subscriptionPlanId.pricing.duration.months || 0;
    const days = this.subscriptionPlanId.pricing.duration.days || 0;
    
    endDate.setMonth(endDate.getMonth() + months);
    endDate.setDate(endDate.getDate() + days);
    this.subscription.endDate = endDate;
  }
  
  return this.save();
};

// Instance method to reject subscription
userSubscriptionSchema.methods.reject = function(adminUserId, reason) {
  this.payment.status = 'rejected';
  this.payment.approvedBy = adminUserId;
  this.payment.approvedAt = new Date();
  this.payment.rejectionReason = reason;
  this.subscription.status = 'cancelled';
  
  return this.save();
};

// Instance method to check if subscription is active
userSubscriptionSchema.methods.isActive = function() {
  return this.subscription.status === 'active' && 
         this.subscription.endDate > new Date();
};

// Instance method to update usage stats
userSubscriptionSchema.methods.updateUsage = function(alertsReceived = 0, tradesOpened = 0) {
  this.usage.alertsReceived += alertsReceived;
  this.usage.tradesOpened += tradesOpened;
  this.usage.lastActivityAt = new Date();
  
  return this.save();
};

// Pre-save middleware to handle status changes
userSubscriptionSchema.pre('save', function(next) {
  // Auto-expire subscriptions
  if (this.subscription.status === 'active' && 
      this.subscription.endDate && 
      this.subscription.endDate <= new Date()) {
    this.subscription.status = 'expired';
  }
  
  next();
});

module.exports = mongoose.model('UserSubscription', userSubscriptionSchema);