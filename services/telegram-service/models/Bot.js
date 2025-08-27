const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Bot Schema
 * Represents a Telegram bot configuration for a user
 */
const botSchema = new Schema({
  // User who owns this bot
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true,
    ref: 'User'
  },

  // Bot identification
  botToken: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    validate: {
      validator: function(token) {
        // Telegram bot token format: nnnnnnnnnn:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        return /^\d{8,10}:[a-zA-Z0-9_-]{35}$/.test(token);
      },
      message: 'Invalid Telegram bot token format'
    }
  },

  botId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },

  botUsername: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true,
    validate: {
      validator: function(username) {
        // Telegram username format
        return /^[a-zA-Z0-9_]{5,32}$/.test(username);
      },
      message: 'Invalid Telegram bot username format'
    }
  },

  botName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 64
  },

  // Bot configuration
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },

  // Webhook configuration
  webhookUrl: {
    type: String,
    trim: true,
    validate: {
      validator: function(url) {
        if (!url) return true; // Optional field
        try {
          const urlObj = new URL(url);
          return urlObj.protocol === 'https:';
        } catch {
          return false;
        }
      },
      message: 'Webhook URL must be a valid HTTPS URL'
    }
  },

  webhookSecret: {
    type: String,
    trim: true
  },

  // Bot settings
  settings: {
    // Message settings
    messageFormat: {
      type: String,
      enum: ['text', 'markdown', 'html'],
      default: 'markdown'
    },

    // Notification settings
    enableNotifications: {
      type: Boolean,
      default: true
    },

    // Rate limiting
    maxMessagesPerMinute: {
      type: Number,
      default: 30,
      min: 1,
      max: 100
    },

    maxMessagesPerHour: {
      type: Number,
      default: 1000,
      min: 1,
      max: 10000
    },

    // Message options
    disableWebPagePreview: {
      type: Boolean,
      default: false
    },

    disableNotification: {
      type: Boolean,
      default: false
    },

    // Retry settings
    retryFailedMessages: {
      type: Boolean,
      default: true
    },

    maxRetryAttempts: {
      type: Number,
      default: 3,
      min: 1,
      max: 10
    },

    retryDelay: {
      type: Number,
      default: 5000, // 5 seconds
      min: 1000,
      max: 300000 // 5 minutes
    },

    // Custom commands
    enableCustomCommands: {
      type: Boolean,
      default: false
    },

    customCommands: [{
      command: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        validate: {
          validator: function(cmd) {
            return /^[a-z0-9_]{1,32}$/.test(cmd);
          },
          message: 'Invalid command format'
        }
      },
      description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 256
      },
      response: {
        type: String,
        required: true,
        trim: true,
        maxlength: 4096
      },
      isActive: {
        type: Boolean,
        default: true
      }
    }]
  },

  // Statistics
  stats: {
    totalMessagesSent: {
      type: Number,
      default: 0,
      min: 0
    },

    totalMessagesReceived: {
      type: Number,
      default: 0,
      min: 0
    },

    totalErrors: {
      type: Number,
      default: 0,
      min: 0
    },

    lastMessageSent: {
      type: Date
    },

    lastMessageReceived: {
      type: Date
    },

    lastError: {
      type: Date
    },

    // Rate limiting counters
    messagesThisMinute: {
      type: Number,
      default: 0,
      min: 0
    },

    messagesThisHour: {
      type: Number,
      default: 0,
      min: 0
    },

    lastMinuteReset: {
      type: Date,
      default: Date.now
    },

    lastHourReset: {
      type: Date,
      default: Date.now
    }
  },

  // Bot information from Telegram API
  botInfo: {
    canJoinGroups: {
      type: Boolean,
      default: false
    },

    canReadAllGroupMessages: {
      type: Boolean,
      default: false
    },

    supportsInlineQueries: {
      type: Boolean,
      default: false
    },

    description: {
      type: String,
      trim: true,
      maxlength: 512
    },

    shortDescription: {
      type: String,
      trim: true,
      maxlength: 120
    }
  },

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

  lastVerifiedAt: {
    type: Date
  },

  lastActiveAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'bots'
});

// Indexes
botSchema.index({ userId: 1, isActive: 1 });
botSchema.index({ botUsername: 1 }, { unique: true });
botSchema.index({ botId: 1 }, { unique: true });
botSchema.index({ isActive: 1, isVerified: 1 });
botSchema.index({ createdAt: -1 });
botSchema.index({ lastActiveAt: -1 });

// Virtual for bot token ID (first part of token)
botSchema.virtual('tokenId').get(function() {
  if (this.botToken) {
    return this.botToken.split(':')[0];
  }
  return null;
});

