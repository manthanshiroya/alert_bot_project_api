# Alert Bot Project - Database Schemas

## Overview

This document defines the complete database schema design for the Alert Bot microservices architecture. The system uses MongoDB as the primary database with Redis for caching and session management.

## Database Architecture

### MongoDB Configuration

```javascript
// Connection Configuration
const mongoConfig = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/alertbot',
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    bufferMaxEntries: 0,
    bufferCommands: false,
    retryWrites: true,
    w: 'majority'
  }
};

// Database Structure
const databases = {
  production: 'alertbot_prod',
  staging: 'alertbot_staging',
  development: 'alertbot_dev',
  test: 'alertbot_test'
};
```

### Collections Overview

```javascript
const collections = {
  // Core Business Data
  users: 'users',
  subscription_plans: 'subscription_plans',
  subscription_requests: 'subscription_requests',
  charts: 'charts',
  symbols: 'symbols',
  timeframes: 'timeframes',
  
  // Alert System
  alert_conditions: 'alert_conditions',
  alert_logs: 'alert_logs',
  alert_templates: 'alert_templates',
  
  // Admin & Configuration
  admin_users: 'admin_users',
  system_config: 'system_config',
  dropdown_options: 'dropdown_options',
  
  // Audit & Monitoring
  audit_logs: 'audit_logs',
  api_logs: 'api_logs',
  performance_metrics: 'performance_metrics'
};
```

## Core Business Schemas

### 1. Users Collection

