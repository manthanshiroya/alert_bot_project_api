const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Message Schema
 * Represents a message sent or received through Telegram
 */
const messageSchema = new Schema({
  // Message identification
  messageId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },

  // Associated entities
  botId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Bot',
    index: true
  },

  chatId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Chat',
    index: true
  },

  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    index: true
  },

  // Telegram-specific IDs
  telegramMessageId: {
    type: Number,
    required: true,
    index: true
  },

  telegramChatId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },

  telegramUserId: {
    type: String,
    index: true,
    trim: true
  },

  // Message direction and type
  direction: {
    type: String,
    required: true,
    enum: ['inbound', 'outbound'],
    index: true
  },

  messageType: {
    type: String,
    required: true,
    enum: [
      'text', 'photo', 'video', 'audio', 'voice', 'document', 
      'sticker', 'animation', 'location', 'contact', 'poll',
      'venue', 'dice', 'video_note', 'game', 'invoice',
      'successful_payment', 'passport_data', 'proximity_alert',
      'voice_chat_started', 'voice_chat_ended', 'voice_chat_participants_invited',
      'message_auto_delete_timer_changed', 'migrate_to_chat_id',
      'migrate_from_chat_id', 'pinned_message', 'new_chat_members',
      'left_chat_member', 'new_chat_title', 'new_chat_photo',
      'delete_chat_photo', 'group_chat_created', 'supergroup_chat_created',
      'channel_chat_created', 'alert', 'notification', 'command'
    ],
    index: true
  },

  // Alert-specific information
  alertType: {
    type: String,
    enum: ['price', 'volume', 'technical', 'news', 'custom'],
    index: true
  },

  alertId: {
    type: Schema.Types.ObjectId,
    ref: 'Alert',
    index: true
  },

  // Message content
  content: {
    text: {
      type: String,
      trim: true,
      maxlength: 4096 // Telegram's text message limit
    },

    caption: {
      type: String,
      trim: true,
      maxlength: 1024 // Telegram's caption limit
    },

    entities: [{
      type: {
        type: String,
        enum: [
          'mention', 'hashtag', 'cashtag', 'bot_command', 'url', 'email',
          'phone_number', 'bold', 'italic', 'underline', 'strikethrough',
          'spoiler', 'code', 'pre', 'text_link', 'text_mention'
        ]
      },
      offset: {
        type: Number,
        min: 0
      },
      length: {
        type: Number,
        min: 1
      },
      url: {
        type: String,
        trim: true
      },
      user: {
        type: Schema.Types.Mixed
      },
      language: {
        type: String,
        trim: true
      }
    }],

    // Media information
    media: {
      fileId: {
        type: String,
        trim: true
      },
      fileUniqueId: {
        type: String,
        trim: true
      },
      fileName: {
        type: String,
        trim: true
      },
      mimeType: {
        type: String,
        trim: true
      },
      fileSize: {
        type: Number,
        min: 0
      },
      width: {
        type: Number,
        min: 0
      },
      height: {
        type: Number,
        min: 0
      },
      duration: {
        type: Number,
        min: 0
      },
      thumbnail: {
        fileId: String,
        fileUniqueId: String,
        width: Number,
        height: Number,
        fileSize: Number
      }
    },

    // Location information
    location: {
      latitude: {
        type: Number,
        min: -90,
        max: 90
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180
      },
      horizontalAccuracy: {
        type: Number,
        min: 0
      },
      livePeriod: {
        type: Number,
        min: 0
      },
      heading: {
        type: Number,
        min: 0,
        max: 360
      },
      proximityAlertRadius: {
        type: Number,
        min: 0
      }
    },

    // Contact information
    contact: {
      phoneNumber: {
        type: String,
        trim: true
      },
      firstName: {
        type: String,
        trim: true
      },
      lastName: {
        type: String,
        trim: true
      },
      userId: {
        type: String,
        trim: true
      },
      vcard: {
        type: String,
        trim: true
      }
    },

    // Poll information
    poll: {
      id: {
        type: String,
        trim: true
      },
      question: {
        type: String,
        trim: true
      },
      options: [{
        text: String,
        voterCount: Number
      }],
      totalVoterCount: {
        type: Number,
        min: 0
      },
      isClosed: {
        type: Boolean,
        default: false
      },
      isAnonymous: {
        type: Boolean,
        default: true
      },
      type: {
        type: String,
        enum: ['regular', 'quiz']
      },
      allowsMultipleAnswers: {
        type: Boolean,
        default: false
      },
      correctOptionId: {
        type: Number,
        min: 0
      },
      explanation: {
        type: String,
        trim: true
      },
      openPeriod: {
        type: Number,
        min: 0
      },
      closeDate: {
        type: Date
      }
    }
  },

  // Message formatting
  parseMode: {
    type: String,
    enum: ['Markdown', 'MarkdownV2', 'HTML'],
    default: 'Markdown'
  },

  // Message options
  options: {
    disableWebPagePreview: {
      type: Boolean,
      default: false
    },

    disableNotification: {
      type: Boolean,
      default: false
    },

    protectContent: {
      type: Boolean,
      default: false
    },

    allowSendingWithoutReply: {
      type: Boolean,
      default: true
    },

    replyToMessageId: {
      type: Number
    }
  },

  // Inline keyboard (for outbound messages)
  inlineKeyboard: [[
    {
      text: {
        type: String,
        required: true,
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
      },
      switchInlineQuery: {
        type: String,
        trim: true
      },
      switchInlineQueryCurrentChat: {
        type: String,
        trim: true
      },
      pay: {
        type: Boolean
      }
    }
  ]],

  // Message status
  status: {
    type: String,
    required: true,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'deleted'],
    default: 'pending',
    index: true
  },

  // Delivery information
  delivery: {
    sentAt: {
      type: Date,
      index: true
    },

    deliveredAt: {
      type: Date
    },

    readAt: {
      type: Date
    },

    failedAt: {
      type: Date
    },

    deletedAt: {
      type: Date
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0
    },

    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
      max: 10
    },

    nextRetryAt: {
      type: Date
    },

    retryDelay: {
      type: Number,
      default: 5000, // 5 seconds
      min: 1000,
      max: 300000 // 5 minutes
    }
  },

  // Error information
  error: {
    code: {
      type: String,
      trim: true
    },

    message: {
      type: String,
      trim: true
    },

    description: {
      type: String,
      trim: true
    },

    parameters: {
      type: Schema.Types.Mixed
    },

    retryAfter: {
      type: Number,
      min: 0
    },

    timestamp: {
      type: Date
    }
  },

  // Processing information
  processing: {
    queuedAt: {
      type: Date,
      index: true
    },

    processingStartedAt: {
      type: Date
    },

    processingCompletedAt: {
      type: Date
    },

    processingDuration: {
      type: Number,
      min: 0
    },

    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
      index: true
    },

    batchId: {
      type: String,
      trim: true,
      index: true
    }
  },

  // Analytics and tracking
  analytics: {
    source: {
      type: String,
      enum: ['manual', 'alert', 'scheduled', 'webhook', 'api', 'bot_command'],
      default: 'manual',
      index: true
    },

    campaign: {
      type: String,
      trim: true,
      index: true
    },

    tags: [{
      type: String,
      trim: true,
      lowercase: true
    }],

    userAgent: {
      type: String,
      trim: true
    },

    ipAddress: {
      type: String,
      trim: true
    },

    referrer: {
      type: String,
      trim: true
    }
  },

  // Auto-delete settings
  autoDelete: {
    enabled: {
      type: Boolean,
      default: false
    },

    deleteAt: {
      type: Date,
      index: true
    },

    deleteAfterMinutes: {
      type: Number,
      min: 1,
      max: 10080 // 1 week
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

  // Soft delete
  deletedAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'messages'
});

