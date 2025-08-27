const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Alert Schema
 * Represents an alert condition that can trigger Telegram notifications
 */
const alertSchema = new Schema({
  // Alert identification
  alertId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },

  // Associated entities
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    index: true
  },

  botId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Bot',
    index: true
  },

  chatIds: [{
    type: Schema.Types.ObjectId,
    ref: 'Chat',
    index: true
  }],

  // Alert basic information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    index: true
  },

  description: {
    type: String,
    trim: true,
    maxlength: 500
  },

  type: {
    type: String,
    required: true,
    enum: ['price', 'volume', 'technical', 'news', 'custom'],
    index: true
  },

  category: {
    type: String,
    enum: ['crypto', 'stock', 'forex', 'commodity', 'index', 'general'],
    index: true
  },

  // Alert status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  isPaused: {
    type: Boolean,
    default: false,
    index: true
  },

  // Alert conditions
  conditions: {
    // Price-based conditions
    price: {
      symbol: {
        type: String,
        trim: true,
        uppercase: true,
        index: true
      },
      exchange: {
        type: String,
        trim: true,
        lowercase: true
      },
      operator: {
        type: String,
        enum: ['>', '<', '>=', '<=', '==', '!=', 'between', 'outside']
      },
      value: {
        type: Number,
        min: 0
      },
      valueHigh: {
        type: Number,
        min: 0
      },
      valueLow: {
        type: Number,
        min: 0
      },
      percentage: {
        type: Number
      },
      timeframe: {
        type: String,
        enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
        default: '1m'
      }
    },

    // Volume-based conditions
    volume: {
      symbol: {
        type: String,
        trim: true,
        uppercase: true,
        index: true
      },
      exchange: {
        type: String,
        trim: true,
        lowercase: true
      },
      operator: {
        type: String,
        enum: ['>', '<', '>=', '<=', 'spike', 'drop']
      },
      value: {
        type: Number,
        min: 0
      },
      percentage: {
        type: Number
      },
      timeframe: {
        type: String,
        enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'],
        default: '1h'
      },
      averagePeriod: {
        type: Number,
        default: 24,
        min: 1,
        max: 168 // 1 week
      }
    },

    // Technical analysis conditions
    technical: {
      symbol: {
        type: String,
        trim: true,
        uppercase: true,
        index: true
      },
      exchange: {
        type: String,
        trim: true,
        lowercase: true
      },
      indicator: {
        type: String,
        enum: [
          'rsi', 'macd', 'bollinger_bands', 'moving_average',
          'stochastic', 'williams_r', 'cci', 'atr', 'adx',
          'fibonacci', 'support_resistance', 'pattern'
        ]
      },
      operator: {
        type: String,
        enum: ['>', '<', '>=', '<=', '==', 'cross_above', 'cross_below', 'divergence']
      },
      value: {
        type: Number
      },
      timeframe: {
        type: String,
        enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
        default: '1h'
      },
      parameters: {
        type: Schema.Types.Mixed,
        default: {}
      }
    },

    // News-based conditions
    news: {
      keywords: [{
        type: String,
        trim: true,
        lowercase: true
      }],
      sources: [{
        type: String,
        trim: true,
        lowercase: true
      }],
      sentiment: {
        type: String,
        enum: ['positive', 'negative', 'neutral', 'any'],
        default: 'any'
      },
      language: {
        type: String,
        default: 'en',
        trim: true,
        lowercase: true
      },
      minScore: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.5
      }
    },

    // Custom conditions (for advanced users)
    custom: {
      expression: {
        type: String,
        trim: true,
        maxlength: 1000
      },
      variables: {
        type: Schema.Types.Mixed,
        default: {}
      },
      dataSource: {
        type: String,
        enum: ['api', 'webhook', 'database', 'external'],
        default: 'api'
      },
      endpoint: {
        type: String,
        trim: true
      },
      method: {
        type: String,
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        default: 'GET'
      },
      headers: {
        type: Schema.Types.Mixed,
        default: {}
      },
      payload: {
        type: Schema.Types.Mixed,
        default: {}
      }
    }
  },

  // Alert triggers and frequency
  triggers: {
    // How often to check the condition
    checkInterval: {
      type: Number,
      default: 60, // seconds
      min: 10,
      max: 3600 // 1 hour
    },

    // Cooldown period between alerts
    cooldownPeriod: {
      type: Number,
      default: 300, // 5 minutes
      min: 0,
      max: 86400 // 24 hours
    },

    // Maximum alerts per day
    maxAlertsPerDay: {
      type: Number,
      default: 50,
      min: 1,
      max: 1000
    },

    // Time-based restrictions
    timeRestrictions: {
      enabled: {
        type: Boolean,
        default: false
      },
      startTime: {
        type: String,
        validate: {
          validator: function(time) {
            return !time || /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
          },
          message: 'Invalid time format (HH:MM)'
        }
      },
      endTime: {
        type: String,
        validate: {
          validator: function(time) {
            return !time || /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
          },
          message: 'Invalid time format (HH:MM)'
        }
      },
      timezone: {
        type: String,
        default: 'UTC'
      },
      daysOfWeek: [{
        type: Number,
        min: 0,
        max: 6 // 0 = Sunday, 6 = Saturday
      }]
    },

    // Auto-disable conditions
    autoDisable: {
      enabled: {
        type: Boolean,
        default: false
      },
      afterTriggers: {
        type: Number,
        min: 1
      },
      afterDays: {
        type: Number,
        min: 1
      },
      afterDate: {
        type: Date
      }
    }
  },

  // Message formatting
  message: {
    template: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
      default: '🚨 Alert: {{name}}\n\n{{description}}\n\nTriggered at: {{timestamp}}'
    },

    format: {
      type: String,
      enum: ['text', 'markdown', 'html'],
      default: 'markdown'
    },

    includeChart: {
      type: Boolean,
      default: false
    },

    includeData: {
      type: Boolean,
      default: true
    },

    customFields: {
      type: Schema.Types.Mixed,
      default: {}
    },

    // Inline keyboard for interactive alerts
    inlineKeyboard: [[
      {
        text: {
          type: String,
          trim: true
        },
        url: {
          type: String,
          trim: true
        },
        callbackData: {
          type: String,
          trim: true,
          maxlength: 64
        }
      }
    ]]
  },

  // Alert statistics
  stats: {
    totalTriggers: {
      type: Number,
      default: 0,
      min: 0
    },

    totalAlertsSent: {
      type: Number,
      default: 0,
      min: 0
    },

    totalAlertsDelivered: {
      type: Number,
      default: 0,
      min: 0
    },

    totalAlertsFailed: {
      type: Number,
      default: 0,
      min: 0
    },

    alertsToday: {
      type: Number,
      default: 0,
      min: 0
    },

    lastTrigger: {
      type: Date,
      index: true
    },

    lastAlertSent: {
      type: Date,
      index: true
    },

    lastCheck: {
      type: Date,
      index: true
    },

    nextCheck: {
      type: Date,
      index: true
    },

    averageResponseTime: {
      type: Number,
      min: 0
    },

    // Daily reset tracking
    lastDayReset: {
      type: Date,
      default: Date.now
    }
  },

  // Alert execution history (last 10 triggers)
  executionHistory: [{
    triggeredAt: {
      type: Date,
      required: true
    },
    conditionValue: {
      type: Schema.Types.Mixed
    },
    alertSent: {
      type: Boolean,
      default: false
    },
    messagesSent: {
      type: Number,
      default: 0
    },
    messagesDelivered: {
      type: Number,
      default: 0
    },
    messagesFailed: {
      type: Number,
      default: 0
    },
    responseTime: {
      type: Number,
      min: 0
    },
    error: {
      type: String,
      trim: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  }],

  // Error tracking
  lastError: {
    message: {
      type: String,
      trim: true
    },
    code: {
      type: String,
      trim: true
    },
    timestamp: {
      type: Date
    },
    details: {
      type: Schema.Types.Mixed
    }
  },

  // Metadata
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },

  // Audit fields
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now
  },

  lastActiveAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Soft delete
  deletedAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'alerts'
});

