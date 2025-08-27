const mongoose = require('mongoose');
const { Schema } = mongoose;

// Alert condition schema
const conditionSchema = new Schema({
  field: {
    type: String,
    required: true,
    enum: ['price', 'volume', 'change', 'changePercent', 'marketCap', 'custom']
  },
  operator: {
    type: String,
    required: true,
    enum: ['>', '<', '>=', '<=', '==', '!=', 'crosses_above', 'crosses_below', 'between', 'not_between']
  },
  value: {
    type: Schema.Types.Mixed,
    required: true
  },
  secondValue: {
    type: Schema.Types.Mixed // For 'between' and 'not_between' operators
  }
}, { _id: false });

// Technical indicator configuration
const technicalIndicatorSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['sma', 'ema', 'rsi', 'macd', 'bollinger', 'stochastic', 'williams', 'atr', 'adx']
  },
  period: {
    type: Number,
    required: true,
    min: 1,
    max: 200
  },
  source: {
    type: String,
    default: 'close',
    enum: ['open', 'high', 'low', 'close', 'volume']
  },
  parameters: {
    type: Map,
    of: Schema.Types.Mixed
  }
}, { _id: false });

// Alert execution history
const executionHistorySchema = new Schema({
  triggeredAt: {
    type: Date,
    required: true
  },
  currentValue: {
    type: Number,
    required: true
  },
  targetValue: {
    type: Number,
    required: true
  },
  condition: {
    type: String,
    required: true
  },
  success: {
    type: Boolean,
    required: true
  },
  error: {
    type: String
  },
  notificationSent: {
    type: Boolean,
    default: false
  },
  processingTime: {
    type: Number // in milliseconds
  },
  marketData: {
    type: Map,
    of: Schema.Types.Mixed
  }
}, { _id: false });