// Indexes
messageSchema.index({ botId: 1, chatId: 1 });
messageSchema.index({ telegramChatId: 1, telegramMessageId: 1 });
messageSchema.index({ userId: 1, createdAt: -1 });
messageSchema.index({ direction: 1, status: 1 });
messageSchema.index({ messageType: 1, alertType: 1 });
messageSchema.index({ status: 1, 'delivery.nextRetryAt': 1 });
messageSchema.index({ 'processing.queuedAt': 1, 'processing.priority': 1 });
messageSchema.index({ 'processing.batchId': 1 });
messageSchema.index({ 'autoDelete.deleteAt': 1 }, { sparse: true });
messageSchema.index({ 'analytics.source': 1, 'analytics.campaign': 1 });
messageSchema.index({ createdAt: -1 });
messageSchema.index({ deletedAt: 1 }, { sparse: true });

// Compound indexes for common queries
messageSchema.index({ 
  botId: 1, 
  chatId: 1, 
  direction: 1, 
  createdAt: -1 
});

messageSchema.index({ 
  userId: 1, 
  messageType: 1, 
  status: 1, 
  createdAt: -1 
});

messageSchema.index({ 
  alertType: 1, 
  status: 1, 
  'delivery.sentAt': -1 
});

// Virtual for message age
messageSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