// Indexes
alertSchema.index({ userId: 1, isActive: 1 });
alertSchema.index({ botId: 1, isActive: 1 });
alertSchema.index({ type: 1, category: 1 });
alertSchema.index({ 'conditions.price.symbol': 1 });
alertSchema.index({ 'conditions.volume.symbol': 1 });
alertSchema.index({ 'conditions.technical.symbol': 1 });
alertSchema.index({ isActive: 1, isPaused: 1, 'stats.nextCheck': 1 });
alertSchema.index({ 'stats.lastTrigger': -1 });
alertSchema.index({ 'stats.nextCheck': 1 });
alertSchema.index({ createdAt: -1 });
alertSchema.index({ deletedAt: 1 }, { sparse: true });

// Compound indexes for common queries
alertSchema.index({ 
  userId: 1, 
  type: 1, 
  isActive: 1, 
  createdAt: -1 
});

alertSchema.index({ 
  isActive: 1, 
  isPaused: 1, 
  'stats.nextCheck': 1,
  'triggers.timeRestrictions.enabled': 1
});

// Virtual for alert status
alertSchema.virtual('status').get(function() {
  if (this.deletedAt) return 'deleted';
  if (!this.isActive) return 'inactive';
  if (this.isPaused) return 'paused';
  
  // Check auto-disable conditions
  if (this.triggers.autoDisable.enabled) {
    if (this.triggers.autoDisable.afterTriggers && 
        this.stats.totalTriggers >= this.triggers.autoDisable.afterTriggers) {
      return 'auto_disabled';
    }
    
    if (this.triggers.autoDisable.afterDate && 
        new Date() > this.triggers.autoDisable.afterDate) {
      return 'auto_disabled';
    }
    
    if (this.triggers.autoDisable.afterDays) {
      const daysSinceCreated = Math.floor((Date.now() - this.createdAt.getTime()) / (24 * 60 * 60 * 1000));
      if (daysSinceCreated >= this.triggers.autoDisable.afterDays) {
        return 'auto_disabled';
      }
    }
  }
  
  return 'active';
});

