const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Subscription Schema
 * Manages user subscriptions, billing cycles, and subscription lifecycle
 */
const subscriptionSchema = new Schema({
  // User and plan references
  userId: {
    type: Schema.Types.ObjectId,
    required: [true, 'User ID is required'],
    index: true
  },
  
  planId: {
    type: Schema.Types.ObjectId,
    ref: 'Plan',
    required: [true, 'Plan ID is required'],
    index: true
  },
  
  // Subscription identification
  subscriptionId: {
    type: String,
    required: [true, 'Subscription ID is required'],
    unique: true,
    trim: true,
    index: true
  },
  
  // Subscription status and lifecycle
  status: {
    type: String,
    enum: {
      values: [
        'trial', 'active', 'past_due', 'canceled', 'unpaid',
        'incomplete', 'incomplete_expired', 'paused', 'suspended'
      ],
      message: 'Invalid subscription status'
    },
    required: [true, 'Subscription status is required'],
    default: 'trial',
    index: true
  },
  
  previousStatus: {
    type: String,
    enum: [
      'trial', 'active', 'past_due', 'canceled', 'unpaid',
      'incomplete', 'incomplete_expired', 'paused', 'suspended'
    ]
  },
  
  // Billing information
  billing: {
    cycle: {
      type: String,
      enum: {
        values: ['monthly', 'yearly', 'lifetime'],
        message: 'Billing cycle must be monthly, yearly, or lifetime'
      },
      required: [true, 'Billing cycle is required'],
      default: 'monthly'
    },
    
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      uppercase: true,
      match: [/^[A-Z]{3}$/, 'Currency must be a valid 3-letter ISO code'],
      default: 'USD'
    },
    
    amount: {
      type: Number,
      required: [true, 'Billing amount is required'],
      min: [0, 'Billing amount cannot be negative'],
      validate: {
        validator: function(value) {
          return Number.isFinite(value) && value >= 0;
        },
        message: 'Billing amount must be a valid positive number'
      }
    },
    
    originalAmount: {
      type: Number,
      min: [0, 'Original amount cannot be negative']
    },
    
    discount: {
      type: Number,
      min: [0, 'Discount cannot be negative'],
      max: [100, 'Discount cannot exceed 100%'],
      default: 0
    },
    
    setupFee: {
      type: Number,
      min: [0, 'Setup fee cannot be negative'],
      default: 0
    },
    
    tax: {
      rate: {
        type: Number,
        min: [0, 'Tax rate cannot be negative'],
        max: [100, 'Tax rate cannot exceed 100%'],
        default: 0
      },
      amount: {
        type: Number,
        min: [0, 'Tax amount cannot be negative'],
        default: 0
      }
    }
  },
  
  // Date management
  dates: {
    trialStart: {
      type: Date,
      index: true
    },
    
    trialEnd: {
      type: Date,
      index: true
    },
    
    currentPeriodStart: {
      type: Date,
      required: [true, 'Current period start is required'],
      index: true
    },
    
    currentPeriodEnd: {
      type: Date,
      required: [true, 'Current period end is required'],
      index: true
    },
    
    nextBillingDate: {
      type: Date,
      index: true
    },
    
    canceledAt: {
      type: Date,
      index: true
    },
    
    cancelAt: {
      type: Date,
      index: true
    },
    
    endedAt: {
      type: Date,
      index: true
    },
    
    pausedAt: {
      type: Date
    },
    
    resumedAt: {
      type: Date
    }
  },
  
  // Payment method and gateway information
  paymentMethod: {
    gateway: {
      type: String,
      enum: {
        values: ['stripe', 'paypal', 'manual', 'free'],
        message: 'Payment gateway must be stripe, paypal, manual, or free'
      },
      required: [true, 'Payment gateway is required'],
      default: 'stripe'
    },
    
    type: {
      type: String,
      enum: {
        values: ['card', 'bank_account', 'paypal', 'crypto', 'manual'],
        message: 'Invalid payment method type'
      }
    },
    
    last4: {
      type: String,
      match: [/^\d{4}$/, 'Last 4 digits must be exactly 4 numbers']
    },
    
    brand: {
      type: String,
      trim: true
    },
    
    expiryMonth: {
      type: Number,
      min: [1, 'Expiry month must be between 1 and 12'],
      max: [12, 'Expiry month must be between 1 and 12']
    },
    
    expiryYear: {
      type: Number,
      min: [new Date().getFullYear(), 'Expiry year cannot be in the past']
    }
  },
  
  // External gateway IDs
  externalIds: {
    stripeSubscriptionId: {
      type: String,
      trim: true,
      index: true
    },
    
    stripeCustomerId: {
      type: String,
      trim: true,
      index: true
    },
    
    paypalSubscriptionId: {
      type: String,
      trim: true,
      index: true
    },
    
    paypalPayerId: {
      type: String,
      trim: true
    }
  },
  
  // Usage tracking
  usage: {
    currentPeriod: {
      alerts: {
        type: Number,
        min: [0, 'Alert usage cannot be negative'],
        default: 0
      },
      apiCalls: {
        type: Number,
        min: [0, 'API call usage cannot be negative'],
        default: 0
      },
      webhooks: {
        type: Number,
        min: [0, 'Webhook usage cannot be negative'],
        default: 0
      },
      storage: {
        type: Number,
        min: [0, 'Storage usage cannot be negative'],
        default: 0
      }
    },
    
    lifetime: {
      alerts: {
        type: Number,
        min: [0, 'Lifetime alert usage cannot be negative'],
        default: 0
      },
      apiCalls: {
        type: Number,
        min: [0, 'Lifetime API call usage cannot be negative'],
        default: 0
      },
      webhooks: {
        type: Number,
        min: [0, 'Lifetime webhook usage cannot be negative'],
        default: 0
      }
    },
    
    lastResetDate: {
      type: Date,
      default: Date.now
    }
  },
  
  // Subscription metadata
  metadata: {
    source: {
      type: String,
      enum: ['web', 'api', 'admin', 'migration', 'upgrade', 'downgrade'],
      default: 'web'
    },
    
    campaign: {
      type: String,
      trim: true
    },
    
    referralCode: {
      type: String,
      trim: true
    },
    
    promoCode: {
      type: String,
      trim: true
    },
    
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    },
    
    customFields: {
      type: Map,
      of: Schema.Types.Mixed
    }
  },
  
  // Cancellation information
  cancellation: {
    reason: {
      type: String,
      enum: [
        'user_requested', 'payment_failed', 'fraud', 'admin_action',
        'upgrade', 'downgrade', 'refund', 'chargeback', 'other'
      ]
    },
    
    feedback: {
      type: String,
      trim: true,
      maxlength: [1000, 'Cancellation feedback cannot exceed 1000 characters']
    },
    
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false
    },
    
    immediateCancel: {
      type: Boolean,
      default: false
    }
  },
  
  // Renewal and upgrade information
  renewal: {
    autoRenew: {
      type: Boolean,
      default: true
    },
    
    renewalAttempts: {
      type: Number,
      min: [0, 'Renewal attempts cannot be negative'],
      default: 0
    },
    
    lastRenewalAttempt: {
      type: Date
    },
    
    nextRenewalAttempt: {
      type: Date
    }
  },
  
  // Notifications and alerts
  notifications: {
    billingReminder: {
      type: Boolean,
      default: true
    },
    
    usageAlerts: {
      type: Boolean,
      default: true
    },
    
    renewalReminder: {
      type: Boolean,
      default: true
    },
    
    lastNotificationSent: {
      type: Date
    }
  }
}, {
  timestamps: true,
  versionKey: false,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    }
  }
});

