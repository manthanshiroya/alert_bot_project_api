const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: ['tradingview'],
    default: 'tradingview'
  },
  webhook: {
    receivedAt: {
      type: Date,
      default: Date.now
    },
    processedAt: Date,
    rawPayload: {
      type: Object,
      required: true
    },
    signature: String,
    ipAddress: String
  },
  alertData: {
    symbol: {
      type: String,
      required: true,
      uppercase: true
    },
    timeframe: {
      type: String,
      required: true
    },
    strategy: {
      type: String,
      required: true
    },
    signal: {
      type: String,
      enum: ['BUY', 'SELL', 'TP_HIT', 'SL_HIT'],
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    takeProfitPrice: Number,
    stopLossPrice: Number,
    timestamp: {
      type: Date,
      required: true
    },
    additionalData: Object
  },
  processing: {
    status: {
      type: String,
      enum: ['received', 'processing', 'processed', 'failed'],
      default: 'received'
    },
    alertConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AlertConfiguration'
    },
    matchedUsers: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserSubscription'
      },
      delivered: {
        type: Boolean,
        default: false
      },
      deliveredAt: Date,
      error: String
    }],
    tradeActions: [{
      action: {
        type: String,
        enum: ['open_trade', 'close_trade', 'replace_trade']
      },
      tradeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Trade'
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      executed: {
        type: Boolean,
        default: false
      },
      executedAt: Date,
      error: String
    }],
    errors: [{
      type: String,
      message: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
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
alertSchema.index({ 'webhook.receivedAt': 1 });
alertSchema.index({ 'processing.status': 1 });
alertSchema.index({ 'alertData.symbol': 1 });
alertSchema.index({ 'alertData.strategy': 1 });
alertSchema.index({ 'alertData.signal': 1 });
alertSchema.index({ 'processing.alertConfigId': 1 });
alertSchema.index({ 'processing.matchedUsers.userId': 1 });

// Static methods
alertSchema.statics.findBySymbol = function(symbol) {
  return this.find({ 'alertData.symbol': symbol.toUpperCase() });
};

alertSchema.statics.findByStrategy = function(strategy) {
  return this.find({ 'alertData.strategy': strategy });
};

alertSchema.statics.findByStatus = function(status) {
  return this.find({ 'processing.status': status });
};

alertSchema.statics.findPendingAlerts = function() {
  return this.find({ 'processing.status': { $in: ['received', 'processing'] } });
};

// Instance methods
alertSchema.methods.markAsProcessing = function() {
  this.processing.status = 'processing';
  this.updatedAt = new Date();
  return this.save();
};

alertSchema.methods.markAsProcessed = function() {
  this.processing.status = 'processed';
  this.webhook.processedAt = new Date();
  this.updatedAt = new Date();
  return this.save();
};

alertSchema.methods.markAsFailed = function(error) {
  this.processing.status = 'failed';
  this.processing.errors.push({
    type: 'processing_error',
    message: error.message || error,
    timestamp: new Date()
  });
  this.updatedAt = new Date();
  return this.save();
};

alertSchema.methods.addMatchedUser = function(userId, subscriptionId) {
  this.processing.matchedUsers.push({
    userId,
    subscriptionId,
    delivered: false
  });
  return this.save();
};

alertSchema.methods.markUserDelivered = function(userId) {
  const matchedUser = this.processing.matchedUsers.find(
    user => user.userId.toString() === userId.toString()
  );
  if (matchedUser) {
    matchedUser.delivered = true;
    matchedUser.deliveredAt = new Date();
  }
  return this.save();
};

module.exports = mongoose.model('Alert', alertSchema);