// Virtual for cooldown status
alertSchema.virtual('cooldownStatus').get(function() {
  if (!this.stats.lastAlertSent) {
    return { inCooldown: false, remainingTime: 0 };
  }
  
  const timeSinceLastAlert = Date.now() - this.stats.lastAlertSent.getTime();
  const cooldownMs = this.triggers.cooldownPeriod * 1000;
  
  return {
    inCooldown: timeSinceLastAlert < cooldownMs,
    remainingTime: Math.max(0, cooldownMs - timeSinceLastAlert)
  };
});

// Virtual for daily limit status
alertSchema.virtual('dailyLimitStatus').get(function() {
  const now = new Date();
  const daysSinceReset = Math.floor((now - this.stats.lastDayReset) / (24 * 60 * 60 * 1000));
  
  const alertsToday = daysSinceReset >= 1 ? 0 : this.stats.alertsToday;
  
  return {
    alertsToday,
    maxAlertsPerDay: this.triggers.maxAlertsPerDay,
    limitReached: alertsToday >= this.triggers.maxAlertsPerDay,
    remainingAlerts: Math.max(0, this.triggers.maxAlertsPerDay - alertsToday)
  };
});

// Virtual for time restriction status
alertSchema.virtual('timeRestrictionStatus').get(function() {
  if (!this.triggers.timeRestrictions.enabled) {
    return { restricted: false };
  }
  
  const now = new Date();
  const timezone = this.triggers.timeRestrictions.timezone || 'UTC';
  
  try {
    // Check day of week
    if (this.triggers.timeRestrictions.daysOfWeek && 
        this.triggers.timeRestrictions.daysOfWeek.length > 0) {
      const currentDay = now.getUTCDay(); // 0 = Sunday
      if (!this.triggers.timeRestrictions.daysOfWeek.includes(currentDay)) {
        return { restricted: true, reason: 'day_of_week' };
      }
    }
    
    // Check time range
    if (this.triggers.timeRestrictions.startTime && 
        this.triggers.timeRestrictions.endTime) {
      const currentTime = now.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const startTime = this.triggers.timeRestrictions.startTime;
      const endTime = this.triggers.timeRestrictions.endTime;
      
      // Handle overnight time ranges
      if (startTime > endTime) {
        if (currentTime < startTime && currentTime > endTime) {
          return { restricted: true, reason: 'time_range' };
        }
      } else {
        if (currentTime < startTime || currentTime > endTime) {
          return { restricted: true, reason: 'time_range' };
        }
      }
    }
    
    return { restricted: false };
  } catch (error) {
    return { restricted: false, error: error.message };
  }
});

// Virtual for next execution time
alertSchema.virtual('nextExecution').get(function() {
  if (!this.isActive || this.isPaused || this.status === 'auto_disabled') {
    return null;
  }
  
  const now = new Date();
  const nextCheck = this.stats.nextCheck || now;
  
  return nextCheck > now ? nextCheck : now;
});

