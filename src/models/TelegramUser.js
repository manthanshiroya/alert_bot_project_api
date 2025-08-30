const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * TelegramUser Schema
 * Stores Telegram user information and their subscription details
 */
const telegramUserSchema = new Schema({
  // Telegram user information
  telegramId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    default: null
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    default: null
  },
  languageCode: {
    type: String,
    default: 'en'
  },
  
  // User account linking
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  
  // Bot interaction settings
  isActive: {
    type: Boolean,
    default: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  
  // Subscription and alert preferences
  subscriptions: [{
    alertConfigId: {
      type: Schema.Types.ObjectId,
      ref: 'AlertConfiguration',
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    subscribedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Notification preferences
  preferences: {
    receiveAlerts: {
      type: Boolean,
      default: true
    },
    receiveTradeUpdates: {
      type: Boolean,
      default: true
    },
    receivePnLUpdates: {
      type: Boolean,
      default: true
    },
    alertFormat: {
      type: String,
      enum: ['simple', 'detailed', 'custom'],
      default: 'detailed'
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  
  // Bot interaction history
  lastInteraction: {
    type: Date,
    default: Date.now
  },
  lastCommand: {
    type: String,
    default: null
  },
  messageCount: {
    type: Number,
    default: 0
  },
  
  // Session data for multi-step commands
  sessionData: {
    type: Schema.Types.Mixed,
    default: {}
  },
  
  // Statistics
  stats: {
    alertsReceived: {
      type: Number,
      default: 0
    },
    tradesExecuted: {
      type: Number,
      default: 0
    },
    totalPnL: {
      type: Number,
      default: 0
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  collection: 'telegram_users'
});

// Indexes for performance
telegramUserSchema.index({ telegramId: 1 }, { unique: true });
telegramUserSchema.index({ userId: 1 });
telegramUserSchema.index({ 'subscriptions.alertConfigId': 1 });
telegramUserSchema.index({ isActive: 1, isBlocked: 1 });
telegramUserSchema.index({ lastInteraction: -1 });

// Instance methods
telegramUserSchema.methods.getFullName = function() {
  return this.lastName ? `${this.firstName} ${this.lastName}` : this.firstName;
};

telegramUserSchema.methods.getDisplayName = function() {
  return this.username ? `@${this.username}` : this.getFullName();
};

telegramUserSchema.methods.isSubscribedTo = function(alertConfigId) {
  return this.subscriptions.some(sub => 
    sub.alertConfigId.toString() === alertConfigId.toString() && sub.isActive
  );
};

telegramUserSchema.methods.addSubscription = function(alertConfigId) {
  // Check if already subscribed
  const existingIndex = this.subscriptions.findIndex(sub => 
    sub.alertConfigId.toString() === alertConfigId.toString()
  );
  
  if (existingIndex >= 0) {
    // Reactivate if exists but inactive
    this.subscriptions[existingIndex].isActive = true;
    this.subscriptions[existingIndex].subscribedAt = new Date();
  } else {
    // Add new subscription
    this.subscriptions.push({
      alertConfigId,
      isActive: true,
      subscribedAt: new Date()
    });
  }
  
  return this.save();
};

telegramUserSchema.methods.removeSubscription = function(alertConfigId) {
  const subscriptionIndex = this.subscriptions.findIndex(sub => 
    sub.alertConfigId.toString() === alertConfigId.toString()
  );
  
  if (subscriptionIndex >= 0) {
    this.subscriptions[subscriptionIndex].isActive = false;
  }
  
  return this.save();
};

telegramUserSchema.methods.updateLastInteraction = function(command = null) {
  this.lastInteraction = new Date();
  this.messageCount += 1;
  if (command) {
    this.lastCommand = command;
  }
  return this.save();
};

telegramUserSchema.methods.updateStats = function(statsUpdate) {
  Object.keys(statsUpdate).forEach(key => {
    if (this.stats[key] !== undefined) {
      if (typeof this.stats[key] === 'number') {
        this.stats[key] += statsUpdate[key];
      } else {
        this.stats[key] = statsUpdate[key];
      }
    }
  });
  return this.save();
};

// Static methods
telegramUserSchema.statics.findByTelegramId = function(telegramId) {
  return this.findOne({ telegramId: telegramId.toString() });
};

telegramUserSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true, isBlocked: false });
};

telegramUserSchema.statics.findSubscribersForAlert = function(alertConfigId) {
  return this.find({
    isActive: true,
    isBlocked: false,
    'subscriptions.alertConfigId': alertConfigId,
    'subscriptions.isActive': true
  });
};

telegramUserSchema.statics.getUserStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: {
          $sum: {
            $cond: [{ $and: ['$isActive', { $not: '$isBlocked' }] }, 1, 0]
          }
        },
        totalAlerts: { $sum: '$stats.alertsReceived' },
        totalTrades: { $sum: '$stats.tradesExecuted' },
        totalPnL: { $sum: '$stats.totalPnL' }
      }
    }
  ]);
};

module.exports = mongoose.model('TelegramUser', telegramUserSchema);