# TradingView Alert Distribution System - Database Schemas

## 1. Database Overview

### 1.1 Database Technology
- **Primary Database**: MongoDB (Document-based NoSQL)
- **Caching Layer**: Redis (In-memory key-value store)
- **Connection**: Mongoose ODM for MongoDB

### 1.2 Database Design Principles
- **Scalability**: Designed for horizontal scaling
- **Performance**: Optimized indexes for frequent queries
- **Flexibility**: Schema allows for future extensions
- **Consistency**: Referential integrity through application logic
- **Real-time**: Optimized for high-frequency alert processing

## 2. Core Collections

### 2.1 Users Collection

```javascript
// Collection: users
{
  _id: ObjectId,
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  telegram: {
    userId: {
      type: String,
      required: true,
      unique: true
    },
    username: String,
    firstName: String,
    lastName: String,
    chatId: String
  },
  profile: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    phone: String,
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  preferences: {
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      telegram: {
        type: Boolean,
        default: true
      },
      renewalReminders: {
        type: Boolean,
        default: true
      }
    },
    trading: {
      riskLevel: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
      },
      maxDailyAlerts: {
        type: Number,
        default: 50
      }
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastLoginAt: Date
}
```

**Indexes:**
```javascript
// Primary indexes
db.users.createIndex({ "email": 1 }, { unique: true })
db.users.createIndex({ "telegram.userId": 1 }, { unique: true })
db.users.createIndex({ "telegram.chatId": 1 })
db.users.createIndex({ "status": 1 })
db.users.createIndex({ "createdAt": 1 })
```

### 2.2 Subscription Plans Collection

```javascript
// Collection: subscription_plans
{
  _id: ObjectId,
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  pricing: {
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    duration: {
      months: {
        type: Number,
        required: true,
        min: 1
      },
      days: {
        type: Number,
        default: 0
      }
    }
  },
  features: {
    maxAlertConfigs: {
      type: Number,
      default: -1 // -1 means unlimited
    },
    maxOpenTrades: {
      type: Number,
      default: 3
    },
    prioritySupport: {
      type: Boolean,
      default: false
    },
    advancedAnalytics: {
      type: Boolean,
      default: false
    }
  },
  alertConfigurations: [{
    type: ObjectId,
    ref: 'AlertConfiguration'
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active'
  },
  metadata: {
    displayOrder: {
      type: Number,
      default: 0
    },
    isPopular: {
      type: Boolean,
      default: false
    },
    tags: [String]
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}
```

**Indexes:**
```javascript
db.subscription_plans.createIndex({ "name": 1 }, { unique: true })
db.subscription_plans.createIndex({ "status": 1 })
db.subscription_plans.createIndex({ "metadata.displayOrder": 1 })
db.subscription_plans.createIndex({ "pricing.amount": 1 })
```

### 2.3 Alert Configurations Collection

```javascript
// Collection: alert_configurations
{
  _id: ObjectId,
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
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
    totalTrades: {
      type: Number,
      default: 0
    },
    successRate: {
      type: Number,
      default: 0
    },
    lastAlertAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}
```

**Indexes:**
```javascript
db.alert_configurations.createIndex({ "symbol": 1, "timeframe": 1, "strategy": 1 }, { unique: true })
db.alert_configurations.createIndex({ "status": 1 })
db.alert_configurations.createIndex({ "symbol": 1 })
db.alert_configurations.createIndex({ "timeframe": 1 })
db.alert_configurations.createIndex({ "strategy": 1 })
```

### 2.4 User Subscriptions Collection

```javascript
// Collection: user_subscriptions
{
  _id: ObjectId,
  userId: {
    type: ObjectId,
    ref: 'User',
    required: true
  },
  subscriptionPlanId: {
    type: ObjectId,
    ref: 'SubscriptionPlan',
    required: true
  },
  payment: {
    transactionId: {
      type: String,
      required: true,
      unique: true
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'INR'
    },
    method: {
      type: String,
      enum: ['UPI', 'bank_transfer', 'other'],
      default: 'UPI'
    },
    proofUrl: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    approvedBy: {
      type: ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    rejectionReason: String
  },
  subscription: {
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ['pending', 'active', 'expired', 'cancelled'],
      default: 'pending'
    },
    autoRenew: {
      type: Boolean,
      default: false
    },
    renewalNotificationSent: {
      type: Boolean,
      default: false
    }
  },
  usage: {
    alertsReceived: {
      type: Number,
      default: 0
    },
    tradesOpened: {
      type: Number,
      default: 0
    },
    lastActivityAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}
```

