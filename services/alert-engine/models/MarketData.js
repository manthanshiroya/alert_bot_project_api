const mongoose = require('mongoose');
const { Schema } = mongoose;

// OHLCV data schema for candlestick data
const ohlcvSchema = new Schema({
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  open: {
    type: Number,
    required: true
  },
  high: {
    type: Number,
    required: true
  },
  low: {
    type: Number,
    required: true
  },
  close: {
    type: Number,
    required: true
  },
  volume: {
    type: Number,
    required: true,
    default: 0
  },
  trades: {
    type: Number,
    default: 0
  },
  interval: {
    type: String,
    required: true,
    enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']
  }
}, { _id: false });

// Technical indicators schema
const technicalIndicatorsSchema = new Schema({
  sma: {
    type: Map,
    of: Number // Key: period (e.g., "20", "50"), Value: SMA value
  },
  ema: {
    type: Map,
    of: Number
  },
  rsi: {
    type: Map,
    of: Number
  },
  macd: {
    histogram: Number,
    signal: Number,
    macd: Number
  },
  bollinger: {
    upper: Number,
    middle: Number,
    lower: Number,
    bandwidth: Number
  },
  stochastic: {
    k: Number,
    d: Number
  },
  williams: {
    type: Number
  },
  atr: {
    type: Number
  },
  adx: {
    adx: Number,
    plusDI: Number,
    minusDI: Number
  },
  obv: {
    type: Number
  },
  vwap: {
    type: Number
  }
}, { _id: false });

// Market statistics schema
const marketStatsSchema = new Schema({
  change24h: {
    type: Number,
    default: 0
  },
  changePercent24h: {
    type: Number,
    default: 0
  },
  high24h: {
    type: Number
  },
  low24h: {
    type: Number
  },
  volume24h: {
    type: Number,
    default: 0
  },
  volumeUsd24h: {
    type: Number,
    default: 0
  },
  marketCap: {
    type: Number
  },
  marketCapRank: {
    type: Number
  },
  circulatingSupply: {
    type: Number
  },
  totalSupply: {
    type: Number
  },
  maxSupply: {
    type: Number
  },
  volatility: {
    type: Number,
    default: 0
  },
  beta: {
    type: Number
  },
  correlation: {
    type: Map,
    of: Number // Correlation with other assets
  }
}, { _id: false });