// Pre-save middleware
alertSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Reset daily counters if needed
  const now = new Date();
  const daysSinceReset = Math.floor((now - this.stats.lastDayReset) / (24 * 60 * 60 * 1000));
  
  if (daysSinceReset >= 1) {
    this.stats.alertsToday = 0;
    this.stats.lastDayReset = now;
  }
  
  // Set next check time if not set
  if (!this.stats.nextCheck) {
    this.stats.nextCheck = new Date(Date.now() + (this.triggers.checkInterval * 1000));
  }
  
  // Limit execution history to last 10 entries
  if (this.executionHistory.length > 10) {
    this.executionHistory = this.executionHistory.slice(-10);
  }
  
  next();
});

// Instance methods
alertSchema.methods.canTrigger = function() {
  if (!this.isActive || this.isPaused || this.status === 'auto_disabled') {
    return false;
  }
  
  // Check cooldown
  const cooldownStatus = this.cooldownStatus;
  if (cooldownStatus.inCooldown) {
    return false;
  }
  
  // Check daily limit
  const dailyLimitStatus = this.dailyLimitStatus;
  if (dailyLimitStatus.limitReached) {
    return false;
  }
  
  // Check time restrictions
  const timeRestrictionStatus = this.timeRestrictionStatus;
  if (timeRestrictionStatus.restricted) {
    return false;
  }
  
  return true;
};

alertSchema.methods.trigger = function(conditionValue, metadata = {}) {
  const now = new Date();
  
  // Update statistics
  this.stats.totalTriggers += 1;
  this.stats.lastTrigger = now;
  this.stats.lastCheck = now;
  this.stats.nextCheck = new Date(now.getTime() + (this.triggers.checkInterval * 1000));
  this.lastActiveAt = now;
  
  // Add to execution history
  const execution = {
    triggeredAt: now,
    conditionValue,
    alertSent: false,
    messagesSent: 0,
    messagesDelivered: 0,
    messagesFailed: 0,
    metadata
  };
  
  this.executionHistory.push(execution);
  
  // Limit history to 10 entries
  if (this.executionHistory.length > 10) {
    this.executionHistory = this.executionHistory.slice(-10);
  }
  
  return this.save();
};

alertSchema.methods.recordAlertSent = function(messagesSent = 1, messagesDelivered = 0, messagesFailed = 0, responseTime = 0) {
  const now = new Date();
  
  // Update statistics
  this.stats.totalAlertsSent += messagesSent;
  this.stats.totalAlertsDelivered += messagesDelivered;
  this.stats.totalAlertsFailed += messagesFailed;
  this.stats.alertsToday += messagesSent;
  this.stats.lastAlertSent = now;
  
  // Update average response time
  if (responseTime > 0) {
    if (this.stats.averageResponseTime) {
      this.stats.averageResponseTime = (this.stats.averageResponseTime + responseTime) / 2;
    } else {
      this.stats.averageResponseTime = responseTime;
    }
  }
  
  // Update last execution in history
  if (this.executionHistory.length > 0) {
    const lastExecution = this.executionHistory[this.executionHistory.length - 1];
    lastExecution.alertSent = true;
    lastExecution.messagesSent = messagesSent;
    lastExecution.messagesDelivered = messagesDelivered;
    lastExecution.messagesFailed = messagesFailed;
    lastExecution.responseTime = responseTime;
  }
  
  return this.save();
};

alertSchema.methods.recordError = function(error) {
  this.lastError = {
    message: error.message || 'Unknown error',
    code: error.code || 'UNKNOWN',
    timestamp: new Date(),
    details: error.details || {}
  };
  
  // Update last execution in history
  if (this.executionHistory.length > 0) {
    const lastExecution = this.executionHistory[this.executionHistory.length - 1];
    lastExecution.error = error.message || 'Unknown error';
  }
  
  return this.save();
};

alertSchema.methods.updateNextCheck = function() {
  this.stats.lastCheck = new Date();
  this.stats.nextCheck = new Date(Date.now() + (this.triggers.checkInterval * 1000));
  return this.save({ validateBeforeSave: false });
};

alertSchema.methods.pause = function() {
  this.isPaused = true;
  return this.save();
};

alertSchema.methods.resume = function() {
  this.isPaused = false;
  this.stats.nextCheck = new Date(Date.now() + (this.triggers.checkInterval * 1000));
  return this.save();
};

alertSchema.methods.activate = function() {
  this.isActive = true;
  this.isPaused = false;
  this.stats.nextCheck = new Date(Date.now() + (this.triggers.checkInterval * 1000));
  return this.save();
};

alertSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