// Virtual for delivery duration
messageSchema.virtual('deliveryDuration').get(function() {
  if (this.delivery.sentAt && this.delivery.deliveredAt) {
    return this.delivery.deliveredAt.getTime() - this.delivery.sentAt.getTime();
  }
  return null;
});

// Virtual for processing duration calculation
messageSchema.virtual('totalProcessingDuration').get(function() {
  if (this.processing.processingStartedAt && this.processing.processingCompletedAt) {
    return this.processing.processingCompletedAt.getTime() - this.processing.processingStartedAt.getTime();
  }
  return null;
});

// Virtual for retry status
messageSchema.virtual('retryStatus').get(function() {
  return {
    canRetry: this.delivery.attempts < this.delivery.maxAttempts,
    attemptsRemaining: Math.max(0, this.delivery.maxAttempts - this.delivery.attempts),
    nextRetryIn: this.delivery.nextRetryAt ? Math.max(0, this.delivery.nextRetryAt.getTime() - Date.now()) : 0
  };
});

// Virtual for content preview
messageSchema.virtual('contentPreview').get(function() {
  if (this.content.text) {
    return this.content.text.length > 100 ? 
      this.content.text.substring(0, 100) + '...' : 
      this.content.text;
  }
  
  if (this.content.caption) {
    return this.content.caption.length > 100 ? 
      this.content.caption.substring(0, 100) + '...' : 
      this.content.caption;
  }
  
  return `[${this.messageType.toUpperCase()}]`;
});

// Pre-save middleware
messageSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Set auto-delete time if enabled
  if (this.autoDelete.enabled && this.autoDelete.deleteAfterMinutes && !this.autoDelete.deleteAt) {
    this.autoDelete.deleteAt = new Date(Date.now() + (this.autoDelete.deleteAfterMinutes * 60 * 1000));
  }
  
  // Calculate processing duration
  if (this.processing.processingStartedAt && this.processing.processingCompletedAt) {
    this.processing.processingDuration = this.processing.processingCompletedAt.getTime() - this.processing.processingStartedAt.getTime();
  }
  
  next();
});

// Instance methods
messageSchema.methods.markAsSent = function(telegramResponse) {
  this.status = 'sent';
  this.delivery.sentAt = new Date();
  
  if (telegramResponse && telegramResponse.message_id) {
    this.telegramMessageId = telegramResponse.message_id;
  }
  
  return this.save();
};

messageSchema.methods.markAsDelivered = function() {
  this.status = 'delivered';
  this.delivery.deliveredAt = new Date();
  return this.save();
};