// Virtual for rate limit status
botSchema.virtual('rateLimitStatus').get(function() {
  const now = new Date();
  const minutesSinceReset = Math.floor((now - this.stats.lastMinuteReset) / 60000);
  const hoursSinceReset = Math.floor((now - this.stats.lastHourReset) / 3600000);

  return {
    messagesThisMinute: minutesSinceReset >= 1 ? 0 : this.stats.messagesThisMinute,
    messagesThisHour: hoursSinceReset >= 1 ? 0 : this.stats.messagesThisHour,
    canSendMessage: (
      (minutesSinceReset >= 1 || this.stats.messagesThisMinute < this.settings.maxMessagesPerMinute) &&
      (hoursSinceReset >= 1 || this.stats.messagesThisHour < this.settings.maxMessagesPerHour)
    )
  };
});

// Pre-save middleware
botSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Extract bot ID from token if not set
  if (this.botToken && !this.botId) {
    this.botId = this.botToken.split(':')[0];
  }
  
  // Reset rate limit counters if needed
  const now = new Date();
  const minutesSinceReset = Math.floor((now - this.stats.lastMinuteReset) / 60000);
  const hoursSinceReset = Math.floor((now - this.stats.lastHourReset) / 3600000);
  
  if (minutesSinceReset >= 1) {
    this.stats.messagesThisMinute = 0;
    this.stats.lastMinuteReset = now;
  }
  
  if (hoursSinceReset >= 1) {
    this.stats.messagesThisHour = 0;
    this.stats.lastHourReset = now;
  }
  
  next();
});

// Instance methods
botSchema.methods.incrementMessageCount = function(type = 'sent') {
  const now = new Date();
  
  if (type === 'sent') {
    this.stats.totalMessagesSent += 1;
    this.stats.messagesThisMinute += 1;
    this.stats.messagesThisHour += 1;
    this.stats.lastMessageSent = now;
  } else if (type === 'received') {
    this.stats.totalMessagesReceived += 1;
    this.stats.lastMessageReceived = now;
  }
  
  this.lastActiveAt = now;
  return this.save();
};

botSchema.methods.incrementErrorCount = function(error) {
  this.stats.totalErrors += 1;
  this.stats.lastError = new Date();
  
  if (error) {
    this.lastError = {
      message: error.message || 'Unknown error',
      code: error.code || 'UNKNOWN',
      timestamp: new Date(),
      details: error.details || {}
    };
  }
  
  return this.save();
};

botSchema.methods.canSendMessage = function() {
  const rateLimitStatus = this.rateLimitStatus;
  return this.isActive && this.isVerified && rateLimitStatus.canSendMessage;
};

botSchema.methods.addCustomCommand = function(command, description, response) {
  // Check if command already exists
  const existingCommand = this.settings.customCommands.find(cmd => cmd.command === command.toLowerCase());
  
  if (existingCommand) {
    existingCommand.description = description;
    existingCommand.response = response;
    existingCommand.isActive = true;
  } else {
    this.settings.customCommands.push({
      command: command.toLowerCase(),
      description,
      response,
      isActive: true
    });
  }
  
  return this.save();
};

botSchema.methods.removeCustomCommand = function(command) {
  this.settings.customCommands = this.settings.customCommands.filter(
    cmd => cmd.command !== command.toLowerCase()
  );
  return this.save();
};

botSchema.methods.getCustomCommand = function(command) {
  return this.settings.customCommands.find(
    cmd => cmd.command === command.toLowerCase() && cmd.isActive
  );
};

botSchema.methods.updateLastActive = function() {
  this.lastActiveAt = new Date();
  return this.save({ validateBeforeSave: false });
};

// Static methods
botSchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId };
  
  if (options.activeOnly) {
    query.isActive = true;
  }
  
  if (options.verifiedOnly) {
    query.isVerified = true;
  }
  
  return this.find(query).sort({ createdAt: -1 });
};

botSchema.statics.findByToken = function(botToken) {
  return this.findOne({ botToken });
};

botSchema.statics.findByUsername = function(botUsername) {
  return this.findOne({ botUsername: botUsername.toLowerCase() });
};

botSchema.statics.findActiveBots = function() {
  return this.find({ isActive: true, isVerified: true }).sort({ lastActiveAt: -1 });
};

botSchema.statics.getStatistics = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalBots: { $sum: 1 },
        activeBots: {
          $sum: {
            $cond: [{ $eq: ['$isActive', true] }, 1, 0]
          }
        },
        verifiedBots: {
          $sum: {
            $cond: [{ $eq: ['$isVerified', true] }, 1, 0]
          }
        },
        totalMessagesSent: { $sum: '$stats.totalMessagesSent' },
        totalMessagesReceived: { $sum: '$stats.totalMessagesReceived' },
        totalErrors: { $sum: '$stats.totalErrors' }
      }
    }
  ]);
};

// Transform output
botSchema.methods.toJSON = function() {
  const bot = this.toObject();
  
  // Remove sensitive information
  delete bot.botToken;
  delete bot.webhookSecret;
  
  // Add computed fields
  bot.rateLimitStatus = this.rateLimitStatus;
  
  return bot;
};

// Create and export model
const Bot = mongoose.model('Bot', botSchema);

module.exports = Bot;