```javascript
// Schema Definition
const userSchema = {
  _id: ObjectId,
  telegram_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^\d{1,20}$/.test(v);
      },
      message: 'Telegram ID must be a valid number string'
    }
  },
  username: {
    type: String,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 50,
    validate: {
      validator: function(v) {
        return !v || /^[a-zA-Z0-9_]+$/.test(v);
      },
      message: 'Username can only contain letters, numbers, and underscores'
    }
  },
  first_name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  last_name: {
    type: String,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format'
    }
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^\+?[1-9]\d{1,14}$/.test(v);
      },
      message: 'Invalid phone number format'
    }
  },
  subscriptions: [{
    subscription_id: {
      type: ObjectId,
      required: true
    },
    plan_id: {
      type: ObjectId,
      required: true,
      ref: 'subscription_plans'
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'expired', 'cancelled', 'suspended'],
      default: 'pending',
      index: true
    },
    start_date: {
      type: Date,
      required: true
    },
    end_date: {
      type: Date,
      required: true,
      index: true
    },
    payment_proof: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Payment proof must be a valid URL'
      }
    },
    payment_amount: {
      type: Number,
      min: 0
    },
    payment_currency: {
      type: String,
      enum: ['USD', 'EUR', 'GBP', 'BTC', 'ETH'],
      default: 'USD'
    },
    preferences: {
      symbols: [{
        type: String,
        uppercase: true,
        validate: {
          validator: function(v) {
            return /^[A-Z0-9]{1,10}$/.test(v);
          },
          message: 'Symbol must be uppercase alphanumeric, max 10 characters'
        }
      }],
      timeframes: [{
        type: String,
        enum: ['1min', '5min', '15min', '30min', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']
      }],
      alert_types: [{
        type: String,
        enum: ['buy_signal', 'sell_signal', 'price_alert', 'volume_alert', 'technical_indicator', 'news_alert']
      }],
      notification_settings: {
        sound_enabled: { type: Boolean, default: true },
        vibration_enabled: { type: Boolean, default: true },
        quiet_hours: {
          enabled: { type: Boolean, default: false },
          start_time: { type: String, match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ },
          end_time: { type: String, match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ },
          timezone: { type: String, default: 'UTC' }
        }
      }
    },
    auto_renewal: {
      type: Boolean,
      default: false
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    updated_at: {
      type: Date,
      default: Date.now
    }
  }],
  profile: {
    avatar_url: String,
    bio: {
      type: String,
      maxlength: 500
    },
    language: {
      type: String,
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko'],
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    trading_experience: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'professional']
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'banned', 'suspended'],
    default: 'active',
    index: true
  },
  last_login: {
    type: Date,
    index: true
  },
  login_count: {
    type: Number,
    default: 0
  },
  referral_code: {
    type: String,
    unique: true,
    sparse: true
  },
  referred_by: {
    type: ObjectId,
    ref: 'users'
  },
  metadata: {
    registration_ip: String,
    user_agent: String,
    registration_source: {
      type: String,
      enum: ['telegram', 'web', 'mobile_app', 'referral']
    }
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
};

// Indexes
db.users.createIndex({ "telegram_id": 1 }, { unique: true });
db.users.createIndex({ "subscriptions.status": 1 });
db.users.createIndex({ "subscriptions.end_date": 1 });
db.users.createIndex({ "status": 1 });
db.users.createIndex({ "created_at": 1 });
db.users.createIndex({ "last_login": 1 });
db.users.createIndex({ "email": 1 }, { sparse: true });
db.users.createIndex({ "referral_code": 1 }, { unique: true, sparse: true });

// Example Document
const userExample = {
  _id: ObjectId("507f1f77bcf86cd799439011"),
  telegram_id: "123456789",
  username: "john_trader",
  first_name: "John",
  last_name: "Doe",
  email: "john@example.com",
  subscriptions: [{
    subscription_id: ObjectId("507f1f77bcf86cd799439012"),
    plan_id: ObjectId("507f1f77bcf86cd799439013"),
    status: "active",
    start_date: new Date("2024-01-01T00:00:00Z"),
    end_date: new Date("2024-02-01T00:00:00Z"),
    payment_proof: "https://example.com/payment.jpg",
    payment_amount: 29.99,
    payment_currency: "USD",
    preferences: {
      symbols: ["BTC", "ETH", "AAPL"],
      timeframes: ["5min", "1h", "1d"],
      alert_types: ["buy_signal", "sell_signal"],
      notification_settings: {
        sound_enabled: true,
        vibration_enabled: true,
        quiet_hours: {
          enabled: true,
          start_time: "22:00",
          end_time: "08:00",
          timezone: "UTC"
        }
      }
    },
    created_at: new Date("2024-01-01T00:00:00Z")
  }],
  profile: {
    language: "en",
    timezone: "UTC",
    trading_experience: "intermediate"
  },
  status: "active",
  last_login: new Date("2024-01-15T10:30:00Z"),
  login_count: 25,
  created_at: new Date("2024-01-01T00:00:00Z"),
  updated_at: new Date("2024-01-15T10:30:00Z")
};
```

### 2. Subscription Plans Collection

