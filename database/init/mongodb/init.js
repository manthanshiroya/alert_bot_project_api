// MongoDB initialization script
// This script sets up the initial database structure, indexes, and default data

print('Starting MongoDB initialization...');

// Switch to the alert_bot database
db = db.getSiblingDB('alert_bot_dev');

// Create collections with validation schemas
print('Creating collections with validation schemas...');

// Users collection
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'passwordHash', 'role', 'subscriptionPlan'],
      properties: {
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          description: 'must be a valid email address'
        },
        passwordHash: {
          bsonType: 'string',
          minLength: 60,
          maxLength: 60,
          description: 'must be a bcrypt hash'
        },
        role: {
          bsonType: 'string',
          enum: ['user', 'admin', 'moderator'],
          description: 'must be a valid role'
        },
        subscriptionPlan: {
          bsonType: 'string',
          enum: ['free', 'basic', 'pro', 'premium'],
          description: 'must be a valid subscription plan'
        },
        isActive: {
          bsonType: 'bool',
          description: 'must be a boolean'
        },
        isEmailVerified: {
          bsonType: 'bool',
          description: 'must be a boolean'
        },
        telegramUserId: {
          bsonType: ['string', 'null'],
          description: 'telegram user ID if connected'
        },
        preferences: {
          bsonType: 'object',
          properties: {
            notifications: {
              bsonType: 'object',
              properties: {
                email: { bsonType: 'bool' },
                telegram: { bsonType: 'bool' },
                webhook: { bsonType: 'bool' }
              }
            },
            timezone: {
              bsonType: 'string',
              description: 'user timezone'
            },
            language: {
              bsonType: 'string',
              enum: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko'],
              description: 'preferred language'
            }
          }
        },
        metadata: {
          bsonType: 'object',
          description: 'additional user metadata'
        },
        createdAt: {
          bsonType: 'date',
          description: 'must be a date'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'must be a date'
        }
      }
    }
  }
});

// Alerts collection
db.createCollection('alerts', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'name', 'type', 'symbol', 'conditions', 'isActive'],
      properties: {
        userId: {
          bsonType: 'objectId',
          description: 'must be a valid ObjectId'
        },
        name: {
          bsonType: 'string',
          minLength: 1,
          maxLength: 100,
          description: 'must be a string between 1-100 characters'
        },
        type: {
          bsonType: 'string',
          enum: ['price', 'technical', 'volume', 'news', 'composite'],
          description: 'must be a valid alert type'
        },
        symbol: {
          bsonType: 'string',
          pattern: '^[A-Z0-9]+$',
          description: 'must be a valid trading symbol'
        },
        exchange: {
          bsonType: 'string',
          enum: ['binance', 'coinbase', 'kraken', 'huobi', 'okx'],
          description: 'must be a supported exchange'
        },
        conditions: {
          bsonType: 'array',
          minItems: 1,
          items: {
            bsonType: 'object',
            required: ['field', 'operator', 'value'],
            properties: {
              field: {
                bsonType: 'string',
                description: 'field to check'
              },
              operator: {
                bsonType: 'string',
                enum: ['>', '<', '>=', '<=', '==', '!=', 'between', 'crosses_above', 'crosses_below'],
                description: 'comparison operator'
              },
              value: {
                bsonType: ['number', 'array'],
                description: 'value to compare against'
              }
            }
          }
        },
        isActive: {
          bsonType: 'bool',
          description: 'must be a boolean'
        },
        priority: {
          bsonType: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'alert priority level'
        },
        frequency: {
          bsonType: 'string',
          enum: ['once', 'recurring'],
          description: 'alert frequency'
        },
        cooldownPeriod: {
          bsonType: 'number',
          minimum: 0,
          description: 'cooldown period in milliseconds'
        },
        expiresAt: {
          bsonType: ['date', 'null'],
          description: 'alert expiration date'
        },
        notificationChannels: {
          bsonType: 'array',
          items: {
            bsonType: 'string',
            enum: ['telegram', 'email', 'webhook']
          }
        },
        webhookUrl: {
          bsonType: ['string', 'null'],
          description: 'webhook URL for notifications'
        },
        lastTriggered: {
          bsonType: ['date', 'null'],
          description: 'last time alert was triggered'
        },
        triggerCount: {
          bsonType: 'number',
          minimum: 0,
          description: 'number of times alert has been triggered'
        },
        nextCheck: {
          bsonType: 'date',
          description: 'next scheduled check time'
        },
        metadata: {
          bsonType: 'object',
          description: 'additional alert metadata'
        },
        createdAt: {
          bsonType: 'date',
          description: 'must be a date'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'must be a date'
        }
      }
    }
  }
});

