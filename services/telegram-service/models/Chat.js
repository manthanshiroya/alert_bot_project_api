const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Chat Schema
 * Represents a Telegram chat (private, group, supergroup, or channel)
 */
const chatSchema = new Schema({
  // Chat identification
  chatId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },

  // Associated bot and user
  botId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Bot',
    index: true
  },

  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    index: true
  },

  // Chat information
  type: {
    type: String,
    required: true,
    enum: ['private', 'group', 'supergroup', 'channel'],
    index: true
  },

  title: {
    type: String,
    trim: true,
    maxlength: 255
  },

  username: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true, // Allow null values but ensure uniqueness when present
    validate: {
      validator: function(username) {
        if (!username) return true; // Optional field
        return /^[a-zA-Z0-9_]{5,32}$/.test(username);
      },
      message: 'Invalid Telegram username format'
    }
  },

  firstName: {
    type: String,
    trim: true,
    maxlength: 64
  },

  lastName: {
    type: String,
    trim: true,
    maxlength: 64
  },

  description: {
    type: String,
    trim: true,
    maxlength: 255
  },

  // Chat status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  isBlocked: {
    type: Boolean,
    default: false,
    index: true
  },

  isMuted: {
    type: Boolean,
    default: false,
    index: true
  },

  // Bot permissions in this chat
  permissions: {
    canSendMessages: {
      type: Boolean,
      default: true
    },

    canSendMediaMessages: {
      type: Boolean,
      default: true
    },

    canSendPolls: {
      type: Boolean,
      default: false
    },

    canSendOtherMessages: {
      type: Boolean,
      default: false
    },

    canAddWebPagePreviews: {
      type: Boolean,
      default: true
    },

    canChangeInfo: {
      type: Boolean,
      default: false
    },

    canInviteUsers: {
      type: Boolean,
      default: false
    },

    canPinMessages: {
      type: Boolean,
      default: false
    },

    canManageTopics: {
      type: Boolean,
      default: false
    }
  },

  // Chat settings
  settings: {
    // Notification preferences
    enableAlerts: {
      type: Boolean,
      default: true
    },

    alertTypes: [{
      type: String,
      enum: ['price', 'volume', 'technical', 'news', 'custom'],
      default: ['price', 'volume']
    }],

    // Message formatting
    messageFormat: {
      type: String,
      enum: ['text', 'markdown', 'html'],
      default: 'markdown'
    },

    // Quiet hours
    quietHours: {
      enabled: {
        type: Boolean,
        default: false
      },
      startTime: {
        type: String,
        default: '22:00',
        validate: {
          validator: function(time) {
            return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
          },
          message: 'Invalid time format (HH:MM)'
        }
      },
      endTime: {
        type: String,
        default: '08:00',
        validate: {
          validator: function(time) {
            return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
          },
          message: 'Invalid time format (HH:MM)'
        }
      },
      timezone: {
        type: String,
        default: 'UTC'
      }
    },

    // Rate limiting
    maxMessagesPerHour: {
      type: Number,
      default: 60,
      min: 1,
      max: 1000
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

    // Auto-delete messages
    autoDeleteMessages: {
      enabled: {
        type: Boolean,
        default: false
      },
      deleteAfterMinutes: {
        type: Number,
        default: 60,
        min: 1,
        max: 10080 // 1 week
      }
    }
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

    totalAlertsSent: {
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

    lastAlertSent: {
      type: Date
    },

    lastError: {
      type: Date
    },

    // Rate limiting counters
    messagesThisHour: {
      type: Number,
      default: 0,
      min: 0
    },

    lastHourReset: {
      type: Date,
      default: Date.now
    }
  },

  // Chat member information (for groups/channels)
  memberInfo: {
    memberCount: {
      type: Number,
      min: 0
    },

    administratorCount: {
      type: Number,
      min: 0
    },

    botStatus: {
      type: String,
      enum: ['creator', 'administrator', 'member', 'restricted', 'left', 'kicked'],
      default: 'member'
    },

    joinedAt: {
      type: Date
    },

    leftAt: {
      type: Date
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
  collection: 'chats'
});

// Indexes
chatSchema.index({ botId: 1, userId: 1 });
chatSchema.index({ chatId: 1, botId: 1 }, { unique: true });
chatSchema.index({ type: 1, isActive: 1 });
chatSchema.index({ userId: 1, isActive: 1 });
chatSchema.index({ username: 1 }, { sparse: true });
chatSchema.index({ createdAt: -1 });
chatSchema.index({ lastActiveAt: -1 });
chatSchema.index({ deletedAt: 1 }, { sparse: true });

// Virtual for full name
chatSchema.virtual('fullName').get(function() {
  if (this.type === 'private') {
    const parts = [];
    if (this.firstName) parts.push(this.firstName);
    if (this.lastName) parts.push(this.lastName);
    return parts.join(' ') || this.username || 'Unknown';
  }
  return this.title || this.username || 'Unknown';
});

// Virtual for display name
chatSchema.virtual('displayName').get(function() {
  if (this.title) return this.title;
  if (this.username) return `@${this.username}`;
  return this.fullName;
});

// Virtual for rate limit status
chatSchema.virtual('rateLimitStatus').get(function() {
  const now = new Date();
  const hoursSinceReset = Math.floor((now - this.stats.lastHourReset) / 3600000);

  return {
    messagesThisHour: hoursSinceReset >= 1 ? 0 : this.stats.messagesThisHour,
    canSendMessage: (
      hoursSinceReset >= 1 || 
      this.stats.messagesThisHour < this.settings.maxMessagesPerHour
    )
  };
});

// Virtual for quiet hours status
chatSchema.virtual('isQuietHours').get(function() {
  if (!this.settings.quietHours.enabled) return false;

  const now = new Date();
  const timezone = this.settings.quietHours.timezone || 'UTC';
  
  try {
    const currentTime = now.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    const startTime = this.settings.quietHours.startTime;
    const endTime = this.settings.quietHours.endTime;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime <= endTime;
    } else {
      return currentTime >= startTime && currentTime <= endTime;
    }
  } catch (error) {
    return false;
  }
});

// Pre-save middleware
chatSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Reset rate limit counters if needed
  const now = new Date();
  const hoursSinceReset = Math.floor((now - this.stats.lastHourReset) / 3600000);
  
  if (hoursSinceReset >= 1) {
    this.stats.messagesThisHour = 0;
    this.stats.lastHourReset = now;
  }
  
  next();
});