```javascript
// Schema Definition
const subscriptionPlanSchema = {
  _id: ObjectId,
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[a-z0-9-]+$/.test(v);
      },
      message: 'Slug can only contain lowercase letters, numbers, and hyphens'
    }
  },
  description: {
    type: String,
    maxlength: 1000
  },
  short_description: {
    type: String,
    maxlength: 200
  },
  features: [{
    name: {
      type: String,
      required: true,
      maxlength: 100
    },
    description: {
      type: String,
      maxlength: 500
    },
    enabled: {
      type: Boolean,
      default: true
    },
    icon: String,
    order: {
      type: Number,
      default: 0
    }
  }],
  charts: [{
    type: ObjectId,
    ref: 'charts'
  }],
  symbols: [{
    type: String,
    uppercase: true,
    validate: {
      validator: function(v) {
        return /^[A-Z0-9]{1,10}$/.test(v);
      },
      message: 'Symbol must be uppercase alphanumeric'
    }
  }],
  timeframes: [{
    type: String,
    enum: ['1min', '5min', '15min', '30min', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']
  }],
  pricing: {
    base_price: {
      amount: {
        type: Number,
        required: true,
        min: 0
      },
      currency: {
        type: String,
        required: true,
        enum: ['USD', 'EUR', 'GBP', 'BTC', 'ETH'],
        default: 'USD'
      }
    },
    discounted_price: {
      amount: {
        type: Number,
        min: 0
      },
      currency: {
        type: String,
        enum: ['USD', 'EUR', 'GBP', 'BTC', 'ETH']
      },
      valid_until: Date
    },
    trial_period: {
      enabled: {
        type: Boolean,
        default: false
      },
      duration_days: {
        type: Number,
        min: 1,
        max: 30
      }
    }
  },
  duration_days: {
    type: Number,
    required: true,
    min: 1,
    max: 365
  },
  limits: {
    max_alerts_per_hour: {
      type: Number,
      default: 50,
      min: 1
    },
    max_alerts_per_day: {
      type: Number,
      default: 1000,
      min: 1
    },
    max_symbols: {
      type: Number,
      default: 10,
      min: 1
    },
    max_timeframes: {
      type: Number,
      default: 5,
      min: 1
    },
    concurrent_alerts: {
      type: Number,
      default: 100,
      min: 1
    }
  },
  permissions: [{
    type: String,
    enum: [
      'basic_alerts',
      'premium_alerts',
      'custom_conditions',
      'historical_data',
      'api_access',
      'priority_support',
      'advanced_analytics',
      'white_label'
    ]
  }],
  category: {
    type: String,
    enum: ['basic', 'premium', 'professional', 'enterprise'],
    default: 'basic'
  },
  priority: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'hidden'],
    default: 'public'
  },
  metadata: {
    color_scheme: {
      primary: String,
      secondary: String
    },
    badge_text: String,
    popular: {
      type: Boolean,
      default: false
    },
    recommended: {
      type: Boolean,
      default: false
    }
  },
  created_by: {
    type: ObjectId,
    ref: 'admin_users',
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
};

// Indexes
db.subscription_plans.createIndex({ "slug": 1 }, { unique: true });
db.subscription_plans.createIndex({ "status": 1 });
db.subscription_plans.createIndex({ "category": 1 });
db.subscription_plans.createIndex({ "symbols": 1 });
db.subscription_plans.createIndex({ "pricing.base_price.amount": 1 });
db.subscription_plans.createIndex({ "created_at": 1 });

// Example Document
const subscriptionPlanExample = {
  _id: ObjectId("507f1f77bcf86cd799439013"),
  name: "Premium Trading Alerts",
  slug: "premium-trading-alerts",
  description: "Get real-time premium trading alerts for major cryptocurrencies and stocks",
  short_description: "Premium alerts for crypto and stocks",
  features: [
    {
      name: "Real-time Alerts",
      description: "Receive alerts within 5 seconds",
      enabled: true,
      icon: "⚡",
      order: 1
    },
    {
      name: "Multiple Timeframes",
      description: "5min, 1h, 4h, 1d timeframes",
      enabled: true,
      icon: "📊",
      order: 2
    }
  ],
  charts: [ObjectId("507f1f77bcf86cd799439014")],
  symbols: ["BTC", "ETH", "AAPL", "TSLA"],
  timeframes: ["5min", "1h", "4h", "1d"],
  pricing: {
    base_price: {
      amount: 29.99,
      currency: "USD"
    },
    trial_period: {
      enabled: true,
      duration_days: 7
    }
  },
  duration_days: 30,
  limits: {
    max_alerts_per_hour: 100,
    max_alerts_per_day: 2000,
    max_symbols: 20,
    max_timeframes: 10
  },
  permissions: ["premium_alerts", "custom_conditions"],
  category: "premium",
  status: "active",
  created_at: new Date("2024-01-01T00:00:00Z")
};
```

### 3. Charts Collection