**Indexes:**
```javascript
db.user_subscriptions.createIndex({ "userId": 1 })
db.user_subscriptions.createIndex({ "subscriptionPlanId": 1 })
db.user_subscriptions.createIndex({ "payment.transactionId": 1 }, { unique: true })
db.user_subscriptions.createIndex({ "payment.status": 1 })
db.user_subscriptions.createIndex({ "subscription.status": 1 })
db.user_subscriptions.createIndex({ "subscription.endDate": 1 })
db.user_subscriptions.createIndex({ "userId": 1, "subscription.status": 1 })
```

### 2.5 User Alert Preferences Collection

```javascript
// Collection: user_alert_preferences
{
  _id: ObjectId,
  userId: {
    type: ObjectId,
    ref: 'User',
    required: true
  },
  subscriptionId: {
    type: ObjectId,
    ref: 'UserSubscription',
    required: true
  },
  alertConfigId: {
    type: ObjectId,
    ref: 'AlertConfiguration',
    required: true
  },
  preferences: {
    enabled: {
      type: Boolean,
      default: true
    },
    alertTypes: {
      entry: {
        type: Boolean,
        default: true
      },
      exit: {
        type: Boolean,
        default: true
      },
      replacement: {
        type: Boolean,
        default: true
      }
    },
    notifications: {
      telegram: {
        type: Boolean,
        default: true
      },
      email: {
        type: Boolean,
        default: false
      }
    },
    customSettings: {
      minPrice: Number,
      maxPrice: Number,
      riskLevel: {
        type: String,
        enum: ['low', 'medium', 'high']
      }
    }
  },
  statistics: {
    alertsReceived: {
      type: Number,
      default: 0
    },
    tradesOpened: {
      type: Number,
      default: 0
    },
    lastAlertAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}
```

**Indexes:**
```javascript
db.user_alert_preferences.createIndex({ "userId": 1 })
db.user_alert_preferences.createIndex({ "subscriptionId": 1 })
db.user_alert_preferences.createIndex({ "alertConfigId": 1 })
db.user_alert_preferences.createIndex({ "userId": 1, "alertConfigId": 1 }, { unique: true })
db.user_alert_preferences.createIndex({ "preferences.enabled": 1 })
```

### 2.6 Trades Collection

```javascript
// Collection: trades
{
  _id: ObjectId,
  tradeNumber: {
    type: Number,
    required: true
  },
  userId: {
    type: ObjectId,
    ref: 'User',
    required: true
  },
  alertConfigId: {
    type: ObjectId,
    ref: 'AlertConfiguration',
    required: true
  },
  subscriptionId: {
    type: ObjectId,
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
      type: ObjectId,
      ref: 'Alert'
    },
    exitAlertId: {
      type: ObjectId,
      ref: 'Alert'
    }
  },
  metadata: {
    replacedBy: {
      type: ObjectId,
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
}
```

**Indexes:**
```javascript
db.trades.createIndex({ "tradeNumber": 1 })
db.trades.createIndex({ "userId": 1 })
db.trades.createIndex({ "alertConfigId": 1 })
db.trades.createIndex({ "status": 1 })
db.trades.createIndex({ "tradeData.symbol": 1 })
db.trades.createIndex({ "userId": 1, "status": 1 })
db.trades.createIndex({ "alertConfigId": 1, "status": 1 })
db.trades.createIndex({ "timestamps.openedAt": 1 })
db.trades.createIndex({ "timestamps.closedAt": 1 })
```

### 2.7 Alerts Collection

```javascript
// Collection: alerts
{
  _id: ObjectId,
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
      type: ObjectId,
      ref: 'AlertConfiguration'
    },
    matchedUsers: [{
      userId: {
        type: ObjectId,
        ref: 'User'
      },
      subscriptionId: {
        type: ObjectId,
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
        enum: ['OPEN_TRADE', 'CLOSE_TRADE', 'REPLACE_TRADE']
      },
      tradeId: {
        type: ObjectId,
        ref: 'Trade'
      },
      userId: {
        type: ObjectId,
        ref: 'User'
      }
    }],
    errors: [{
      message: String,
      timestamp: {
        type: Date,
        default: Date.now
      },
      stack: String
    }]
  },
  statistics: {
    processingTime: Number, // milliseconds
    deliveryCount: {
      type: Number,
      default: 0
    },
    failureCount: {
      type: Number,
      default: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}
```