messageSchema.methods.markAsRead = function() {
  this.status = 'read';
  this.delivery.readAt = new Date();
  return this.save();
};

messageSchema.methods.markAsFailed = function(error) {
  this.status = 'failed';
  this.delivery.failedAt = new Date();
  
  if (error) {
    this.error = {
      code: error.code || 'UNKNOWN',
      message: error.message || 'Unknown error',
      description: error.description || '',
      parameters: error.parameters || {},
      retryAfter: error.retry_after || null,
      timestamp: new Date()
    };
  }
  
  return this.save();
};

messageSchema.methods.incrementAttempt = function() {
  this.delivery.attempts += 1;
  
  if (this.delivery.attempts < this.delivery.maxAttempts) {
    // Calculate exponential backoff
    const baseDelay = this.delivery.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, this.delivery.attempts - 1);
    const jitter = Math.random() * 1000; // Add some randomness
    const totalDelay = Math.min(exponentialDelay + jitter, 300000); // Max 5 minutes
    
    this.delivery.nextRetryAt = new Date(Date.now() + totalDelay);
    this.status = 'pending';
  } else {
    this.status = 'failed';
    this.delivery.failedAt = new Date();
  }
  
  return this.save();
};

messageSchema.methods.startProcessing = function() {
  this.processing.processingStartedAt = new Date();
  return this.save({ validateBeforeSave: false });
};

messageSchema.methods.completeProcessing = function() {
  this.processing.processingCompletedAt = new Date();
  if (this.processing.processingStartedAt) {
    this.processing.processingDuration = this.processing.processingCompletedAt.getTime() - this.processing.processingStartedAt.getTime();
  }
  return this.save({ validateBeforeSave: false });
};

messageSchema.methods.addToQueue = function(priority = 'normal', batchId = null) {
  this.processing.queuedAt = new Date();
  this.processing.priority = priority;
  if (batchId) {
    this.processing.batchId = batchId;
  }
  return this.save();
};

messageSchema.methods.addTag = function(tag) {
  if (!this.analytics.tags.includes(tag.toLowerCase())) {
    this.analytics.tags.push(tag.toLowerCase());
    return this.save();
  }
  return Promise.resolve(this);
};

messageSchema.methods.removeTag = function(tag) {
  const index = this.analytics.tags.indexOf(tag.toLowerCase());
  if (index > -1) {
    this.analytics.tags.splice(index, 1);
    return this.save();
  }
  return Promise.resolve(this);
};

messageSchema.methods.softDelete = function() {
  this.deletedAt = new Date();
  this.status = 'deleted';
  this.delivery.deletedAt = new Date();
  return this.save();
};

messageSchema.methods.restore = function() {
  this.deletedAt = null;
  this.delivery.deletedAt = null;
  if (this.status === 'deleted') {
    this.status = 'pending';
  }
  return this.save();
};

// Static methods
messageSchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId };
  
  if (options.direction) {
    query.direction = options.direction;
  }
  
  if (options.messageType) {
    query.messageType = options.messageType;
  }
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.alertType) {
    query.alertType = options.alertType;
  }
  
  if (options.dateFrom) {
    query.createdAt = { $gte: options.dateFrom };
  }
  
  if (options.dateTo) {
    query.createdAt = query.createdAt || {};
    query.createdAt.$lte = options.dateTo;
  }
  
  if (options.excludeDeleted) {
    query.deletedAt = null;
  }
  
  const queryBuilder = this.find(query);
  
  if (options.populate) {
    queryBuilder.populate(options.populate);
  }
  
  return queryBuilder.sort({ createdAt: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0);
};

messageSchema.statics.findByChatId = function(chatId, options = {}) {
  const query = { chatId };
  
  if (options.direction) {
    query.direction = options.direction;
  }
  
  if (options.messageType) {
    query.messageType = options.messageType;
  }
  
  if (options.excludeDeleted) {
    query.deletedAt = null;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0);
};

