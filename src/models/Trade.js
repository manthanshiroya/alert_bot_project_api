const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  tradeNumber: {
    type: Number,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  alertConfigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AlertConfiguration',
    required: true
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserSubscription',
    required: true
  },
  tradeData: {
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
      enum: ['BUY', 'SELL'],
      required: true
    },
    entryPrice: {
      type: Number,
      required: true
    },
    takeProfitPrice: Number,
    stopLossPrice: Number,
    exitPrice: Number,
    exitReason: {
      type: String,
      enum: ['TP_HIT', 'SL_HIT', 'REPLACED', 'MANUAL']
    }
  },
  status: {
    type: String,
    enum: ['open', 'closed', 'replaced'],
    default: 'open'
  },
  pnl: {
    amount: Number,
    percentage: Number,
    currency: {
      type: String,
      default: 'USD'
    }
  },
  timestamps: {
    openedAt: {
      type: Date,
      default: Date.now
    },
    closedAt: Date,
    replacedAt: Date
  },
  alerts: {
    entryAlertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Alert'
    },
    exitAlertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Alert'
    }
  },
  metadata: {
    replacedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trade'
    },
    replacementReason: String,
    notes: String
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
tradeSchema.index({ tradeNumber: 1 });
tradeSchema.index({ userId: 1 });
tradeSchema.index({ alertConfigId: 1 });
tradeSchema.index({ status: 1 });
tradeSchema.index({ 'tradeData.symbol': 1 });
tradeSchema.index({ userId: 1, status: 1 });
tradeSchema.index({ alertConfigId: 1, status: 1 });
tradeSchema.index({ 'timestamps.openedAt': 1 });
tradeSchema.index({ 'timestamps.closedAt': 1 });

// Static methods
tradeSchema.statics.getNextTradeNumber = async function() {
  const lastTrade = await this.findOne({}, {}, { sort: { tradeNumber: -1 } });
  return lastTrade ? lastTrade.tradeNumber + 1 : 1;
};

tradeSchema.statics.findOpenTrades = function(userId, alertConfigId) {
  const query = { status: 'open' };
  if (userId) query.userId = userId;
  if (alertConfigId) query.alertConfigId = alertConfigId;
  return this.find(query);
};

tradeSchema.statics.findBySymbol = function(symbol, userId) {
  const query = { 'tradeData.symbol': symbol.toUpperCase() };
  if (userId) query.userId = userId;
  return this.find(query);
};

tradeSchema.statics.findByStrategy = function(strategy, userId) {
  const query = { 'tradeData.strategy': strategy };
  if (userId) query.userId = userId;
  return this.find(query);
};

tradeSchema.statics.getUserTradeStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalPnl: { $sum: '$pnl.amount' },
        avgPnl: { $avg: '$pnl.amount' }
      }
    }
  ]);
  return stats;
};

// Instance methods
tradeSchema.methods.calculatePnL = function() {
  if (!this.tradeData.exitPrice || !this.tradeData.entryPrice) {
    return { amount: 0, percentage: 0 };
  }

  const entryPrice = this.tradeData.entryPrice;
  const exitPrice = this.tradeData.exitPrice;
  const signal = this.tradeData.signal;

  let pnlAmount, pnlPercentage;

  if (signal === 'BUY') {
    pnlAmount = exitPrice - entryPrice;
    pnlPercentage = ((exitPrice - entryPrice) / entryPrice) * 100;
  } else { // SELL
    pnlAmount = entryPrice - exitPrice;
    pnlPercentage = ((entryPrice - exitPrice) / entryPrice) * 100;
  }

  this.pnl = {
    amount: parseFloat(pnlAmount.toFixed(2)),
    percentage: parseFloat(pnlPercentage.toFixed(2)),
    currency: this.pnl?.currency || 'USD'
  };

  return this.pnl;
};

tradeSchema.methods.closeTrade = function(exitPrice, exitReason) {
  this.tradeData.exitPrice = exitPrice;
  this.tradeData.exitReason = exitReason;
  this.status = 'closed';
  this.timestamps.closedAt = new Date();
  this.calculatePnL();
  this.updatedAt = new Date();
  return this.save();
};

tradeSchema.methods.replaceTrade = function(replacedBy, reason) {
  this.status = 'replaced';
  this.timestamps.replacedAt = new Date();
  this.metadata.replacedBy = replacedBy;
  this.metadata.replacementReason = reason;
  this.updatedAt = new Date();
  return this.save();
};

tradeSchema.methods.isTPHit = function(currentPrice) {
  if (!this.tradeData.takeProfitPrice) return false;
  
  if (this.tradeData.signal === 'BUY') {
    return currentPrice >= this.tradeData.takeProfitPrice;
  } else {
    return currentPrice <= this.tradeData.takeProfitPrice;
  }
};

tradeSchema.methods.isSLHit = function(currentPrice) {
  if (!this.tradeData.stopLossPrice) return false;
  
  if (this.tradeData.signal === 'BUY') {
    return currentPrice <= this.tradeData.stopLossPrice;
  } else {
    return currentPrice >= this.tradeData.stopLossPrice;
  }
};

module.exports = mongoose.model('Trade', tradeSchema);