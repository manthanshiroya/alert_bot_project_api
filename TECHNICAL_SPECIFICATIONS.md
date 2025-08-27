# Alert Bot Project - Technical Specifications

## Architecture Overview

The Alert Bot system follows a microservices architecture pattern with the following core services:

```
┌─────────────────────────────────────────────────────────────┐
│                        API Gateway                          │
│                    (Load Balancer)                         │
└─────────────────┬───────────────┬───────────────────────────┘
                  │               │
        ┌─────────▼─────────┐   ┌─▼─────────────────────┐
        │ Subscription      │   │ Telegram Service     │
        │ Service           │   │                      │
        │                   │   │ • Bot Operations     │
        │ • User Mgmt       │   │ • Alert Delivery     │
        │ • Payments        │   │ • Menu Creation      │
        │ • Subscriptions   │   │ • User Interface     │
        │ • Chart Config    │   │                      │
        └─────────┬─────────┘   └─┬────────────────────┘
                  │               │
        ┌─────────▼─────────┐   ┌─▼─────────────────────┐
        │ MongoDB           │   │ Redis Cache          │
        │ (Primary DB)      │   │ (Sessions & Queue)   │
        └───────────────────┘   └──────────────────────┘
                  │
        ┌─────────▼─────────┐
        │ Alert Condition   │
        │ Engine            │
        │ (Rule Processor)  │
        └───────────────────┘
```

## Technology Stack

### Backend Technologies
- **Runtime**: Node.js 18+ LTS
- **Framework**: Express.js 4.18+
- **Database**: MongoDB 6.0+ with Mongoose ODM
- **Cache/Queue**: Redis 7.0+
- **Authentication**: JWT (jsonwebtoken)
- **Validation**: Joi or express-validator
- **Logging**: Winston with structured logging
- **Testing**: Jest + Supertest
- **Documentation**: Swagger/OpenAPI 3.0

### External Integrations
- **Telegram Bot API**: node-telegram-bot-api
- **TradingView**: Webhook integration
- **File Storage**: Local filesystem or AWS S3
- **Monitoring**: Prometheus + Grafana

### Development Tools
- **Containerization**: Docker + Docker Compose
- **Code Quality**: ESLint + Prettier
- **Git Hooks**: Husky + lint-staged
- **Environment**: dotenv for configuration

## Microservices Architecture

### 1. API Gateway Service

**Purpose**: Central entry point for all client requests

**Responsibilities**:
- Request routing to appropriate microservices
- Authentication and authorization
- Rate limiting and throttling
- Request/response logging
- CORS handling
- API versioning

**Technology Stack**:
```javascript
// Dependencies
{
  "express": "^4.18.0",
  "express-rate-limit": "^6.7.0",
  "helmet": "^6.1.0",
  "cors": "^2.8.5",
  "http-proxy-middleware": "^2.0.6",
  "jsonwebtoken": "^9.0.0"
}
```

**Configuration**:
```javascript
// Gateway routing configuration
const routes = {
  '/api/v1/users': 'http://subscription-service:3001',
  '/api/v1/subscriptions': 'http://subscription-service:3001',
  '/api/v1/charts': 'http://subscription-service:3001',
  '/api/v1/telegram': 'http://telegram-service:3002',
  '/api/v1/webhooks': 'http://subscription-service:3001'
};
```

### 2. Subscription Service

**Purpose**: Core business logic for user and subscription management

**Responsibilities**:
- User registration and profile management
- Subscription plan creation and management
- Payment verification workflow
- Chart and symbol configuration
- Alert condition management
- Admin operations

