const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    unique: true,
    trim: true,
    maxlength: [100, 'Plan name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Plan description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  pricing: {
    amount: {
      type: Number,
      required: [true, 'Price amount is required'],
      min: [0, 'Price cannot be negative']
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true
    },
    duration: {
      months: {
        type: Number,
        required: [true, 'Duration in months is required'],
        min: [1, 'Duration must be at least 1 month']
      },
      days: {
        type: Number,
        default: 0,
        min: [0, 'Days cannot be negative']
      }
    }
  },
  features: {
    maxAlertConfigs: {
      type: Number,
      default: -1 // -1 means unlimited
    },
    maxOpenTrades: {
      type: Number,
      default: 3,
      min: [1, 'Must allow at least 1 open trade']
    },
    prioritySupport: {
      type: Boolean,
      default: false
    },
    advancedAnalytics: {
      type: Boolean,
      default: false
    }
  },
  alertConfigurations: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AlertConfiguration'
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active'
  },
  metadata: {
    displayOrder: {
      type: Number,
      default: 0
    },
    isPopular: {
      type: Boolean,
      default: false
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
subscriptionPlanSchema.index({ name: 1 }, { unique: true });
subscriptionPlanSchema.index({ status: 1 });
subscriptionPlanSchema.index({ 'metadata.displayOrder': 1 });
subscriptionPlanSchema.index({ 'pricing.amount': 1 });

// Virtual for total duration in days
subscriptionPlanSchema.virtual('totalDurationDays').get(function() {
  return (this.pricing.duration.months * 30) + this.pricing.duration.days;
});

// Static method to get active plans
subscriptionPlanSchema.statics.getActivePlans = function() {
  return this.find({ status: 'active' })
    .sort({ 'metadata.displayOrder': 1, 'pricing.amount': 1 });
};

// Static method to get popular plans
subscriptionPlanSchema.statics.getPopularPlans = function() {
  return this.find({ 
    status: 'active', 
    'metadata.isPopular': true 
  }).sort({ 'metadata.displayOrder': 1 });
};

// Instance method to check if plan is active
subscriptionPlanSchema.methods.isActive = function() {
  return this.status === 'active';
};

// Pre-save middleware to update timestamps
subscriptionPlanSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);