```javascript
// Schema Definition
const chartSchema = {
  _id: ObjectId,
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    validate: {
      validator: function(v) {
        return /^[A-Z0-9]{1,10}$/.test(v);
      },
      message: 'Symbol must be uppercase alphanumeric'
    },
    index: true
  },
  timeframe: {
    type: String,
    required: true,
    enum: ['1min', '5min', '15min', '30min', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'],
    index: true
  },
  exchange: {
    type: String,
    enum: ['binance', 'coinbase', 'kraken', 'nasdaq', 'nyse', 'forex'],
    index: true
  },
  market_type: {
    type: String,
    enum: ['crypto', 'stock', 'forex', 'commodity', 'index'],
    required: true,
    index: true
  },
  tradingview_config: {
    chart_id: String,
    symbol_id: String,
    interval: String,
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  subscription_plans: [{
    type: ObjectId,
    ref: 'subscription_plans'
  }],
  conditions: [{
    condition_id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true,
      maxlength: 200
    },
    description: {
      type: String,
      maxlength: 1000
    },
    rules: {
      type: Object,
      required: true
    },
    actions: [{
      type: {
        type: String,
        enum: ['send_telegram', 'log_alert', 'webhook', 'email'],
        required: true
      },
      config: Object,
      priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
      },
      delay_seconds: {
        type: Number,
        default: 0,
        min: 0
      }
    }],
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    enabled: {
      type: Boolean,
      default: true
    },
    created_at: {
      type: Date,
      default: Date.now
    }
  }],
  metadata: {
    description: String,
    tags: [String],
    category: String,
    difficulty_level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced']
    },
    expected_signals_per_day: Number
  },
  statistics: {
    total_alerts_sent: {
      type: Number,
      default: 0
    },
    last_alert_time: Date,
    success_rate: {
      type: Number,
      min: 0,
      max: 100
    },
    avg_alerts_per_day: Number
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active',
    index: true
  },
  created_by: {
    type: ObjectId,
    ref: 'admin_users',
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
};

// Indexes
db.charts.createIndex({ "symbol": 1, "timeframe": 1 });
db.charts.createIndex({ "subscription_plans": 1 });
db.charts.createIndex({ "status": 1 });
db.charts.createIndex({ "market_type": 1 });
db.charts.createIndex({ "exchange": 1 });
db.charts.createIndex({ "created_at": 1 });

// Example Document
const chartExample = {
  _id: ObjectId("507f1f77bcf86cd799439014"),
  name: "BTC 5-Minute Premium Signals",
  symbol: "BTC",
  timeframe: "5min",
  exchange: "binance",
  market_type: "crypto",
  tradingview_config: {
    chart_id: "tv_btc_5min",
    symbol_id: "BINANCE:BTCUSDT",
    interval: "5",
    timezone: "UTC"
  },
  subscription_plans: [ObjectId("507f1f77bcf86cd799439013")],
  conditions: [{
    condition_id: "btc_premium_5min_001",
    name: "BTC Premium Buy Signal",
    description: "High-confidence buy signals for BTC 5-minute timeframe",
    rules: {
      symbol: { operator: "equals", value: "BTC" },
      timeframe: { operator: "equals", value: "5min" },
      signal: { operator: "equals", value: "buy" },
      confidence: { operator: "greater_than", value: 0.8 }
    },
    actions: [{
      type: "send_telegram",
      config: {
        template: "premium_buy_signal",
        include_chart: true
      },
      priority: "high",
      delay_seconds: 0
    }],
    priority: "high",
    enabled: true,
    created_at: new Date("2024-01-01T00:00:00Z")
  }],
  status: "active",
  created_at: new Date("2024-01-01T00:00:00Z")
};
```

## Alert System Schemas

### 4. Alert Logs Collection