// Order book data schema
const orderBookSchema = new Schema({
  bids: [{
    price: Number,
    quantity: Number
  }],
  asks: [{
    price: Number,
    quantity: Number
  }],
  spread: {
    type: Number
  },
  spreadPercent: {
    type: Number
  },
  depth: {
    type: Number
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// News sentiment schema
const sentimentSchema = new Schema({
  score: {
    type: Number,
    min: -1,
    max: 1,
    default: 0
  },
  magnitude: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },
  newsCount: {
    type: Number,
    default: 0
  },
  socialMentions: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Main MarketData schema
const marketDataSchema = new Schema({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  exchange: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  baseAsset: {
    type: String,
    uppercase: true,
    trim: true
  },
  quoteAsset: {
    type: String,
    uppercase: true,
    trim: true,
    default: 'USDT'
  },
  assetType: {
    type: String,
    enum: ['crypto', 'stock', 'forex', 'commodity', 'index'],
    default: 'crypto',
    index: true
  },
  currentPrice: {
    type: Number,
    required: true,
    index: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true
  },
  dataSource: {
    type: String,
    required: true,
    enum: ['binance', 'coinbase', 'kraken', 'coingecko', 'alphavantage', 'finnhub', 'manual'],
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  ohlcv: {
    type: Map,
    of: [ohlcvSchema] // Key: interval (e.g., "1h", "1d")
  },
  technicalIndicators: {
    type: technicalIndicatorsSchema
  },
  marketStats: {
    type: marketStatsSchema
  },
  orderBook: {
    type: orderBookSchema
  },
  sentiment: {
    type: sentimentSchema
  },
  metadata: {
    name: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    website: {
      type: String,
      trim: true
    },
    logo: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      trim: true
    },
    tags: [{
      type: String,
      trim: true
    }],
    launchDate: {
      type: Date
    },
    isStablecoin: {
      type: Boolean,
      default: false
    },
    isDeFi: {
      type: Boolean,
      default: false
    },
    isNFT: {
      type: Boolean,
      default: false
    }
  },
  quality: {
    dataAccuracy: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    lastValidation: {
      type: Date,
      default: Date.now
    },
    errorCount: {
      type: Number,
      default: 0
    },
    warningCount: {
      type: Number,
      default: 0
    },
    isReliable: {
      type: Boolean,
      default: true
    }
  },
  performance: {
    updateFrequency: {
      type: Number, // Updates per hour
      default: 60
    },
    averageLatency: {
      type: Number, // In milliseconds
      default: 0
    },
    lastUpdateDuration: {
      type: Number, // In milliseconds
      default: 0
    },
    successRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
marketDataSchema.index({ symbol: 1, exchange: 1 }, { unique: true });
marketDataSchema.index({ symbol: 1, lastUpdated: -1 });
marketDataSchema.index({ exchange: 1, assetType: 1 });
marketDataSchema.index({ currentPrice: 1 });
marketDataSchema.index({ 'marketStats.volume24h': -1 });
marketDataSchema.index({ 'marketStats.marketCap': -1 });
marketDataSchema.index({ 'marketStats.changePercent24h': -1 });
marketDataSchema.index({ isActive: 1, lastUpdated: -1 });
marketDataSchema.index({ dataSource: 1, lastUpdated: -1 });

// Compound indexes
marketDataSchema.index({ symbol: 1, exchange: 1, assetType: 1 });
marketDataSchema.index({ isActive: 1, symbol: 1, lastUpdated: -1 });

// TTL index for automatic cleanup of old data
marketDataSchema.index({ lastUpdated: 1 }, { 
  expireAfterSeconds: 30 * 24 * 60 * 60 // 30 days
});

// Virtual fields
marketDataSchema.virtual('isStale').get(function() {
  const staleThreshold = 5 * 60 * 1000; // 5 minutes
  return Date.now() - this.lastUpdated.getTime() > staleThreshold;
});

marketDataSchema.virtual('priceChange').get(function() {
  return this.marketStats?.change24h || 0;
});

marketDataSchema.virtual('priceChangePercent').get(function() {
  return this.marketStats?.changePercent24h || 0;
});

marketDataSchema.virtual('volume').get(function() {
  return this.marketStats?.volume24h || 0;
});

marketDataSchema.virtual('marketCap').get(function() {
  return this.marketStats?.marketCap || 0;
});

marketDataSchema.virtual('fullSymbol').get(function() {
  return `${this.symbol}/${this.quoteAsset}`;
});

// Instance methods
marketDataSchema.methods.updatePrice = function(newPrice, source = 'manual') {
  const oldPrice = this.currentPrice;
  this.currentPrice = newPrice;
  this.lastUpdated = new Date();
  this.dataSource = source;
  
  // Update 24h change if we have previous data
  if (oldPrice && oldPrice !== newPrice) {
    const change = newPrice - oldPrice;
    const changePercent = (change / oldPrice) * 100;
    
    if (!this.marketStats) {
      this.marketStats = {};
    }
    
    this.marketStats.change24h = change;
    this.marketStats.changePercent24h = changePercent;
  }
  
  return this;
};

marketDataSchema.methods.addOHLCV = function(interval, ohlcvData) {
  if (!this.ohlcv) {
    this.ohlcv = new Map();
  }
  
  if (!this.ohlcv.has(interval)) {
    this.ohlcv.set(interval, []);
  }
  
  const intervalData = this.ohlcv.get(interval);
  intervalData.push({
    ...ohlcvData,
    interval,
    timestamp: ohlcvData.timestamp || new Date()
  });
  
  // Keep only last 1000 candles per interval
  if (intervalData.length > 1000) {
    intervalData.splice(0, intervalData.length - 1000);
  }
  
  this.ohlcv.set(interval, intervalData);
  this.markModified('ohlcv');
  
  return this;
};

marketDataSchema.methods.updateTechnicalIndicators = function(indicators) {
  if (!this.technicalIndicators) {
    this.technicalIndicators = {};
  }
  
  Object.assign(this.technicalIndicators, indicators);
  this.markModified('technicalIndicators');
  
  return this;
};

marketDataSchema.methods.updateMarketStats = function(stats) {
  if (!this.marketStats) {
    this.marketStats = {};
  }
  
  Object.assign(this.marketStats, stats);
  this.markModified('marketStats');
  
  return this;
};

marketDataSchema.methods.updateOrderBook = function(orderBookData) {
  this.orderBook = {
    ...orderBookData,
    timestamp: new Date()
  };
  
  // Calculate spread
  if (orderBookData.bids?.length > 0 && orderBookData.asks?.length > 0) {
    const bestBid = orderBookData.bids[0].price;
    const bestAsk = orderBookData.asks[0].price;
    this.orderBook.spread = bestAsk - bestBid;
    this.orderBook.spreadPercent = (this.orderBook.spread / bestAsk) * 100;
  }
  
  this.markModified('orderBook');
  return this;
};

marketDataSchema.methods.updateSentiment = function(sentimentData) {
  this.sentiment = {
    ...sentimentData,
    lastUpdated: new Date()
  };
  
  this.markModified('sentiment');
  return this;
};

marketDataSchema.methods.getLatestOHLCV = function(interval, count = 100) {
  if (!this.ohlcv || !this.ohlcv.has(interval)) {
    return [];
  }
  
  const data = this.ohlcv.get(interval);
  return data.slice(-count).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

marketDataSchema.methods.calculateVolatility = function(interval = '1h', periods = 24) {
  const ohlcvData = this.getLatestOHLCV(interval, periods);
  
  if (ohlcvData.length < 2) {
    return 0;
  }
  
  const returns = [];
  for (let i = 1; i < ohlcvData.length; i++) {
    const currentPrice = ohlcvData[i].close;
    const previousPrice = ohlcvData[i - 1].close;
    const returnValue = Math.log(currentPrice / previousPrice);
    returns.push(returnValue);
  }
  
  // Calculate standard deviation
  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(periods * 24); // Annualized
  
  return volatility;
};

// Static methods
marketDataSchema.statics.findBySymbol = function(symbol, exchange = null) {
  const query = { symbol: symbol.toUpperCase(), isActive: true };
  if (exchange) {
    query.exchange = exchange.toUpperCase();
  }
  return this.findOne(query).sort({ lastUpdated: -1 });
};

marketDataSchema.statics.findActiveSymbols = function(exchange = null, assetType = null) {
  const query = { isActive: true };
  if (exchange) {
    query.exchange = exchange.toUpperCase();
  }
  if (assetType) {
    query.assetType = assetType;
  }
  return this.find(query).select('symbol exchange assetType currentPrice lastUpdated');
};

marketDataSchema.statics.getTopByVolume = function(limit = 100, assetType = null) {
  const query = { isActive: true };
  if (assetType) {
    query.assetType = assetType;
  }
  return this.find(query)
    .sort({ 'marketStats.volume24h': -1 })
    .limit(limit)
    .select('symbol exchange currentPrice marketStats.volume24h marketStats.changePercent24h');
};

marketDataSchema.statics.getTopByMarketCap = function(limit = 100) {
  return this.find({ isActive: true, assetType: 'crypto' })
    .sort({ 'marketStats.marketCap': -1 })
    .limit(limit)
    .select('symbol exchange currentPrice marketStats.marketCap marketStats.changePercent24h');
};

marketDataSchema.statics.getTopGainers = function(limit = 50, timeframe = '24h') {
  return this.find({ isActive: true })
    .sort({ 'marketStats.changePercent24h': -1 })
    .limit(limit)
    .select('symbol exchange currentPrice marketStats.changePercent24h marketStats.volume24h');
};

marketDataSchema.statics.getTopLosers = function(limit = 50, timeframe = '24h') {
  return this.find({ isActive: true })
    .sort({ 'marketStats.changePercent24h': 1 })
    .limit(limit)
    .select('symbol exchange currentPrice marketStats.changePercent24h marketStats.volume24h');
};

marketDataSchema.statics.getStaleData = function(thresholdMinutes = 5) {
  const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  return this.find({
    isActive: true,
    lastUpdated: { $lt: threshold }
  }).select('symbol exchange lastUpdated dataSource');
};

// Pre-save middleware
marketDataSchema.pre('save', function(next) {
  // Update quality metrics
  if (this.isModified('currentPrice')) {
    this.quality.lastValidation = new Date();
    
    // Reset error count on successful update
    if (this.currentPrice > 0) {
      this.quality.errorCount = Math.max(0, this.quality.errorCount - 1);
    }
  }
  
  // Calculate volatility if we have enough data
  if (this.ohlcv && this.ohlcv.size > 0) {
    const volatility = this.calculateVolatility();
    if (!this.marketStats) {
      this.marketStats = {};
    }
    this.marketStats.volatility = volatility;
  }
  
  next();
});

// Post-save middleware
marketDataSchema.post('save', function(doc) {
  // Emit events for real-time updates if needed
  // This can be used for WebSocket notifications
});

const MarketData = mongoose.model('MarketData', marketDataSchema);

module.exports = MarketData;