**Database Schema**:
```javascript
// User Model
const userSchema = {
  _id: ObjectId,
  telegram_id: { type: String, unique: true, required: true },
  username: String,
  first_name: String,
  last_name: String,
  subscriptions: [{
    subscription_id: ObjectId,
    plan_id: ObjectId,
    status: { type: String, enum: ['pending', 'active', 'expired', 'cancelled'] },
    start_date: Date,
    end_date: Date,
    payment_proof: String,
    preferences: {
      symbols: [String],
      timeframes: [String],
      alert_types: [String]
    }
  }],
  status: { type: String, enum: ['active', 'inactive', 'banned'], default: 'active' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
};

// Subscription Plan Model
const subscriptionPlanSchema = {
  _id: ObjectId,
  name: { type: String, required: true },
  description: String,
  features: [{
    name: String,
    description: String,
    enabled: Boolean
  }],
  charts: [ObjectId],
  symbols: [String],
  timeframes: [String],
  price: {
    amount: Number,
    currency: String
  },
  duration_days: Number,
  max_alerts_per_hour: { type: Number, default: 50 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  created_at: { type: Date, default: Date.now }
};

// Chart Model
const chartSchema = {
  _id: ObjectId,
  name: { type: String, required: true },
  symbol: { type: String, required: true },
  timeframe: { type: String, required: true },
  tradingview_chart_id: String,
  subscription_plans: [ObjectId],
  conditions: [{
    condition_id: String,
    name: String,
    rules: Object,
    actions: [Object],
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    enabled: { type: Boolean, default: true }
  }],
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  created_at: { type: Date, default: Date.now }
};

// Alert Log Model
const alertLogSchema = {
  _id: ObjectId,
  alert_id: String,
  chart_id: ObjectId,
  symbol: String,
  timeframe: String,
  payload: Object,
  matched_conditions: [String],
  target_users: [{
    user_id: ObjectId,
    telegram_id: String,
    delivery_status: { type: String, enum: ['pending', 'sent', 'failed'] },
    delivery_time: Date,
    error_message: String
  }],
  created_at: { type: Date, default: Date.now }
};
```

**API Endpoints**:
```javascript
// User Management
POST   /api/v1/users                     // Register user
GET    /api/v1/users/:id                 // Get user details
PUT    /api/v1/users/:id                 // Update user
DELETE /api/v1/users/:id                 // Delete user
GET    /api/v1/users/:id/subscriptions   // User subscriptions

// Subscription Management
POST   /api/v1/subscriptions             // Create plan (Admin)
GET    /api/v1/subscriptions             // List plans
GET    /api/v1/subscriptions/:id         // Get plan details
PUT    /api/v1/subscriptions/:id         // Update plan (Admin)
DELETE /api/v1/subscriptions/:id         // Delete plan (Admin)

// Subscription Requests
POST   /api/v1/subscription-requests     // Submit request
GET    /api/v1/subscription-requests     // List requests (Admin)
PUT    /api/v1/subscription-requests/:id/approve  // Approve
PUT    /api/v1/subscription-requests/:id/reject   // Reject

// Chart Management
POST   /api/v1/charts                    // Create chart
GET    /api/v1/charts                    // List charts
PUT    /api/v1/charts/:id                // Update chart
DELETE /api/v1/charts/:id                // Delete chart

// Symbol Management
POST   /api/v1/symbols                   // Add symbol
GET    /api/v1/symbols                   // List symbols
PUT    /api/v1/symbols/:symbol           // Update symbol

// Webhook Endpoints
POST   /api/v1/webhooks/tradingview      // Receive alerts
GET    /api/v1/webhooks/status           // Health check

// Admin APIs
GET    /api/v1/admin/dashboard           // Dashboard data
GET    /api/v1/admin/analytics           // Analytics
POST   /api/v1/admin/conditions          // Create condition
PUT    /api/v1/admin/conditions/:id      // Update condition
GET    /api/v1/admin/dropdown-options    // Dropdown data
```

### 3. Telegram Service

**Purpose**: Handle all Telegram bot operations and message delivery

**Responsibilities**:
- Telegram bot setup and command handling
- Message formatting and delivery
- Interactive menu creation
- User session management
- Delivery status tracking
- Rate limiting for Telegram API