// Indexes for better query performance
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ planId: 1, status: 1 });
subscriptionSchema.index({ status: 1, 'dates.currentPeriodEnd': 1 });
subscriptionSchema.index({ 'dates.nextBillingDate': 1, status: 1 });
subscriptionSchema.index({ 'externalIds.stripeSubscriptionId': 1 });
subscriptionSchema.index({ 'externalIds.paypalSubscriptionId': 1 });
subscriptionSchema.index({ createdAt: -1 });
subscriptionSchema.index({ updatedAt: -1 });

// Virtual properties
subscriptionSchema.virtual('isActive').get(function() {
  return ['trial', 'active'].includes(this.status);
});

subscriptionSchema.virtual('isTrialing').get(function() {
  return this.status === 'trial' && 
         this.dates.trialEnd && 
         new Date() < this.dates.trialEnd;
});

subscriptionSchema.virtual('isPastDue').get(function() {
  return this.status === 'past_due';
});

subscriptionSchema.virtual('isCanceled').get(function() {
  return this.status === 'canceled';
});

subscriptionSchema.virtual('daysUntilRenewal').get(function() {
  if (!this.dates.nextBillingDate) return null;
  
  const now = new Date();
  const renewalDate = new Date(this.dates.nextBillingDate);
  const diffTime = renewalDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
});