// Market Data collection
db.createCollection('marketdata', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['symbol', 'exchange', 'currentPrice', 'lastUpdated'],
      properties: {
        symbol: {
          bsonType: 'string',
          pattern: '^[A-Z0-9]+$',
          description: 'must be a valid trading symbol'
        },
        exchange: {
          bsonType: 'string',
          enum: ['binance', 'coinbase', 'kraken', 'huobi', 'okx'],
          description: 'must be a supported exchange'
        },
        currentPrice: {
          bsonType: 'number',
          minimum: 0,
          description: 'current price must be positive'
        },
        priceHistory: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['price', 'timestamp'],
            properties: {
              price: { bsonType: 'number', minimum: 0 },
              timestamp: { bsonType: 'date' },
              volume: { bsonType: 'number', minimum: 0 }
            }
          }
        },
        marketStats: {
          bsonType: 'object',
          properties: {
            volume24h: { bsonType: 'number', minimum: 0 },
            high24h: { bsonType: 'number', minimum: 0 },
            low24h: { bsonType: 'number', minimum: 0 },
            priceChange24h: { bsonType: 'number' },
            priceChangePercent24h: { bsonType: 'number' },
            marketCap: { bsonType: 'number', minimum: 0 },
            circulatingSupply: { bsonType: 'number', minimum: 0 }
          }
        },
        technicalIndicators: {
          bsonType: 'object',
          properties: {
            sma: {
              bsonType: 'object',
              properties: {
                sma20: { bsonType: 'number' },
                sma50: { bsonType: 'number' },
                sma200: { bsonType: 'number' }
              }
            },
            ema: {
              bsonType: 'object',
              properties: {
                ema12: { bsonType: 'number' },
                ema26: { bsonType: 'number' }
              }
            },
            rsi: {
              bsonType: 'object',
              properties: {
                rsi14: { bsonType: 'number', minimum: 0, maximum: 100 }
              }
            },
            macd: {
              bsonType: 'object',
              properties: {
                macd: { bsonType: 'number' },
                signal: { bsonType: 'number' },
                histogram: { bsonType: 'number' }
              }
            },
            bollingerBands: {
              bsonType: 'object',
              properties: {
                upper: { bsonType: 'number' },
                middle: { bsonType: 'number' },
                lower: { bsonType: 'number' }
              }
            }
          }
        },
        lastUpdated: {
          bsonType: 'date',
          description: 'must be a date'
        },
        dataSource: {
          bsonType: 'string',
          description: 'source of the market data'
        }
      }
    }
  }
});

// Subscriptions collection
db.createCollection('subscriptions', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'plan', 'status', 'startDate'],
      properties: {
        userId: {
          bsonType: 'objectId',
          description: 'must be a valid ObjectId'
        },
        plan: {
          bsonType: 'string',
          enum: ['free', 'basic', 'pro', 'premium'],
          description: 'must be a valid subscription plan'
        },
        status: {
          bsonType: 'string',
          enum: ['active', 'inactive', 'cancelled', 'expired', 'pending'],
          description: 'subscription status'
        },
        startDate: {
          bsonType: 'date',
          description: 'subscription start date'
        },
        endDate: {
          bsonType: ['date', 'null'],
          description: 'subscription end date'
        },
        autoRenew: {
          bsonType: 'bool',
          description: 'auto renewal setting'
        },
        paymentMethod: {
          bsonType: 'object',
          properties: {
            type: {
              bsonType: 'string',
              enum: ['credit_card', 'paypal', 'crypto', 'bank_transfer']
            },
            lastFour: { bsonType: 'string' },
            expiryMonth: { bsonType: 'number' },
            expiryYear: { bsonType: 'number' }
          }
        },
        billingHistory: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            properties: {
              amount: { bsonType: 'number', minimum: 0 },
              currency: { bsonType: 'string' },
              date: { bsonType: 'date' },
              status: {
                bsonType: 'string',
                enum: ['paid', 'pending', 'failed', 'refunded']
              },
              transactionId: { bsonType: 'string' }
            }
          }
        },
        features: {
          bsonType: 'object',
          properties: {
            maxAlerts: { bsonType: 'number', minimum: 0 },
            advancedIndicators: { bsonType: 'bool' },
            webhookSupport: { bsonType: 'bool' },
            prioritySupport: { bsonType: 'bool' },
            apiAccess: { bsonType: 'bool' }
          }
        },
        createdAt: {
          bsonType: 'date',
          description: 'must be a date'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'must be a date'
        }
      }
    }
  }
});