**Indexes:**
```javascript
db.alerts.createIndex({ "webhook.receivedAt": 1 })
db.alerts.createIndex({ "alertData.symbol": 1 })
db.alerts.createIndex({ "alertData.timeframe": 1 })
db.alerts.createIndex({ "alertData.strategy": 1 })
db.alerts.createIndex({ "alertData.signal": 1 })
db.alerts.createIndex({ "processing.status": 1 })
db.alerts.createIndex({ "processing.alertConfigId": 1 })
db.alerts.createIndex({ "alertData.symbol": 1, "alertData.timeframe": 1, "alertData.strategy": 1 })
db.alerts.createIndex({ "webhook.receivedAt": -1 }) // For recent alerts
```

### 2.8 Admin Users Collection

```javascript
// Collection: admin_users
{
  _id: ObjectId,
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  profile: {
    firstName: {
      type: String,
      required: true
    },
    lastName: {
      type: String,
      required: true
    },
    phone: String
  },
  permissions: {
    users: {
      view: {
        type: Boolean,
        default: true
      },
      edit: {
        type: Boolean,
        default: true
      },
      delete: {
        type: Boolean,
        default: false
      }
    },
    subscriptions: {
      view: {
        type: Boolean,
        default: true
      },
      approve: {
        type: Boolean,
        default: true
      },
      edit: {
        type: Boolean,
        default: true
      }
    },
    alerts: {
      view: {
        type: Boolean,
        default: true
      },
      configure: {
        type: Boolean,
        default: true
      }
    },
    system: {
      settings: {
        type: Boolean,
        default: false
      },
      logs: {
        type: Boolean,
        default: true
      }
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  security: {
    lastLoginAt: Date,
    lastLoginIP: String,
    failedLoginAttempts: {
      type: Number,
      default: 0
    },
    lockedUntil: Date,
    passwordChangedAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}
```

**Indexes:**
```javascript
db.admin_users.createIndex({ "username": 1 }, { unique: true })
db.admin_users.createIndex({ "email": 1 }, { unique: true })
db.admin_users.createIndex({ "status": 1 })
```

## 3. Redis Cache Schemas

### 3.1 User Session Cache
```javascript
// Key: user_session:{userId}
// TTL: 24 hours
{
  userId: String,
  telegramChatId: String,
  activeSubscriptions: [{
    subscriptionId: String,
    planName: String,
    status: String,
    endDate: String
  }],
  preferences: Object,
  lastActivity: String
}
```

### 3.2 Alert Configuration Cache
```javascript
// Key: alert_config:{symbol}:{timeframe}:{strategy}
// TTL: 1 hour
{
  configId: String,
  symbol: String,
  timeframe: String,
  strategy: String,
  tradeManagement: Object,
  status: String,
  subscribedUsers: [{
    userId: String,
    subscriptionId: String,
    preferences: Object
  }]
}
```

### 3.3 Active Trades Cache
```javascript
// Key: active_trades:{userId}:{alertConfigId}
// TTL: No expiry (manual cleanup)
{
  trades: [{
    tradeId: String,
    tradeNumber: Number,
    signal: String,
    status: String,
    openedAt: String,
    entryPrice: Number
  }],
  count: Number,
  lastUpdated: String
}
```

### 3.4 Rate Limiting Cache
```javascript
// Key: rate_limit:{userId}:{type}
// TTL: 1 hour
{
  count: Number,
  resetTime: String,
  blocked: Boolean
}
```

## 4. Database Relationships

### 4.1 Entity Relationship Diagram
```
Users (1) ←→ (M) UserSubscriptions (M) ←→ (1) SubscriptionPlans
  ↓                    ↓
  (1)                  (1)
  ↓                    ↓
UserAlertPreferences   Trades
  ↓                    ↓
  (M)                  (M)
  ↓                    ↓
AlertConfigurations ←→ Alerts
```

### 4.2 Key Relationships
- **Users** can have multiple **UserSubscriptions**
- **SubscriptionPlans** can have multiple **AlertConfigurations**
- **Users** can have multiple **UserAlertPreferences** (one per alert config)
- **Users** can have multiple **Trades**
- **AlertConfigurations** can generate multiple **Alerts**
- **Alerts** can create multiple **Trades**

## 5. Data Validation Rules

### 5.1 Business Logic Validation
```javascript
// User subscription validation
- User can have maximum 5 active subscriptions
- Subscription end date must be after start date
- Payment amount must match subscription plan price

// Trade management validation
- Maximum 3 open trades per alert configuration per user
- Entry price must be positive
- TP price must be higher than entry for BUY, lower for SELL
- SL price must be lower than entry for BUY, higher for SELL

// Alert processing validation
- Alert timestamp must be within last 5 minutes
- Symbol must exist in alert configurations
- Signal type must match alert configuration settings
```