// Instance methods
chatSchema.methods.incrementMessageCount = function(type = 'sent') {
  const now = new Date();
  
  if (type === 'sent') {
    this.stats.totalMessagesSent += 1;
    this.stats.messagesThisHour += 1;
    this.stats.lastMessageSent = now;
  } else if (type === 'received') {
    this.stats.totalMessagesReceived += 1;
    this.stats.lastMessageReceived = now;
  } else if (type === 'alert') {
    this.stats.totalAlertsSent += 1;
    this.stats.totalMessagesSent += 1;
    this.stats.messagesThisHour += 1;
    this.stats.lastAlertSent = now;
    this.stats.lastMessageSent = now;
  }
  
  this.lastActiveAt = now;
  return this.save();
};

chatSchema.methods.incrementErrorCount = function(error) {
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

chatSchema.methods.canSendMessage = function() {
  if (!this.isActive || this.isBlocked || this.isMuted) {
    return false;
  }
  
  if (this.isQuietHours) {
    return false;
  }
  
  const rateLimitStatus = this.rateLimitStatus;
  return rateLimitStatus.canSendMessage && this.permissions.canSendMessages;
};

chatSchema.methods.canSendAlertType = function(alertType) {
  return this.settings.enableAlerts && 
         this.settings.alertTypes.includes(alertType) &&
         this.canSendMessage();
};

chatSchema.methods.updatePermissions = function(permissions) {
  Object.assign(this.permissions, permissions);
  return this.save();
};

chatSchema.methods.updateSettings = function(settings) {
  Object.assign(this.settings, settings);
  return this.save();
};

chatSchema.methods.updateMemberInfo = function(memberInfo) {
  Object.assign(this.memberInfo, memberInfo);
  return this.save();
};

chatSchema.methods.block = function(reason) {
  this.isBlocked = true;
  this.isActive = false;
  this.metadata.blockReason = reason;
  this.metadata.blockedAt = new Date();
  return this.save();
};

chatSchema.methods.unblock = function() {
  this.isBlocked = false;
  this.isActive = true;
  this.metadata.blockReason = null;
  this.metadata.unblockedAt = new Date();
  return this.save();
};

chatSchema.methods.mute = function(duration) {
  this.isMuted = true;
  if (duration) {
    this.metadata.muteUntil = new Date(Date.now() + duration);
  }
  this.metadata.mutedAt = new Date();
  return this.save();
};

chatSchema.methods.unmute = function() {
  this.isMuted = false;
  this.metadata.muteUntil = null;
  this.metadata.unmutedAt = new Date();
  return this.save();
};

chatSchema.methods.softDelete = function() {
  this.deletedAt = new Date();
  this.isActive = false;
  return this.save();
};

chatSchema.methods.restore = function() {
  this.deletedAt = null;
  this.isActive = true;
  return this.save();
};

chatSchema.methods.updateLastActive = function() {
  this.lastActiveAt = new Date();
  return this.save({ validateBeforeSave: false });
};

// Static methods
chatSchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId };
  
  if (options.activeOnly) {
    query.isActive = true;
    query.deletedAt = null;
  }
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.botId) {
    query.botId = options.botId;
  }
  
  return this.find(query).sort({ lastActiveAt: -1 });
};