**Bot Commands**:
```javascript
const botCommands = {
  '/start': 'User registration and welcome message',
  '/help': 'Display bot usage instructions',
  '/status': 'Show subscription status',
  '/subscriptions': 'List active subscriptions',
  '/preferences': 'Configure alert preferences',
  '/history': 'View recent alert history',
  '/support': 'Contact support information'
};
```

**Message Queue Structure**:
```javascript
// Alert Queue Item
const alertQueueItem = {
  id: String,
  user_id: ObjectId,
  telegram_id: String,
  message: {
    text: String,
    parse_mode: 'HTML',
    reply_markup: Object
  },
  priority: { type: String, enum: ['low', 'medium', 'high'] },
  retry_count: { type: Number, default: 0 },
  max_retries: { type: Number, default: 3 },
  created_at: Date,
  scheduled_at: Date
};
```

**API Endpoints**:
```javascript
// Message Operations
POST   /api/v1/telegram/send-message     // Send message
POST   /api/v1/telegram/send-alert       // Send alert
POST   /api/v1/telegram/broadcast        // Broadcast message

// Bot Management
GET    /api/v1/telegram/bot-info         // Bot information
GET    /api/v1/telegram/webhook-info     // Webhook status
POST   /api/v1/telegram/set-webhook      // Set webhook URL

// User Interaction
POST   /api/v1/telegram/webhook          // Telegram webhook
GET    /api/v1/telegram/user/:id/session // User session
```

### 4. Alert Condition Engine

**Purpose**: Process and evaluate dynamic alert conditions

**Responsibilities**:
- Parse incoming webhook payloads
- Evaluate condition rules
- Match alerts to user subscriptions
- Apply user preferences
- Queue alerts for delivery

**Condition Rule Structure**:
```javascript
const conditionRule = {
  condition_id: 'btc_premium_5min',
  name: 'BTC Premium 5-Minute Alerts',
  description: 'High-priority BTC alerts for premium users',
  rules: {
    // Symbol matching
    symbol: {
      operator: 'equals',
      value: 'BTC',
      case_sensitive: false
    },
    // Timeframe matching
    timeframe: {
      operator: 'equals',
      value: '5min'
    },
    // Subscription tier matching
    subscription_tier: {
      operator: 'in',
      value: ['premium', 'pro']
    },
    // User status validation
    user_status: {
      operator: 'equals',
      value: 'active'
    },
    // Time-based conditions
    market_hours: {
      operator: 'between',
      value: ['09:00', '16:00'],
      timezone: 'UTC'
    },
    // Rate limiting
    last_alert_time: {
      operator: 'greater_than',
      value: '5min',
      unit: 'minutes'
    }
  },
  actions: [
    {
      type: 'send_telegram',
      priority: 'high',
      template: 'premium_alert',
      delay: 0
    },
    {
      type: 'log_alert',
      retention: '30d',
      include_payload: true
    }
  ],
  enabled: true,
  created_by: 'admin_user_id',
  created_at: Date,
  last_modified: Date
};
```

**Condition Operators**:
```javascript
const operators = {
  // String operators
  'equals': (value, target) => value === target,
  'not_equals': (value, target) => value !== target,
  'contains': (value, target) => value.includes(target),
  'starts_with': (value, target) => value.startsWith(target),
  'ends_with': (value, target) => value.endsWith(target),
  
  // Numeric operators
  'greater_than': (value, target) => parseFloat(value) > parseFloat(target),
  'less_than': (value, target) => parseFloat(value) < parseFloat(target),
  'between': (value, [min, max]) => {
    const num = parseFloat(value);
    return num >= parseFloat(min) && num <= parseFloat(max);
  },
  
  // Array operators
  'in': (value, array) => array.includes(value),
  'not_in': (value, array) => !array.includes(value),
  
  // Time operators
  'time_between': (value, [start, end]) => {
    // Implementation for time range checking
  },
  'days_ago': (value, days) => {
    // Implementation for date comparison
  }
};
```