### 5.2 Data Integrity Constraints
```javascript
// Referential integrity
- UserSubscriptions.userId must exist in Users
- UserAlertPreferences.userId must exist in Users
- Trades.userId must exist in Users
- Trades.alertConfigId must exist in AlertConfigurations

// Unique constraints
- Users.email must be unique
- Users.telegram.userId must be unique
- SubscriptionPlans.name must be unique
- AlertConfigurations (symbol + timeframe + strategy) must be unique
```

## 6. Performance Optimization

### 6.1 Indexing Strategy
```javascript
// Compound indexes for frequent queries
db.user_subscriptions.createIndex({ 
  "userId": 1, 
  "subscription.status": 1, 
  "subscription.endDate": 1 
})

db.trades.createIndex({ 
  "userId": 1, 
  "alertConfigId": 1, 
  "status": 1 
})

db.alerts.createIndex({ 
  "alertData.symbol": 1, 
  "alertData.timeframe": 1, 
  "alertData.strategy": 1,
  "webhook.receivedAt": -1
})
```

### 6.2 Caching Strategy
```javascript
// Cache frequently accessed data
- User sessions and preferences (Redis)
- Active alert configurations (Redis)
- Open trades per user (Redis)
- Rate limiting counters (Redis)

// Cache invalidation triggers
- User preference changes
- Subscription status changes
- Trade status updates
- Alert configuration modifications
```

### 6.3 Query Optimization
```javascript
// Use projection to limit returned fields
db.users.find(
  { "telegram.userId": telegramId },
  { email: 1, profile: 1, preferences: 1 }
)

// Use aggregation for complex queries
db.trades.aggregate([
  { $match: { userId: ObjectId(userId), status: "open" } },
  { $group: { _id: "$alertConfigId", count: { $sum: 1 } } },
  { $lookup: { from: "alert_configurations", localField: "_id", foreignField: "_id", as: "config" } }
])
```

## 7. Data Migration Scripts

### 7.1 Initial Setup Script
```javascript
// Create collections with validation
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["email", "telegram.userId", "profile.name"],
      properties: {
        email: { bsonType: "string", pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$" },
        "telegram.userId": { bsonType: "string" },
        "profile.name": { bsonType: "string", minLength: 1 }
      }
    }
  }
})

// Create indexes
db.users.createIndex({ "email": 1 }, { unique: true })
db.users.createIndex({ "telegram.userId": 1 }, { unique: true })
```

### 7.2 Data Seeding Script
```javascript
// Insert default admin user
db.admin_users.insertOne({
  username: "admin",
  email: "admin@tradingalerts.com",
  password: "$2b$10$hashedPassword", // bcrypt hashed
  profile: {
    firstName: "System",
    lastName: "Administrator"
  },
  permissions: {
    users: { view: true, edit: true, delete: true },
    subscriptions: { view: true, approve: true, edit: true },
    alerts: { view: true, configure: true },
    system: { settings: true, logs: true }
  },
  status: "active",
  createdAt: new Date()
})

// Insert sample subscription plans
db.subscription_plans.insertMany([
  {
    name: "Basic Plan",
    description: "Basic trading alerts for beginners",
    pricing: { amount: 999, currency: "INR", duration: { months: 1 } },
    features: { maxAlertConfigs: 5, maxOpenTrades: 2 },
    status: "active",
    createdAt: new Date()
  },
  {
    name: "Pro Plan",
    description: "Advanced trading alerts for professionals",
    pricing: { amount: 2499, currency: "INR", duration: { months: 3 } },
    features: { maxAlertConfigs: -1, maxOpenTrades: 3, prioritySupport: true },
    status: "active",
    createdAt: new Date()
  }
])
```

## 8. Backup and Recovery

### 8.1 Backup Strategy
```javascript
// Daily backup script
mongodump --host localhost:27017 --db trading_alerts --out /backup/$(date +%Y%m%d)

// Incremental backup for critical collections
mongodump --host localhost:27017 --db trading_alerts --collection trades --query '{"createdAt": {"$gte": ISODate("2024-01-01")}}'
```

### 8.2 Recovery Procedures
```javascript
// Full database restore
mongorestore --host localhost:27017 --db trading_alerts /backup/20240101/trading_alerts

// Selective collection restore
mongorestore --host localhost:27017 --db trading_alerts --collection users /backup/20240101/trading_alerts/users.bson
```

This database schema provides a robust foundation for the TradingView Alert Distribution System, ensuring scalability, performance, and data integrity while supporting all the complex business requirements of the trading alert platform.