// Main Alert schema
const alertSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  type: {
    type: String,
    required: true,
    enum: ['price', 'volume', 'technical', 'news', 'sentiment', 'custom'],
    index: true
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  exchange: {
    type: String,
    uppercase: true,
    trim: true,
    default: 'BINANCE'
  },
  interval: {
    type: String,
    required: true,
    enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
    default: '1h'
  },
  conditions: {
    type: [conditionSchema],
    required: true,
    validate: {
      validator: function(conditions) {
        return conditions && conditions.length > 0 && conditions.length <= 5;
      },
      message: 'Alert must have between 1 and 5 conditions'
    }
  },
  logicalOperator: {
    type: String,
    enum: ['AND', 'OR'],
    default: 'AND'
  },
  technicalIndicator: {
    type: technicalIndicatorSchema
  },
  customScript: {
    type: String,
    maxlength: 2000
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isPaused: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  frequency: {
    type: String,
    enum: ['once', 'recurring'],
    default: 'once'
  },
  maxTriggers: {
    type: Number,
    min: 1,
    max: 1000,
    default: 1
  },
  triggerCount: {
    type: Number,
    default: 0
  },
  cooldownPeriod: {
    type: Number, // in milliseconds
    default: 300000, // 5 minutes
    min: 60000, // 1 minute
    max: 86400000 // 24 hours
  },
  lastTriggered: {
    type: Date
  },
  lastChecked: {
    type: Date
  },
  nextCheck: {
    type: Date,
    index: true
  },
  expiresAt: {
    type: Date,
    index: { expireAfterSeconds: 0 }
  },
  notificationChannels: {
    telegram: {
      enabled: {
        type: Boolean,
        default: true
      },
      chatId: {
        type: String
      },
      messageTemplate: {
        type: String,
        maxlength: 1000
      }
    },
    webhook: {
      enabled: {
        type: Boolean,
        default: false
      },
      url: {
        type: String,
        validate: {
          validator: function(url) {
            if (!url) return true;
            try {
              new URL(url);
              return true;
            } catch {
              return false;
            }
          },
          message: 'Invalid webhook URL'
        }
      },
      headers: {
        type: Map,
        of: String
      },
      payload: {
        type: Map,
        of: Schema.Types.Mixed
      }
    },
    email: {
      enabled: {
        type: Boolean,
        default: false
      },
      address: {
        type: String,
        validate: {
          validator: function(email) {
            if (!email) return true;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
          },
          message: 'Invalid email address'
        }
      },
      subject: {
        type: String,
        maxlength: 200
      },
      template: {
        type: String,
        maxlength: 2000
      }
    }
  },
  metadata: {
    source: {
      type: String,
      default: 'manual'
    },
    tags: [{
      type: String,
      trim: true,
      maxlength: 50
    }],
    category: {
      type: String,
      trim: true,
      maxlength: 50
    },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    estimatedAccuracy: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  performance: {
    totalTriggers: {
      type: Number,
      default: 0
    },
    successfulTriggers: {
      type: Number,
      default: 0
    },
    failedTriggers: {
      type: Number,
      default: 0
    },
    averageProcessingTime: {
      type: Number,
      default: 0
    },
    lastProcessingTime: {
      type: Number
    },
    accuracy: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  executionHistory: {
    type: [executionHistorySchema],
    default: [],
    validate: {
      validator: function(history) {
        return history.length <= 100; // Limit history to last 100 executions
      },
      message: 'Execution history cannot exceed 100 entries'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
alertSchema.index({ userId: 1, isActive: 1 });
alertSchema.index({ symbol: 1, type: 1 });
alertSchema.index({ nextCheck: 1, isActive: 1 });
alertSchema.index({ priority: 1, isActive: 1 });
alertSchema.index({ createdAt: -1 });
alertSchema.index({ lastTriggered: -1 });
alertSchema.index({ 'metadata.tags': 1 });
alertSchema.index({ 'metadata.category': 1 });

// Compound indexes
alertSchema.index({ userId: 1, symbol: 1, type: 1 });
alertSchema.index({ isActive: 1, nextCheck: 1, priority: 1 });

// Virtual fields
alertSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

alertSchema.virtual('isInCooldown').get(function() {
  if (!this.lastTriggered) return false;
  const timeSinceLastTrigger = Date.now() - this.lastTriggered.getTime();
  return timeSinceLastTrigger < this.cooldownPeriod;
});

alertSchema.virtual('canTrigger').get(function() {
  return this.isActive && 
         !this.isPaused && 
         !this.isExpired && 
         !this.isInCooldown &&
         (this.frequency === 'recurring' || this.triggerCount < this.maxTriggers);
});

alertSchema.virtual('successRate').get(function() {
  if (this.performance.totalTriggers === 0) return 0;
  return (this.performance.successfulTriggers / this.performance.totalTriggers) * 100;
});

// Instance methods
alertSchema.methods.trigger = function(currentValue, marketData = {}) {
  const execution = {
    triggeredAt: new Date(),
    currentValue,
    targetValue: this.conditions[0].value, // Primary condition value
    condition: `${this.conditions[0].field} ${this.conditions[0].operator} ${this.conditions[0].value}`,
    success: true,
    marketData: new Map(Object.entries(marketData)),
    processingTime: 0
  };
  
  // Update trigger count and last triggered
  this.triggerCount += 1;
  this.lastTriggered = new Date();
  
  // Update performance metrics
  this.performance.totalTriggers += 1;
  this.performance.successfulTriggers += 1;
  
  // Add to execution history (keep only last 100)
  this.executionHistory.push(execution);
  if (this.executionHistory.length > 100) {
    this.executionHistory = this.executionHistory.slice(-100);
  }
  
  // Set next check time
  this.updateNextCheck();
  
  return execution;
};

alertSchema.methods.recordFailure = function(error, processingTime = 0) {
  const execution = {
    triggeredAt: new Date(),
    currentValue: 0,
    targetValue: this.conditions[0].value,
    condition: `${this.conditions[0].field} ${this.conditions[0].operator} ${this.conditions[0].value}`,
    success: false,
    error: error.message,
    processingTime
  };
  
  // Update performance metrics
  this.performance.totalTriggers += 1;
  this.performance.failedTriggers += 1;
  
  // Add to execution history
  this.executionHistory.push(execution);
  if (this.executionHistory.length > 100) {
    this.executionHistory = this.executionHistory.slice(-100);
  }
  
  return execution;
};

alertSchema.methods.updateNextCheck = function() {
  const now = new Date();
  let nextCheckTime;
  
  switch (this.interval) {
    case '1m':
      nextCheckTime = new Date(now.getTime() + 60 * 1000);
      break;
    case '5m':
      nextCheckTime = new Date(now.getTime() + 5 * 60 * 1000);
      break;
    case '15m':
      nextCheckTime = new Date(now.getTime() + 15 * 60 * 1000);
      break;
    case '30m':
      nextCheckTime = new Date(now.getTime() + 30 * 60 * 1000);
      break;
    case '1h':
      nextCheckTime = new Date(now.getTime() + 60 * 60 * 1000);
      break;
    case '4h':
      nextCheckTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      break;
    case '1d':
      nextCheckTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      break;
    case '1w':
      nextCheckTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    default:
      nextCheckTime = new Date(now.getTime() + 60 * 60 * 1000); // Default to 1 hour
  }
  
  this.nextCheck = nextCheckTime;
  this.lastChecked = now;
};

alertSchema.methods.pause = function() {
  this.isPaused = true;
  this.nextCheck = null;
};

alertSchema.methods.resume = function() {
  this.isPaused = false;
  this.updateNextCheck();
};

alertSchema.methods.deactivate = function() {
  this.isActive = false;
  this.nextCheck = null;
};

alertSchema.methods.activate = function() {
  this.isActive = true;
  this.isPaused = false;
  this.updateNextCheck();
};

// Static methods
alertSchema.statics.findActiveAlerts = function(limit = 100) {
  return this.find({
    isActive: true,
    isPaused: false,
    nextCheck: { $lte: new Date() },
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  })
  .sort({ priority: -1, nextCheck: 1 })
  .limit(limit);
};

alertSchema.statics.findByUser = function(userId, options = {}) {
  const query = { userId };
  
  if (options.isActive !== undefined) {
    query.isActive = options.isActive;
  }
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.symbol) {
    query.symbol = options.symbol.toUpperCase();
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0);
};

alertSchema.statics.getStatistics = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalAlerts: { $sum: 1 },
        activeAlerts: {
          $sum: {
            $cond: [{ $eq: ['$isActive', true] }, 1, 0]
          }
        },
        pausedAlerts: {
          $sum: {
            $cond: [{ $eq: ['$isPaused', true] }, 1, 0]
          }
        },
        totalTriggers: { $sum: '$performance.totalTriggers' },
        successfulTriggers: { $sum: '$performance.successfulTriggers' },
        failedTriggers: { $sum: '$performance.failedTriggers' },
        averageSuccessRate: { $avg: '$performance.accuracy' }
      }
    }
  ]);
};

// Pre-save middleware
alertSchema.pre('save', function(next) {
  // Set next check time if not set
  if (this.isNew && this.isActive && !this.isPaused && !this.nextCheck) {
    this.updateNextCheck();
  }
  
  // Calculate accuracy
  if (this.performance.totalTriggers > 0) {
    this.performance.accuracy = (this.performance.successfulTriggers / this.performance.totalTriggers) * 100;
  }
  
  // Calculate average processing time
  if (this.executionHistory.length > 0) {
    const totalTime = this.executionHistory.reduce((sum, exec) => sum + (exec.processingTime || 0), 0);
    this.performance.averageProcessingTime = totalTime / this.executionHistory.length;
  }
  
  next();
});

// Pre-remove middleware
alertSchema.pre('remove', function(next) {
  // Clean up any related data if needed
  next();
});

const Alert = mongoose.model('Alert', alertSchema);

module.exports = Alert;