// Notifications collection
db.createCollection('notifications', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'type', 'channel', 'status', 'createdAt'],
      properties: {
        userId: {
          bsonType: 'objectId',
          description: 'must be a valid ObjectId'
        },
        alertId: {
          bsonType: ['objectId', 'null'],
          description: 'related alert ID'
        },
        type: {
          bsonType: 'string',
          enum: ['alert_triggered', 'subscription_expired', 'system_notification', 'welcome', 'verification'],
          description: 'notification type'
        },
        channel: {
          bsonType: 'string',
          enum: ['telegram', 'email', 'webhook', 'push'],
          description: 'notification channel'
        },
        status: {
          bsonType: 'string',
          enum: ['pending', 'sent', 'delivered', 'failed', 'read'],
          description: 'notification status'
        },
        title: {
          bsonType: 'string',
          maxLength: 200,
          description: 'notification title'
        },
        message: {
          bsonType: 'string',
          maxLength: 2000,
          description: 'notification message'
        },
        data: {
          bsonType: 'object',
          description: 'additional notification data'
        },
        sentAt: {
          bsonType: ['date', 'null'],
          description: 'when notification was sent'
        },
        deliveredAt: {
          bsonType: ['date', 'null'],
          description: 'when notification was delivered'
        },
        readAt: {
          bsonType: ['date', 'null'],
          description: 'when notification was read'
        },
        retryCount: {
          bsonType: 'number',
          minimum: 0,
          maximum: 5,
          description: 'number of retry attempts'
        },
        errorMessage: {
          bsonType: ['string', 'null'],
          description: 'error message if failed'
        },
        createdAt: {
          bsonType: 'date',
          description: 'must be a date'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'must be a date'
        }
      }
    }
  }
});

print('Collections created successfully');

// Create indexes for optimal performance
print('Creating indexes...');

// Users indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ telegramUserId: 1 }, { sparse: true });
db.users.createIndex({ subscriptionPlan: 1 });
db.users.createIndex({ isActive: 1 });
db.users.createIndex({ createdAt: -1 });

// Alerts indexes
db.alerts.createIndex({ userId: 1, isActive: 1 });
db.alerts.createIndex({ symbol: 1, exchange: 1 });
db.alerts.createIndex({ nextCheck: 1, isActive: 1 });
db.alerts.createIndex({ lastTriggered: 1 });
db.alerts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
db.alerts.createIndex({ 'metadata.tags': 1 });
db.alerts.createIndex({ priority: 1, createdAt: -1 });
db.alerts.createIndex({ type: 1 });
db.alerts.createIndex({ frequency: 1 });

// MarketData indexes
db.marketdata.createIndex({ symbol: 1, exchange: 1 }, { unique: true });
db.marketdata.createIndex({ lastUpdated: -1 });
db.marketdata.createIndex({ 'marketStats.volume24h': -1 });
db.marketdata.createIndex({ 'marketStats.priceChangePercent24h': -1 });
db.marketdata.createIndex({ currentPrice: 1 });
db.marketdata.createIndex({ dataSource: 1 });

// Subscriptions indexes
db.subscriptions.createIndex({ userId: 1 }, { unique: true });
db.subscriptions.createIndex({ status: 1 });
db.subscriptions.createIndex({ plan: 1 });
db.subscriptions.createIndex({ endDate: 1 });
db.subscriptions.createIndex({ startDate: -1 });

// Notifications indexes
db.notifications.createIndex({ userId: 1, createdAt: -1 });
db.notifications.createIndex({ alertId: 1 });
db.notifications.createIndex({ status: 1 });
db.notifications.createIndex({ channel: 1 });
db.notifications.createIndex({ type: 1 });
db.notifications.createIndex({ sentAt: -1 });
db.notifications.createIndex({ createdAt: -1 });

print('Indexes created successfully');

// Insert default subscription plans
print('Inserting default subscription plans...');