```javascript
// Schema Definition
const alertLogSchema = {
  _id: ObjectId,
  alert_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  chart_id: {
    type: ObjectId,
    ref: 'charts',
    required: true,
    index: true
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  timeframe: {
    type: String,
    required: true,
    index: true
  },
  signal_type: {
    type: String,
    enum: ['buy', 'sell', 'hold', 'price_alert', 'volume_alert', 'technical_indicator'],
    required: true,
    index: true
  },
  payload: {
    type: Object,
    required: true
  },
  source: {
    type: String,
    enum: ['tradingview', 'internal', 'manual', 'api'],
    default: 'tradingview',
    index: true
  },
  matched_conditions: [{
    condition_id: String,
    condition_name: String,
    match_score: {
      type: Number,
      min: 0,
      max: 1
    }
  }],
  target_users: [{
    user_id: {
      type: ObjectId,
      ref: 'users',
      required: true
    },
    telegram_id: {
      type: String,
      required: true
    },
    subscription_id: ObjectId,
    delivery_status: {
      type: String,
      enum: ['pending', 'queued', 'sent', 'failed', 'skipped'],
      default: 'pending',
      index: true
    },
    delivery_time: Date,
    message_id: String,
    error_message: String,
    retry_count: {
      type: Number,
      default: 0
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  }],
  processing_stats: {
    received_at: {
      type: Date,
      required: true,
      index: true
    },
    processed_at: Date,
    total_targets: {
      type: Number,
      default: 0
    },
    successful_deliveries: {
      type: Number,
      default: 0
    },
    failed_deliveries: {
      type: Number,
      default: 0
    },
    processing_time_ms: Number
  },
  metadata: {
    webhook_headers: Object,
    user_agent: String,
    ip_address: String,
    request_id: String
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  }
};

// TTL Index for automatic cleanup (90 days)
db.alert_logs.createIndex({ "created_at": 1 }, { expireAfterSeconds: 7776000 });

// Other Indexes
db.alert_logs.createIndex({ "alert_id": 1 }, { unique: true });
db.alert_logs.createIndex({ "symbol": 1, "timeframe": 1 });
db.alert_logs.createIndex({ "target_users.user_id": 1 });
db.alert_logs.createIndex({ "target_users.delivery_status": 1 });
db.alert_logs.createIndex({ "signal_type": 1 });
db.alert_logs.createIndex({ "processing_stats.received_at": 1 });

// Example Document
const alertLogExample = {
  _id: ObjectId("507f1f77bcf86cd799439015"),
  alert_id: "alert_20240115_103000_btc_5min_001",
  chart_id: ObjectId("507f1f77bcf86cd799439014"),
  symbol: "BTC",
  timeframe: "5min",
  signal_type: "buy",
  payload: {
    symbol: "BTC",
    timeframe: "5min",
    price: 45000.50,
    signal: "buy",
    confidence: 0.85,
    timestamp: "2024-01-15T10:30:00Z",
    indicators: {
      rsi: 35.2,
      macd: 0.15,
      volume: 1250000
    }
  },
  source: "tradingview",
  matched_conditions: [{
    condition_id: "btc_premium_5min_001",
    condition_name: "BTC Premium Buy Signal",
    match_score: 0.95
  }],
  target_users: [{
    user_id: ObjectId("507f1f77bcf86cd799439011"),
    telegram_id: "123456789",
    subscription_id: ObjectId("507f1f77bcf86cd799439012"),
    delivery_status: "sent",
    delivery_time: new Date("2024-01-15T10:30:05Z"),
    message_id: "1234",
    priority: "high"
  }],
  processing_stats: {
    received_at: new Date("2024-01-15T10:30:00Z"),
    processed_at: new Date("2024-01-15T10:30:02Z"),
    total_targets: 1,
    successful_deliveries: 1,
    failed_deliveries: 0,
    processing_time_ms: 2000
  },
  created_at: new Date("2024-01-15T10:30:00Z")
};
```

### 5. Alert Conditions Collection