subscriptionSchema.virtual('daysInCurrentPeriod').get(function() {
  const start = new Date(this.dates.currentPeriodStart);
  const end = new Date(this.dates.currentPeriodEnd);
  const diffTime = end - start;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
});

// Pre-save middleware
subscriptionSchema.pre('save', function(next) {
  // Generate subscription ID if not provided
  if (!this.subscriptionId) {
    this.subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Set next billing date based on current period end
  if (this.dates.currentPeriodEnd && !this.dates.nextBillingDate) {
    this.dates.nextBillingDate = this.dates.currentPeriodEnd;
  }
  
  // Reset usage if period has changed
  if (this.isModified('dates.currentPeriodStart')) {
    this.usage.currentPeriod = {
      alerts: 0,
      apiCalls: 0,
      webhooks: 0,
      storage: 0
    };
    this.usage.lastResetDate = new Date();
  }
  
  next();
});

// Static methods
subscriptionSchema.statics.findActiveSubscriptions = function() {
  return this.find({ status: { $in: ['trial', 'active'] } })
    .populate('planId')
    .sort({ createdAt: -1 });
};

subscriptionSchema.statics.findByUser = function(userId) {
  return this.find({ userId })
    .populate('planId')
    .sort({ createdAt: -1 });
};

subscriptionSchema.statics.findExpiringSoon = function(days = 7) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return this.find({
    status: { $in: ['trial', 'active'] },
    'dates.nextBillingDate': { $lte: futureDate },
    'renewal.autoRenew': false
  }).populate('planId');
};

subscriptionSchema.statics.findPastDue = function() {
  return this.find({
    status: 'past_due'
  }).populate('planId');
};

// Instance methods
subscriptionSchema.methods.canUseFeature = function(featureName) {
  if (!this.isActive) return false;
  
  // This would typically check against the plan's features
  // For now, return true for active subscriptions
  return true;
};

subscriptionSchema.methods.getRemainingUsage = function(usageType) {
  if (!this.planId || !this.planId.limits) return 0;
  
  const limit = this.planId.limits[`max${usageType.charAt(0).toUpperCase() + usageType.slice(1)}`];
  const used = this.usage.currentPeriod[usageType] || 0;
  
  return Math.max(0, limit - used);
};

subscriptionSchema.methods.incrementUsage = function(usageType, amount = 1) {
  if (!this.usage.currentPeriod[usageType]) {
    this.usage.currentPeriod[usageType] = 0;
  }
  
  this.usage.currentPeriod[usageType] += amount;
  
  if (!this.usage.lifetime[usageType]) {
    this.usage.lifetime[usageType] = 0;
  }
  
  this.usage.lifetime[usageType] += amount;
  
  return this.save();
};

subscriptionSchema.methods.cancel = function(reason = 'user_requested', immediate = false) {
  this.status = 'canceled';
  this.cancellation.reason = reason;
  this.cancellation.immediateCancel = immediate;
  this.dates.canceledAt = new Date();
  
  if (immediate) {
    this.dates.endedAt = new Date();
  } else {
    this.cancellation.cancelAtPeriodEnd = true;
    this.dates.cancelAt = this.dates.currentPeriodEnd;
  }
  
  return this.save();
};

subscriptionSchema.methods.pause = function() {
  this.previousStatus = this.status;
  this.status = 'paused';
  this.dates.pausedAt = new Date();
  
  return this.save();
};

subscriptionSchema.methods.resume = function() {
  if (this.previousStatus) {
    this.status = this.previousStatus;
    this.previousStatus = undefined;
  } else {
    this.status = 'active';
  }
  
  this.dates.resumedAt = new Date();
  this.dates.pausedAt = undefined;
  
  return this.save();
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;