alertSchema.methods.addChat = function(chatId) {
  if (!this.chatIds.includes(chatId)) {
    this.chatIds.push(chatId);
    return this.save();
  }
  return Promise.resolve(this);
};

alertSchema.methods.removeChat = function(chatId) {
  const index = this.chatIds.indexOf(chatId);
  if (index > -1) {
    this.chatIds.splice(index, 1);
    return this.save();
  }
  return Promise.resolve(this);
};

alertSchema.methods.updateConditions = function(conditions) {
  Object.assign(this.conditions, conditions);
  return this.save();
};

alertSchema.methods.updateTriggers = function(triggers) {
  Object.assign(this.triggers, triggers);
  
  // Update next check time if interval changed
  if (triggers.checkInterval) {
    this.stats.nextCheck = new Date(Date.now() + (this.triggers.checkInterval * 1000));
  }
  
  return this.save();
};

alertSchema.methods.updateMessage = function(message) {
  Object.assign(this.message, message);
  return this.save();
};

alertSchema.methods.softDelete = function() {
  this.deletedAt = new Date();
  this.isActive = false;
  return this.save();
};

alertSchema.methods.restore = function() {
  this.deletedAt = null;
  this.isActive = true;
  this.stats.nextCheck = new Date(Date.now() + (this.triggers.checkInterval * 1000));
  return this.save();
};

// Static methods
alertSchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId };
  
  if (options.activeOnly) {
    query.isActive = true;
    query.deletedAt = null;
  }
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.category) {
    query.category = options.category;
  }
  
  if (options.symbol) {
    query.$or = [
      { 'conditions.price.symbol': options.symbol },
      { 'conditions.volume.symbol': options.symbol },
      { 'conditions.technical.symbol': options.symbol }
    ];
  }
  
  return this.find(query).sort({ createdAt: -1 });
};

alertSchema.statics.findByBotId = function(botId, options = {}) {
  const query = { botId };
  
  if (options.activeOnly) {
    query.isActive = true;
    query.deletedAt = null;
  }
  
  return this.find(query).sort({ createdAt: -1 });
};

alertSchema.statics.findDueForCheck = function(limit = 100) {
  return this.find({
    isActive: true,
    isPaused: false,
    deletedAt: null,
    'stats.nextCheck': { $lte: new Date() }
  })
  .sort({ 'stats.nextCheck': 1 })
  .limit(limit);
};

alertSchema.statics.findBySymbol = function(symbol, type = null) {
  const query = {
    isActive: true,
    deletedAt: null,
    $or: [
      { 'conditions.price.symbol': symbol },
      { 'conditions.volume.symbol': symbol },
      { 'conditions.technical.symbol': symbol }
    ]
  };
  
  if (type) {
    query.type = type;
  }
  
  return this.find(query);
};

alertSchema.statics.getStatistics = function(filters = {}) {
  const matchStage = { deletedAt: null };
  
  if (filters.userId) {
    matchStage.userId = mongoose.Types.ObjectId(filters.userId);
  }
  
  if (filters.botId) {
    matchStage.botId = mongoose.Types.ObjectId(filters.botId);
  }
  
  if (filters.type) {
    matchStage.type = filters.type;
  }
  
  if (filters.dateFrom) {
    matchStage.createdAt = { $gte: filters.dateFrom };
  }
  
  if (filters.dateTo) {
    matchStage.createdAt = matchStage.createdAt || {};
    matchStage.createdAt.$lte = filters.dateTo;
  }
  
  return this.aggregate([
    { $match: matchStage },
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
        totalTriggers: { $sum: '$stats.totalTriggers' },
        totalAlertsSent: { $sum: '$stats.totalAlertsSent' },
        totalAlertsDelivered: { $sum: '$stats.totalAlertsDelivered' },
        totalAlertsFailed: { $sum: '$stats.totalAlertsFailed' },
        averageResponseTime: { $avg: '$stats.averageResponseTime' },
        alertsByType: {
          $push: {
            type: '$type',
            count: 1
          }
        }
      }
    }
  ]);
};

// Transform output
alertSchema.methods.toJSON = function() {
  const alert = this.toObject();
  
  // Add computed fields
  alert.status = this.status;
  alert.cooldownStatus = this.cooldownStatus;
  alert.dailyLimitStatus = this.dailyLimitStatus;
  alert.timeRestrictionStatus = this.timeRestrictionStatus;
  alert.nextExecution = this.nextExecution;
  
  return alert;
};

// Create and export model
const Alert = mongoose.model('Alert', alertSchema);

module.exports = Alert;