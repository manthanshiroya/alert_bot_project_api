const mongoose = require('mongoose');

const alertConfigurationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  timeframe: {
    type: String,
    required: true,
    enum: ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w']
  },
  strategy: {
    type: String,
    required: true,
    trim: true
  },
  tradeManagement: {
    maxOpenTrades: {
      type: Number,
      default: 3,
      min: 1,
      max: 5
    },
    allowOppositeSignals: {
      type: Boolean,
      default: true
    },
    replaceOnSameSignal: {
      type: Boolean,
      default: true
    },
    autoCloseOnTPSL: {
      type: Boolean,
      default: true
    }
  },
  alertTypes: {
    entry: {
      enabled: {
        type: Boolean,
        default: true
      },
      signals: [{
        type: String,
        enum: ['BUY', 'SELL']
      }]
    },
    exit: {
      enabled: {
        type: Boolean,
        default: true
      },
      signals: [{
        type: String,
        enum: ['TP_HIT', 'SL_HIT']
      }]
    }
  },
  validation: {
    requiredFields: [{
      type: String,
      enum: ['symbol', 'timeframe', 'strategy', 'signal', 'price', 'tp', 'sl']
    }],
    priceValidation: {
      enabled: {
        type: Boolean,
        default: true
      },
      tolerance: {
        type: Number,
        default: 0.05 // 5% tolerance
      }
    }
  },
  filters: {
    priceRange: {
      enabled: {
        type: Boolean,
        default: false
      },
      min: Number,
      max: Number
    },
    timeRange: {
      enabled: {
        type: Boolean,
        default: false
      },
      startTime: String, // HH:MM format
      endTime: String,   // HH:MM format
      timezone: {
        type: String,
        default: 'UTC'
      }
    },
    volumeFilter: {
      enabled: {
        type: Boolean,
        default: false
      },
      minVolume: Number
    }
  },
  subscriptionPlans: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan'
  }],
  conditions: [{
    conditionId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    rules: {
      type: Object,
      required: true
    },
    actions: [{
      type: Object
    }],
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    enabled: {
      type: Boolean,
      default: true
    }
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'testing'],
    default: 'active'
  },
  statistics: {
    totalAlerts: {
      type: Number,
      default: 0
    },
    successfulAlerts: {
      type: Number,
      default: 0
    },
    failedAlerts: {
      type: Number,
      default: 0
    },
    lastAlertAt: Date,
    averageProcessingTime: {
      type: Number,
      default: 0
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
alertConfigurationSchema.index({ symbol: 1 });
alertConfigurationSchema.index({ timeframe: 1 });
alertConfigurationSchema.index({ strategy: 1 });
alertConfigurationSchema.index({ status: 1 });
alertConfigurationSchema.index({ symbol: 1, timeframe: 1, strategy: 1 });
alertConfigurationSchema.index({ subscriptionPlans: 1 });
alertConfigurationSchema.index({ createdBy: 1 });

// Static methods
alertConfigurationSchema.statics.findBySymbol = function(symbol) {
  return this.find({ 
    symbol: symbol.toUpperCase(),
    status: 'active'
  });
};

alertConfigurationSchema.statics.findByStrategy = function(strategy) {
  return this.find({ 
    strategy: strategy,
    status: 'active'
  });
};

alertConfigurationSchema.statics.findMatchingConfigs = function(alertData) {
  const { symbol, timeframe, strategy } = alertData;
  return this.find({
    symbol: symbol.toUpperCase(),
    timeframe: timeframe,
    strategy: strategy,
    status: 'active'
  });
};

alertConfigurationSchema.statics.findBySubscriptionPlan = function(planId) {
  return this.find({
    subscriptionPlans: planId,
    status: 'active'
  });
};

// Instance methods
alertConfigurationSchema.methods.incrementAlertCount = function(success = true) {
  this.statistics.totalAlerts += 1;
  if (success) {
    this.statistics.successfulAlerts += 1;
  } else {
    this.statistics.failedAlerts += 1;
  }
  this.statistics.lastAlertAt = new Date();
  this.updatedAt = new Date();
  return this.save();
};

alertConfigurationSchema.methods.updateProcessingTime = function(processingTime) {
  const currentAvg = this.statistics.averageProcessingTime || 0;
  const totalAlerts = this.statistics.totalAlerts || 1;
  
  this.statistics.averageProcessingTime = 
    ((currentAvg * (totalAlerts - 1)) + processingTime) / totalAlerts;
  
  return this.save();
};

alertConfigurationSchema.methods.validateAlert = function(alertData) {
  const errors = [];
  
  // Check required fields
  if (this.validation.requiredFields && this.validation.requiredFields.length > 0) {
    for (const field of this.validation.requiredFields) {
      if (!alertData[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }
  
  // Check price validation
  if (this.validation.priceValidation.enabled && alertData.price) {
    const price = parseFloat(alertData.price);
    if (isNaN(price) || price <= 0) {
      errors.push('Invalid price value');
    }
  }
  
  // Check price range filter
  if (this.filters.priceRange.enabled && alertData.price) {
    const price = parseFloat(alertData.price);
    if (this.filters.priceRange.min && price < this.filters.priceRange.min) {
      errors.push(`Price below minimum threshold: ${this.filters.priceRange.min}`);
    }
    if (this.filters.priceRange.max && price > this.filters.priceRange.max) {
      errors.push(`Price above maximum threshold: ${this.filters.priceRange.max}`);
    }
  }
  
  // Check time range filter
  if (this.filters.timeRange.enabled) {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    if (this.filters.timeRange.startTime && this.filters.timeRange.endTime) {
      const start = this.filters.timeRange.startTime;
      const end = this.filters.timeRange.endTime;
      
      if (start <= end) {
        // Same day range
        if (currentTime < start || currentTime > end) {
          errors.push(`Alert outside allowed time range: ${start} - ${end}`);
        }
      } else {
        // Overnight range
        if (currentTime < start && currentTime > end) {
          errors.push(`Alert outside allowed time range: ${start} - ${end}`);
        }
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

alertConfigurationSchema.methods.checkSignalAllowed = function(signal) {
  if (signal === 'BUY' || signal === 'SELL') {
    return this.alertTypes.entry.enabled && 
           this.alertTypes.entry.signals.includes(signal);
  } else if (signal === 'TP_HIT' || signal === 'SL_HIT') {
    return this.alertTypes.exit.enabled && 
           this.alertTypes.exit.signals.includes(signal);
  }
  return false;
};

module.exports = mongoose.model('AlertConfiguration', alertConfigurationSchema);