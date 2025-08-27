const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Subscription Plan Schema
 * Defines the structure for subscription plans with features, pricing, and limits
 */
const planSchema = new Schema({
  // Basic plan information
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    trim: true,
    maxlength: [100, 'Plan name cannot exceed 100 characters'],
    index: true
  },
  
  slug: {
    type: String,
    required: [true, 'Plan slug is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'],
    index: true
  },
  
  description: {
    type: String,
    required: [true, 'Plan description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // Plan type and category
  type: {
    type: String,
    enum: {
      values: ['free', 'basic', 'premium', 'enterprise', 'custom'],
      message: 'Plan type must be one of: free, basic, premium, enterprise, custom'
    },
    required: [true, 'Plan type is required'],
    index: true
  },
  
  category: {
    type: String,
    enum: {
      values: ['individual', 'team', 'business', 'enterprise'],
      message: 'Plan category must be one of: individual, team, business, enterprise'
    },
    required: [true, 'Plan category is required']
  },
  
  // Pricing information
  pricing: {
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      uppercase: true,
      match: [/^[A-Z]{3}$/, 'Currency must be a valid 3-letter ISO code'],
      default: 'USD'
    },
    
    monthly: {
      amount: {
        type: Number,
        required: [true, 'Monthly amount is required'],
        min: [0, 'Monthly amount cannot be negative'],
        validate: {
          validator: function(value) {
            return Number.isFinite(value) && value >= 0;
          },
          message: 'Monthly amount must be a valid positive number'
        }
      },
      
      originalAmount: {
        type: Number,
        min: [0, 'Original monthly amount cannot be negative']
      },
      
      discount: {
        type: Number,
        min: [0, 'Discount cannot be negative'],
        max: [100, 'Discount cannot exceed 100%'],
        default: 0
      }
    },
    
    yearly: {
      amount: {
        type: Number,
        required: [true, 'Yearly amount is required'],
        min: [0, 'Yearly amount cannot be negative'],
        validate: {
          validator: function(value) {
            return Number.isFinite(value) && value >= 0;
          },
          message: 'Yearly amount must be a valid positive number'
        }
      },
      
      originalAmount: {
        type: Number,
        min: [0, 'Original yearly amount cannot be negative']
      },
      
      discount: {
        type: Number,
        min: [0, 'Discount cannot be negative'],
        max: [100, 'Discount cannot exceed 100%'],
        default: 0
      },
      
      monthsDiscount: {
        type: Number,
        min: [0, 'Months discount cannot be negative'],
        max: [12, 'Months discount cannot exceed 12 months'],
        default: 0
      }
    },
    
    setupFee: {
      type: Number,
      min: [0, 'Setup fee cannot be negative'],
      default: 0
    },
    
    trialDays: {
      type: Number,
      min: [0, 'Trial days cannot be negative'],
      max: [365, 'Trial days cannot exceed 365 days'],
      default: 0
    }
  },
  
  // Plan limits and quotas
  limits: {
    // Alert-related limits
    maxAlerts: {
      type: Number,
      required: [true, 'Max alerts limit is required'],
      min: [0, 'Max alerts cannot be negative'],
      default: 0
    },
    
    maxActiveAlerts: {
      type: Number,
      required: [true, 'Max active alerts limit is required'],
      min: [0, 'Max active alerts cannot be negative'],
      default: 0
    },
    
    maxAlertsPerDay: {
      type: Number,
      min: [0, 'Max alerts per day cannot be negative'],
      default: 0
    },
    
    maxAlertsPerMonth: {
      type: Number,
      min: [0, 'Max alerts per month cannot be negative'],
      default: 0
    },
    
    // Chart and symbol limits
    maxCharts: {
      type: Number,
      min: [0, 'Max charts cannot be negative'],
      default: 0
    },
    
    maxSymbols: {
      type: Number,
      min: [0, 'Max symbols cannot be negative'],
      default: 0
    },
    
    maxTimeframes: {
      type: Number,
      min: [0, 'Max timeframes cannot be negative'],
      default: 0
    },
    
    // API and webhook limits
    maxApiCalls: {
      type: Number,
      min: [0, 'Max API calls cannot be negative'],
      default: 0
    },
    
    maxWebhooks: {
      type: Number,
      min: [0, 'Max webhooks cannot be negative'],
      default: 0
    },
    
    // Storage limits
    maxStorageGB: {
      type: Number,
      min: [0, 'Max storage cannot be negative'],
      default: 0
    },
    
    maxHistoryDays: {
      type: Number,
      min: [0, 'Max history days cannot be negative'],
      default: 30
    },
    
    // User and team limits
    maxUsers: {
      type: Number,
      min: [1, 'Max users must be at least 1'],
      default: 1
    },
    
    maxTeams: {
      type: Number,
      min: [0, 'Max teams cannot be negative'],
      default: 0
    }
  },
  
  // Plan features
  features: {
    // Core features
    basicAlerts: {
      type: Boolean,
      default: true
    },
    
    advancedAlerts: {
      type: Boolean,
      default: false
    },
    
    customIndicators: {
      type: Boolean,
      default: false
    },
    
    multiTimeframe: {
      type: Boolean,
      default: false
    },
    
    // Notification features
    emailNotifications: {
      type: Boolean,
      default: true
    },
    
    telegramNotifications: {
      type: Boolean,
      default: true
    },
    
    smsNotifications: {
      type: Boolean,
      default: false
    },
    
    webhookNotifications: {
      type: Boolean,
      default: false
    },
    
    // Advanced features
    apiAccess: {
      type: Boolean,
      default: false
    },
    
    webhookIntegration: {
      type: Boolean,
      default: false
    },
    
    customBranding: {
      type: Boolean,
      default: false
    },
    
    prioritySupport: {
      type: Boolean,
      default: false
    },
    
    dedicatedSupport: {
      type: Boolean,
      default: false
    },
    
    // Analytics and reporting
    basicAnalytics: {
      type: Boolean,
      default: true
    },
    
    advancedAnalytics: {
      type: Boolean,
      default: false
    },
    
    customReports: {
      type: Boolean,
      default: false
    },
    
    dataExport: {
      type: Boolean,
      default: false
    }
  },
  
  // Plan availability and status
  status: {
    type: String,
    enum: {
      values: ['active', 'inactive', 'deprecated', 'coming_soon'],
      message: 'Status must be one of: active, inactive, deprecated, coming_soon'
    },
    default: 'active',
    index: true
  },
  
  isPublic: {
    type: Boolean,
    default: true,
    index: true
  },
  
  isPopular: {
    type: Boolean,
    default: false
  },
  
  isRecommended: {
    type: Boolean,
    default: false
  },
  
  // Plan metadata
  metadata: {
    tags: [{
      type: String,
      trim: true,
      lowercase: true
    }],
    
    targetAudience: [{
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'professional', 'enterprise']
    }],
    
    highlights: [{
      type: String,
      trim: true,
      maxlength: [200, 'Highlight cannot exceed 200 characters']
    }],
    
    limitations: [{
      type: String,
      trim: true,
      maxlength: [200, 'Limitation cannot exceed 200 characters']
    }],
    
    customFields: {
      type: Map,
      of: Schema.Types.Mixed
    }
  },
  
  // External integration IDs
  externalIds: {
    stripeProductId: {
      type: String,
      trim: true
    },
    
    stripePriceIdMonthly: {
      type: String,
      trim: true
    },
    
    stripePriceIdYearly: {
      type: String,
      trim: true
    },
    
    paypalPlanId: {
      type: String,
      trim: true
    }
  },
  
  // Sorting and display order
  sortOrder: {
    type: Number,
    default: 0,
    index: true
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
planSchema.index({ type: 1, status: 1 });
planSchema.index({ category: 1, status: 1 });
planSchema.index({ isPublic: 1, status: 1 });
planSchema.index({ sortOrder: 1, createdAt: -1 });
planSchema.index({ 'pricing.monthly.amount': 1 });
planSchema.index({ 'pricing.yearly.amount': 1 });

// Virtual for monthly savings when paying yearly
planSchema.virtual('yearlySavings').get(function() {
  if (this.pricing.yearly.amount && this.pricing.monthly.amount) {
    const yearlyMonthly = this.pricing.monthly.amount * 12;
    const savings = yearlyMonthly - this.pricing.yearly.amount;
    const percentage = (savings / yearlyMonthly) * 100;
    
    return {
      amount: Math.round(savings * 100) / 100,
      percentage: Math.round(percentage * 100) / 100
    };
  }
  return { amount: 0, percentage: 0 };
});

// Virtual for effective monthly price when paying yearly
planSchema.virtual('effectiveMonthlyPrice').get(function() {
  if (this.pricing.yearly.amount) {
    return Math.round((this.pricing.yearly.amount / 12) * 100) / 100;
  }
  return this.pricing.monthly.amount;
});

// Pre-save middleware
planSchema.pre('save', function(next) {
  // Generate slug from name if not provided
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }
  
  // Validate yearly pricing makes sense
  if (this.pricing.yearly.amount && this.pricing.monthly.amount) {
    const yearlyMonthly = this.pricing.monthly.amount * 12;
    if (this.pricing.yearly.amount > yearlyMonthly) {
      return next(new Error('Yearly pricing should not exceed monthly pricing * 12'));
    }
  }
  
  next();
});

// Static methods
planSchema.statics.findPublicPlans = function() {
  return this.find({ isPublic: true, status: 'active' })
    .sort({ sortOrder: 1, createdAt: 1 });
};

planSchema.statics.findByType = function(type) {
  return this.find({ type, status: 'active' })
    .sort({ sortOrder: 1, createdAt: 1 });
};

planSchema.statics.findByCategory = function(category) {
  return this.find({ category, status: 'active' })
    .sort({ sortOrder: 1, createdAt: 1 });
};

// Instance methods
planSchema.methods.isFeatureEnabled = function(featureName) {
  return this.features[featureName] === true;
};

planSchema.methods.getLimit = function(limitName) {
  return this.limits[limitName] || 0;
};

planSchema.methods.canUpgradeTo = function(targetPlan) {
  // Simple upgrade logic - can upgrade to higher tier plans
  const tierOrder = ['free', 'basic', 'premium', 'enterprise', 'custom'];
  const currentTier = tierOrder.indexOf(this.type);
  const targetTier = tierOrder.indexOf(targetPlan.type);
  
  return targetTier > currentTier;
};

const Plan = mongoose.model('Plan', planSchema);

module.exports = Plan;