chatSchema.statics.findByChatId = function(chatId, botId) {
  const query = { chatId };
  if (botId) {
    query.botId = botId;
  }
  return this.findOne(query);
};

chatSchema.statics.findByBotId = function(botId, options = {}) {
  const query = { botId };
  
  if (options.activeOnly) {
    query.isActive = true;
    query.deletedAt = null;
  }
  
  if (options.type) {
    query.type = options.type;
  }
  
  return this.find(query).sort({ lastActiveAt: -1 });
};

chatSchema.statics.findActiveChats = function(alertType) {
  const query = {
    isActive: true,
    isBlocked: false,
    isMuted: false,
    deletedAt: null,
    'settings.enableAlerts': true
  };
  
  if (alertType) {
    query['settings.alertTypes'] = alertType;
  }
  
  return this.find(query)
    .populate('botId', 'isActive isVerified settings')
    .sort({ lastActiveAt: -1 });
};

chatSchema.statics.getStatistics = function(botId) {
  const matchStage = { deletedAt: null };
  if (botId) {
    matchStage.botId = mongoose.Types.ObjectId(botId);
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalChats: { $sum: 1 },
        activeChats: {
          $sum: {
            $cond: [{ $eq: ['$isActive', true] }, 1, 0]
          }
        },
        privateChats: {
          $sum: {
            $cond: [{ $eq: ['$type', 'private'] }, 1, 0]
          }
        },
        groupChats: {
          $sum: {
            $cond: [{ $in: ['$type', ['group', 'supergroup']] }, 1, 0]
          }
        },
        channels: {
          $sum: {
            $cond: [{ $eq: ['$type', 'channel'] }, 1, 0]
          }
        },
        totalMessagesSent: { $sum: '$stats.totalMessagesSent' },
        totalMessagesReceived: { $sum: '$stats.totalMessagesReceived' },
        totalAlertsSent: { $sum: '$stats.totalAlertsSent' },
        totalErrors: { $sum: '$stats.totalErrors' }
      }
    }
  ]);
};

// Transform output
chatSchema.methods.toJSON = function() {
  const chat = this.toObject();
  
  // Add computed fields
  chat.fullName = this.fullName;
  chat.displayName = this.displayName;
  chat.rateLimitStatus = this.rateLimitStatus;
  chat.isQuietHours = this.isQuietHours;
  
  return chat;
};

// Create and export model
const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;