## Database Design

### MongoDB Configuration

**Connection Settings**:
```javascript
const mongoConfig = {
  uri: process.env.MONGODB_URI,
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    bufferMaxEntries: 0,
    bufferCommands: false
  }
};
```

**Indexes**:
```javascript
// User indexes
db.users.createIndex({ "telegram_id": 1 }, { unique: true });
db.users.createIndex({ "subscriptions.status": 1 });
db.users.createIndex({ "created_at": 1 });

// Subscription plan indexes
db.subscription_plans.createIndex({ "status": 1 });
db.subscription_plans.createIndex({ "symbols": 1 });

// Chart indexes
db.charts.createIndex({ "symbol": 1, "timeframe": 1 });
db.charts.createIndex({ "subscription_plans": 1 });
db.charts.createIndex({ "status": 1 });

// Alert log indexes
db.alert_logs.createIndex({ "created_at": 1 }, { expireAfterSeconds: 7776000 }); // 90 days
db.alert_logs.createIndex({ "symbol": 1, "timeframe": 1 });
db.alert_logs.createIndex({ "target_users.user_id": 1 });
```

### Redis Configuration

**Usage Patterns**:
```javascript
// Session storage
const sessionKey = `session:${telegram_id}`;
const sessionData = {
  user_id: ObjectId,
  current_menu: String,
  temp_data: Object,
  expires_at: Date
};

// Alert queue
const alertQueueKey = 'alerts:pending';
const alertItem = {
  id: String,
  user_id: String,
  message: Object,
  priority: Number,
  created_at: Number
};

// Rate limiting
const rateLimitKey = `rate_limit:${user_id}:${timeframe}`;
const rateLimitData = {
  count: Number,
  reset_time: Number
};

// Cache
const cacheKey = `cache:${resource}:${id}`;
const cacheData = {
  data: Object,
  expires_at: Number
};
```

## Security Specifications

### Authentication & Authorization

**JWT Token Structure**:
```javascript
const jwtPayload = {
  user_id: ObjectId,
  telegram_id: String,
  role: String, // 'user' | 'admin'
  permissions: [String],
  iat: Number,
  exp: Number
};
```

**API Key Authentication**:
```javascript
const apiKeyHeader = 'X-API-Key';
const apiKeyValidation = {
  key: String,
  permissions: [String],
  rate_limit: Number,
  expires_at: Date
};
```

### Input Validation

**Validation Schemas**:
```javascript
// User registration
const userRegistrationSchema = {
  telegram_id: Joi.string().required().min(1).max(20),
  username: Joi.string().optional().min(3).max(50),
  first_name: Joi.string().required().min(1).max(100)
};

// Subscription request
const subscriptionRequestSchema = {
  plan_id: Joi.string().required().regex(/^[0-9a-fA-F]{24}$/),
  payment_proof: Joi.string().required().uri(),
  preferences: Joi.object({
    symbols: Joi.array().items(Joi.string().uppercase()),
    timeframes: Joi.array().items(Joi.string().valid('1min', '5min', '15min', '1h', '4h', '1d')),
    alert_types: Joi.array().items(Joi.string())
  })
};

// Webhook payload
const webhookPayloadSchema = {
  symbol: Joi.string().required().uppercase(),
  timeframe: Joi.string().required(),
  price: Joi.number().required().positive(),
  signal: Joi.string().required().valid('buy', 'sell', 'hold'),
  timestamp: Joi.date().required(),
  chart_id: Joi.string().optional()
};
```

### Rate Limiting