```javascript
// Schema Definition
const alertConditionSchema = {
  _id: ObjectId,
  condition_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 1000
  },
  category: {
    type: String,
    enum: ['price', 'volume', 'technical', 'sentiment', 'news', 'custom'],
    required: true,
    index: true
  },
  rules: {
    type: Object,
    required: true,
    validate: {
      validator: function(v) {
        return v && typeof v === 'object' && Object.keys(v).length > 0;
      },
      message: 'Rules object cannot be empty'
    }
  },
  actions: [{
    type: {
      type: String,
      enum: ['send_telegram', 'log_alert', 'webhook', 'email', 'sms'],
      required: true
    },
    config: {
      type: Object,
      required: true
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    delay_seconds: {
      type: Number,
      default: 0,
      min: 0,
      max: 3600
    },
    enabled: {
      type: Boolean,
      default: true
    }
  }],
  target_criteria: {
    subscription_plans: [{
      type: ObjectId,
      ref: 'subscription_plans'
    }],
    user_statuses: [{
      type: String,
      enum: ['active', 'inactive', 'banned', 'suspended']
    }],
    subscription_statuses: [{
      type: String,
      enum: ['pending', 'active', 'expired', 'cancelled', 'suspended']
    }],
    symbols: [String],
    timeframes: [String],
    user_preferences: Object
  },
  rate_limiting: {
    enabled: {
      type: Boolean,
      default: true
    },
    max_alerts_per_user_per_hour: {
      type: Number,
      default: 10,
      min: 1
    },
    cooldown_minutes: {
      type: Number,
      default: 5,
      min: 0
    }
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  enabled: {
    type: Boolean,
    default: true,
    index: true
  },
  testing: {
    is_test: {
      type: Boolean,
      default: false
    },
    test_users: [{
      type: ObjectId,
      ref: 'users'
    }]
  },
  statistics: {
    total_triggers: {
      type: Number,
      default: 0
    },
    successful_deliveries: {
      type: Number,
      default: 0
    },
    failed_deliveries: {
      type: Number,
      default: 0
    },
    last_triggered: Date,
    avg_processing_time_ms: Number
  },
  created_by: {
    type: ObjectId,
    ref: 'admin_users',
    required: true
  },
  updated_by: {
    type: ObjectId,
    ref: 'admin_users'
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
};

// Indexes
db.alert_conditions.createIndex({ "condition_id": 1 }, { unique: true });
db.alert_conditions.createIndex({ "category": 1 });
db.alert_conditions.createIndex({ "priority": 1 });
db.alert_conditions.createIndex({ "enabled": 1 });
db.alert_conditions.createIndex({ "target_criteria.subscription_plans": 1 });
db.alert_conditions.createIndex({ "created_at": 1 });

// Example Document
const alertConditionExample = {
  _id: ObjectId("507f1f77bcf86cd799439016"),
  condition_id: "btc_premium_buy_signal_v2",
  name: "BTC Premium Buy Signal V2",
  description: "Advanced buy signal for BTC with multiple technical indicators",
  category: "technical",
  rules: {
    symbol: { operator: "equals", value: "BTC" },
    signal: { operator: "equals", value: "buy" },
    confidence: { operator: "greater_than", value: 0.8 },
    rsi: { operator: "less_than", value: 40 },
    volume: { operator: "greater_than", value: 1000000 }
  },
  actions: [{
    type: "send_telegram",
    config: {
      template: "premium_buy_signal_v2",
      include_chart: true,
      include_indicators: true
    },
    priority: "high",
    delay_seconds: 0,
    enabled: true
  }],
  target_criteria: {
    subscription_plans: [ObjectId("507f1f77bcf86cd799439013")],
    user_statuses: ["active"],
    subscription_statuses: ["active"]
  },
  rate_limiting: {
    enabled: true,
    max_alerts_per_user_per_hour: 5,
    cooldown_minutes: 10
  },
  priority: "high",
  enabled: true,
  created_at: new Date("2024-01-01T00:00:00Z")
};
```

## Administrative Schemas

### 6. Admin Users Collection