db.subscriptionplans.insertMany([
  {
    _id: 'free',
    name: 'Free Plan',
    description: 'Basic alert functionality',
    price: 0,
    currency: 'USD',
    billingCycle: 'monthly',
    features: {
      maxAlerts: 5,
      advancedIndicators: false,
      webhookSupport: false,
      prioritySupport: false,
      apiAccess: false,
      emailSupport: true,
      telegramSupport: true,
      customCooldown: false,
      exportData: false
    },
    limits: {
      alertChecksPerMinute: 10,
      apiRequestsPerHour: 100,
      webhooksPerDay: 0
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'basic',
    name: 'Basic Plan',
    description: 'Enhanced alert features',
    price: 9.99,
    currency: 'USD',
    billingCycle: 'monthly',
    features: {
      maxAlerts: 25,
      advancedIndicators: true,
      webhookSupport: true,
      prioritySupport: false,
      apiAccess: false,
      emailSupport: true,
      telegramSupport: true,
      customCooldown: true,
      exportData: true
    },
    limits: {
      alertChecksPerMinute: 50,
      apiRequestsPerHour: 500,
      webhooksPerDay: 100
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'pro',
    name: 'Pro Plan',
    description: 'Professional trading alerts',
    price: 29.99,
    currency: 'USD',
    billingCycle: 'monthly',
    features: {
      maxAlerts: 100,
      advancedIndicators: true,
      webhookSupport: true,
      prioritySupport: true,
      apiAccess: true,
      emailSupport: true,
      telegramSupport: true,
      customCooldown: true,
      exportData: true
    },
    limits: {
      alertChecksPerMinute: 200,
      apiRequestsPerHour: 2000,
      webhooksPerDay: 1000
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'premium',
    name: 'Premium Plan',
    description: 'Enterprise-grade alert system',
    price: 99.99,
    currency: 'USD',
    billingCycle: 'monthly',
    features: {
      maxAlerts: 500,
      advancedIndicators: true,
      webhookSupport: true,
      prioritySupport: true,
      apiAccess: true,
      emailSupport: true,
      telegramSupport: true,
      customCooldown: true,
      exportData: true
    },
    limits: {
      alertChecksPerMinute: 1000,
      apiRequestsPerHour: 10000,
      webhooksPerDay: 10000
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print('Default subscription plans inserted');

// Insert supported exchanges and symbols
print('Inserting supported exchanges and symbols...');

db.exchanges.insertMany([
  {
    _id: 'binance',
    name: 'Binance',
    description: 'World\'s largest cryptocurrency exchange',
    baseUrl: 'https://api.binance.com',
    isActive: true,
    supportedFeatures: ['spot', 'futures', 'options'],
    rateLimits: {
      requestsPerSecond: 20,
      requestsPerMinute: 1200,
      weightPerMinute: 6000
    },
    fees: {
      maker: 0.001,
      taker: 0.001
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'coinbase',
    name: 'Coinbase Pro',
    description: 'Professional cryptocurrency trading platform',
    baseUrl: 'https://api.pro.coinbase.com',
    isActive: true,
    supportedFeatures: ['spot'],
    rateLimits: {
      requestsPerSecond: 10,
      requestsPerMinute: 600
    },
    fees: {
      maker: 0.005,
      taker: 0.005
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'kraken',
    name: 'Kraken',
    description: 'Secure and reliable cryptocurrency exchange',
    baseUrl: 'https://api.kraken.com',
    isActive: true,
    supportedFeatures: ['spot', 'futures'],
    rateLimits: {
      requestsPerSecond: 1,
      requestsPerMinute: 60
    },
    fees: {
      maker: 0.0016,
      taker: 0.0026
    },
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print('Exchanges inserted successfully');

// Create admin user
print('Creating admin user...');

db.users.insertOne({
  email: 'admin@alertbot.com',
  passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.PmvAu.', // password: admin123
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
  subscriptionPlan: 'premium',
  isActive: true,
  isEmailVerified: true,
  preferences: {
    notifications: {
      email: true,
      telegram: true,
      webhook: false
    },
    timezone: 'UTC',
    language: 'en'
  },
  metadata: {
    source: 'system',
    isSystemUser: true
  },
  createdAt: new Date(),
  updatedAt: new Date()
});

print('Admin user created successfully');

// Create system configuration
print('Creating system configuration...');

db.systemconfig.insertOne({
  _id: 'main',
  version: '1.0.0',
  maintenance: {
    enabled: false,
    message: 'System is under maintenance. Please try again later.',
    startTime: null,
    endTime: null
  },
  features: {
    userRegistration: true,
    alertCreation: true,
    marketDataUpdates: true,
    notifications: true,
    webhooks: true,
    apiAccess: true
  },
  limits: {
    maxUsersPerPlan: {
      free: 10000,
      basic: 50000,
      pro: 100000,
      premium: -1
    },
    maxAlertsGlobal: 1000000,
    maxNotificationsPerDay: 10000000
  },
  security: {
    passwordMinLength: 8,
    passwordRequireSpecialChar: true,
    passwordRequireNumber: true,
    passwordRequireUppercase: true,
    sessionTimeout: 86400000, // 24 hours
    maxLoginAttempts: 5,
    lockoutDuration: 900000 // 15 minutes
  },
  notifications: {
    defaultChannels: ['telegram'],
    retryAttempts: 3,
    retryDelay: 5000
  },
  createdAt: new Date(),
  updatedAt: new Date()
});

print('System configuration created successfully');

print('MongoDB initialization completed successfully!');
print('Database: alert_bot_dev');
print('Collections created: users, alerts, marketdata, subscriptions, notifications, subscriptionplans, exchanges, systemconfig');
print('Indexes created for optimal performance');
print('Default data inserted');
print('Admin user created with email: admin@alertbot.com and password: admin123');