messageSchema.statics.findPendingMessages = function(limit = 100) {
  return this.find({
    status: 'pending',
    deletedAt: null,
    $or: [
      { 'delivery.nextRetryAt': { $lte: new Date() } },
      { 'delivery.nextRetryAt': null }
    ]
  })
  .sort({ 
    'processing.priority': -1, 
    'processing.queuedAt': 1 
  })
  .limit(limit);
};

messageSchema.statics.findFailedMessages = function(options = {}) {
  const query = {
    status: 'failed',
    deletedAt: null
  };
  
  if (options.retryable) {
    query['delivery.attempts'] = { $lt: options.maxAttempts || 3 };
  }
  
  if (options.errorCode) {
    query['error.code'] = options.errorCode;
  }
  
  if (options.dateFrom) {
    query['delivery.failedAt'] = { $gte: options.dateFrom };
  }
  
  return this.find(query)
    .sort({ 'delivery.failedAt': -1 })
    .limit(options.limit || 100);
};

messageSchema.statics.findMessagesForAutoDelete = function(limit = 100) {
  return this.find({
    'autoDelete.enabled': true,
    'autoDelete.deleteAt': { $lte: new Date() },
    deletedAt: null
  })
  .sort({ 'autoDelete.deleteAt': 1 })
  .limit(limit);
};

messageSchema.statics.getStatistics = function(filters = {}) {
  const matchStage = { deletedAt: null };
  
  if (filters.userId) {
    matchStage.userId = mongoose.Types.ObjectId(filters.userId);
  }
  
  if (filters.botId) {
    matchStage.botId = mongoose.Types.ObjectId(filters.botId);
  }
  
  if (filters.chatId) {
    matchStage.chatId = mongoose.Types.ObjectId(filters.chatId);
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
        totalMessages: { $sum: 1 },
        sentMessages: {
          $sum: {
            $cond: [{ $eq: ['$status', 'sent'] }, 1, 0]
          }
        },
        deliveredMessages: {
          $sum: {
            $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0]
          }
        },
        failedMessages: {
          $sum: {
            $cond: [{ $eq: ['$status', 'failed'] }, 1, 0]
          }
        },
        pendingMessages: {
          $sum: {
            $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
          }
        },
        inboundMessages: {
          $sum: {
            $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0]
          }
        },
        outboundMessages: {
          $sum: {
            $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0]
          }
        },
        alertMessages: {
          $sum: {
            $cond: [{ $eq: ['$messageType', 'alert'] }, 1, 0]
          }
        },
        averageDeliveryTime: {
          $avg: {
            $cond: [
              { $and: ['$delivery.sentAt', '$delivery.deliveredAt'] },
              { $subtract: ['$delivery.deliveredAt', '$delivery.sentAt'] },
              null
            ]
          }
        },
        averageProcessingTime: {
          $avg: '$processing.processingDuration'
        }
      }
    }
  ]);
};

messageSchema.statics.getMessageTypeStatistics = function(filters = {}) {
  const matchStage = { deletedAt: null };
  
  if (filters.userId) {
    matchStage.userId = mongoose.Types.ObjectId(filters.userId);
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
        _id: '$messageType',
        count: { $sum: 1 },
        successRate: {
          $avg: {
            $cond: [
              { $in: ['$status', ['sent', 'delivered', 'read']] },
              1,
              0
            ]
          }
        }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Transform output
messageSchema.methods.toJSON = function() {
  const message = this.toObject();
  
  // Add computed fields
  message.age = this.age;
  message.deliveryDuration = this.deliveryDuration;
  message.totalProcessingDuration = this.totalProcessingDuration;
  message.retryStatus = this.retryStatus;
  message.contentPreview = this.contentPreview;
  
  return message;
};

// Create and export model
const Message = mongoose.model('Message', messageSchema);

module.exports = Message;