```javascript
// Schema Definition
const adminUserSchema = {
  _id: ObjectId,
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format'
    }
  },
  password_hash: {
    type: String,
    required: true
  },
  first_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  last_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'moderator', 'support'],
    required: true,
    index: true
  },
  permissions: [{
    type: String,
    enum: [
      'users.read', 'users.write', 'users.delete',
      'subscriptions.read', 'subscriptions.write', 'subscriptions.delete',
      'charts.read', 'charts.write', 'charts.delete',
      'conditions.read', 'conditions.write', 'conditions.delete',
      'alerts.read', 'alerts.write',
      'analytics.read',
      'system.read', 'system.write',
      'admin.read', 'admin.write'
    ]
  }],
  profile: {
    avatar_url: String,
    phone: String,
    timezone: {
      type: String,
      default: 'UTC'
    },
    language: {
      type: String,
      enum: ['en', 'es', 'fr', 'de'],
      default: 'en'
    }
  },
  security: {
    two_factor_enabled: {
      type: Boolean,
      default: false
    },
    two_factor_secret: String,
    last_password_change: {
      type: Date,
      default: Date.now
    },
    failed_login_attempts: {
      type: Number,
      default: 0
    },
    locked_until: Date,
    password_reset_token: String,
    password_reset_expires: Date
  },
  activity: {
    last_login: Date,
    last_ip: String,
    login_count: {
      type: Number,
      default: 0
    },
    last_activity: Date
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active',
    index: true
  },
  created_by: {
    type: ObjectId,
    ref: 'admin_users'
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
};

// Indexes
db.admin_users.createIndex({ "username": 1 }, { unique: true });
db.admin_users.createIndex({ "email": 1 }, { unique: true });
db.admin_users.createIndex({ "role": 1 });
db.admin_users.createIndex({ "status": 1 });
db.admin_users.createIndex({ "created_at": 1 });
```

### 7. System Configuration Collection

```javascript
// Schema Definition
const systemConfigSchema = {
  _id: ObjectId,
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  value: {
    type: Object,
    required: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  category: {
    type: String,
    enum: ['telegram', 'alerts', 'payments', 'security', 'performance', 'features'],
    required: true,
    index: true
  },
  data_type: {
    type: String,
    enum: ['string', 'number', 'boolean', 'object', 'array'],
    required: true
  },
  is_sensitive: {
    type: Boolean,
    default: false
  },
  validation_rules: {
    type: Object
  },
  updated_by: {
    type: ObjectId,
    ref: 'admin_users',
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
};

// Indexes
db.system_config.createIndex({ "key": 1 }, { unique: true });
db.system_config.createIndex({ "category": 1 });

// Example Documents
const systemConfigExamples = [
  {
    key: "telegram.bot_token",
    value: { token: "encrypted_bot_token" },
    description: "Telegram bot authentication token",
    category: "telegram",
    data_type: "object",
    is_sensitive: true
  },
  {
    key: "alerts.max_per_hour_global",
    value: { limit: 10000 },
    description: "Global maximum alerts per hour",
    category: "alerts",
    data_type: "object",
    is_sensitive: false
  }
];
```

## Redis Schema Design

### Session Management

```javascript
// Redis Key Patterns
const redisKeys = {
  // User Sessions
  userSession: (telegramId) => `session:user:${telegramId}`,
  adminSession: (adminId) => `session:admin:${adminId}`,
  
  // Alert Queue
  alertQueue: 'queue:alerts:pending',
  alertProcessing: 'queue:alerts:processing',
  alertFailed: 'queue:alerts:failed',
  
  // Rate Limiting
  rateLimitUser: (userId, window) => `rate_limit:user:${userId}:${window}`,
  rateLimitGlobal: (window) => `rate_limit:global:${window}`,
  rateLimitIP: (ip, window) => `rate_limit:ip:${ip}:${window}`,
  
  // Caching
  userCache: (userId) => `cache:user:${userId}`,
  subscriptionCache: (planId) => `cache:subscription:${planId}`,
  chartCache: (chartId) => `cache:chart:${chartId}`,
  dropdownCache: (type) => `cache:dropdown:${type}`,
  
  // Temporary Data
  tempData: (key) => `temp:${key}`,
  uploadToken: (token) => `upload:${token}`,
  
  // Locks
  processLock: (resource) => `lock:${resource}`,
  
  // Metrics
  metrics: (metric, timestamp) => `metrics:${metric}:${timestamp}`
};

// Session Data Structure
const userSessionData = {
  user_id: 'ObjectId_string',
  telegram_id: 'string',
  username: 'string',
  role: 'user',
  permissions: ['array', 'of', 'permissions'],
  current_menu: 'main_menu',
  temp_data: {
    subscription_request: {
      plan_id: 'ObjectId_string',
      step: 'payment_proof'
    }
  },
  last_activity: 'ISO_timestamp',
  expires_at: 'ISO_timestamp'
};

// Alert Queue Item Structure
const alertQueueItem = {
  id: 'unique_alert_id',
  user_id: 'ObjectId_string',
  telegram_id: 'string',
  message: {
    text: 'formatted_message',
    parse_mode: 'HTML',
    reply_markup: {}
  },
  priority: 'high', // low, medium, high
  retry_count: 0,
  max_retries: 3,
  created_at: 'timestamp',
  scheduled_at: 'timestamp'
};

// Rate Limit Data Structure
const rateLimitData = {
  count: 5,
  reset_time: 'timestamp',
  window_start: 'timestamp'
};

// Cache Data Structure
const cacheData = {
  data: {}, // actual cached data
  expires_at: 'timestamp',
  version: 'string',
  tags: ['array', 'of', 'cache', 'tags']
};
```