**Rate Limit Configuration**:
```javascript
const rateLimits = {
  // API endpoints
  '/api/v1/users': {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // requests per window
    message: 'Too many requests from this IP'
  },
  '/api/v1/webhooks/tradingview': {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 1000, // requests per window
    skipSuccessfulRequests: true
  },
  
  // User-specific limits
  'user_alerts': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // alerts per user per hour
    keyGenerator: (req) => req.user.user_id
  }
};
```

## Performance Specifications

### Response Time Targets

```javascript
const performanceTargets = {
  // API response times (95th percentile)
  'GET /api/v1/users/:id': '< 100ms',
  'POST /api/v1/users': '< 200ms',
  'GET /api/v1/subscriptions': '< 150ms',
  'POST /api/v1/webhooks/tradingview': '< 50ms',
  
  // Database query times
  'user_lookup': '< 10ms',
  'subscription_validation': '< 20ms',
  'condition_evaluation': '< 30ms',
  
  // External API calls
  'telegram_send_message': '< 2000ms',
  'file_upload': '< 5000ms'
};
```

### Caching Strategy

```javascript
const cachingStrategy = {
  // Static data (long TTL)
  'subscription_plans': {
    ttl: 3600, // 1 hour
    invalidation: 'on_update'
  },
  'chart_configurations': {
    ttl: 1800, // 30 minutes
    invalidation: 'on_update'
  },
  
  // Dynamic data (short TTL)
  'user_subscriptions': {
    ttl: 300, // 5 minutes
    invalidation: 'on_subscription_change'
  },
  'dropdown_options': {
    ttl: 600, // 10 minutes
    invalidation: 'on_config_change'
  },
  
  // Session data
  'telegram_sessions': {
    ttl: 1800, // 30 minutes
    invalidation: 'on_inactivity'
  }
};
```

## Monitoring & Logging

### Application Metrics

```javascript
const metrics = {
  // Business metrics
  'user_registrations_total': 'counter',
  'subscription_requests_total': 'counter',
  'alerts_sent_total': 'counter',
  'alerts_failed_total': 'counter',
  
  // Performance metrics
  'api_request_duration_seconds': 'histogram',
  'database_query_duration_seconds': 'histogram',
  'telegram_api_duration_seconds': 'histogram',
  
  // System metrics
  'active_users_gauge': 'gauge',
  'queue_size_gauge': 'gauge',
  'memory_usage_bytes': 'gauge',
  'cpu_usage_percent': 'gauge'
};
```

### Logging Configuration

```javascript
const loggingConfig = {
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    })
  ]
};
```

## Deployment Architecture

### Docker Configuration

**Dockerfile Example**:
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

CMD ["node", "src/index.js"]
```

**Docker Compose Configuration**:
```yaml
version: '3.8'

services:
  api-gateway:
    build: ./api-gateway
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongodb:27017/alertbot
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongodb
      - redis
      - subscription-service
      - telegram-service

  subscription-service:
    build: ./subscription-service
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongodb:27017/alertbot
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongodb
      - redis

  telegram-service:
    build: ./telegram-service
    environment:
      - NODE_ENV=production
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  mongodb:
    image: mongo:6.0
    volumes:
      - mongodb_data:/data/db
    environment:
      - MONGO_INITDB_ROOT_USERNAME=${MONGO_USERNAME}
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASSWORD}

  redis:
    image: redis:7.0-alpine
    volumes:
      - redis_data:/data

volumes:
  mongodb_data:
  redis_data:
```

### Environment Configuration

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/alertbot
REDIS_URL=redis://localhost:6379

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=https://your-domain.com/api/v1/telegram/webhook

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=24h

# API
API_PORT=3000
API_HOST=0.0.0.0
API_BASE_URL=https://your-domain.com

# File Upload
UPLOAD_MAX_SIZE=10MB
UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,image/gif

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Monitoring
PROMETHEUS_PORT=9090
LOG_LEVEL=info
```

This technical specification provides a comprehensive foundation for implementing the Alert Bot microservices architecture with all necessary technical details, configurations, and best practices.