## Database Maintenance

### Backup Strategy

```javascript
// MongoDB Backup Configuration
const backupConfig = {
  // Daily backups
  daily: {
    schedule: '0 2 * * *', // 2 AM daily
    retention: 30, // days
    collections: ['users', 'subscription_plans', 'charts', 'alert_conditions']
  },
  
  // Weekly full backups
  weekly: {
    schedule: '0 1 * * 0', // 1 AM Sunday
    retention: 12, // weeks
    full_database: true
  },
  
  // Monthly archives
  monthly: {
    schedule: '0 0 1 * *', // 1st of month
    retention: 12, // months
    compress: true,
    offsite: true
  }
};

// Cleanup Jobs
const cleanupJobs = {
  // Remove expired sessions
  expiredSessions: {
    schedule: '*/15 * * * *', // every 15 minutes
    action: 'delete_expired_redis_keys'
  },
  
  // Archive old alert logs
  oldAlertLogs: {
    schedule: '0 3 * * *', // 3 AM daily
    action: 'archive_logs_older_than_90_days'
  },
  
  // Clean failed queue items
  failedQueueItems: {
    schedule: '0 4 * * *', // 4 AM daily
    action: 'remove_failed_items_older_than_7_days'
  }
};
```

### Performance Optimization

```javascript
// Index Optimization
const indexOptimization = {
  // Compound indexes for common queries
  userSubscriptions: {
    fields: { 'subscriptions.status': 1, 'subscriptions.end_date': 1 },
    background: true
  },
  
  alertLookup: {
    fields: { 'symbol': 1, 'timeframe': 1, 'created_at': -1 },
    background: true
  },
  
  // Partial indexes for active records only
  activeUsers: {
    fields: { 'telegram_id': 1 },
    partialFilterExpression: { 'status': 'active' }
  },
  
  // Text indexes for search
  chartSearch: {
    fields: {
      'name': 'text',
      'description': 'text',
      'metadata.tags': 'text'
    }
  }
};

// Query Optimization Guidelines
const queryOptimization = {
  // Use projection to limit returned fields
  userLookup: {
    find: { telegram_id: '123456789' },
    projection: { _id: 1, telegram_id: 1, subscriptions: 1, status: 1 }
  },
  
  // Use aggregation for complex queries
  subscriptionStats: [
    { $match: { 'subscriptions.status': 'active' } },
    { $unwind: '$subscriptions' },
    { $group: { _id: '$subscriptions.plan_id', count: { $sum: 1 } } }
  ],
  
  // Use limit and skip for pagination
  paginatedUsers: {
    find: { status: 'active' },
    sort: { created_at: -1 },
    limit: 20,
    skip: 0
  }
};
```

This comprehensive database schema design provides a solid foundation for the Alert Bot microservices architecture, ensuring data integrity, performance, and scalability while supporting all the required business functionality.