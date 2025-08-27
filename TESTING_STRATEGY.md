# Alert Bot Project - Testing Strategy & Quality Assurance Plan

## Overview

This document outlines the comprehensive testing strategy for the Alert Bot microservices architecture, ensuring high-quality, reliable, and maintainable software delivery.

## Testing Philosophy

### Core Principles

1. **Test-Driven Development (TDD)**: Write tests before implementation
2. **Shift-Left Testing**: Integrate testing early in the development cycle
3. **Continuous Testing**: Automated testing in CI/CD pipeline
4. **Risk-Based Testing**: Focus on high-risk, high-impact areas
5. **Quality Gates**: No deployment without passing quality criteria

### Quality Metrics

```javascript
const qualityMetrics = {
  codeCoverage: {
    unit: { minimum: 80, target: 90 },
    integration: { minimum: 70, target: 85 },
    e2e: { minimum: 60, target: 75 }
  },
  performance: {
    apiResponseTime: { maximum: 200, target: 100 }, // milliseconds
    alertDeliveryTime: { maximum: 5000, target: 2000 }, // milliseconds
    throughput: { minimum: 1000, target: 5000 } // alerts per minute
  },
  reliability: {
    uptime: { minimum: 99.5, target: 99.9 }, // percentage
    errorRate: { maximum: 1, target: 0.1 }, // percentage
    mttr: { maximum: 30, target: 15 } // minutes
  }
};
```

## Testing Pyramid

### 1. Unit Testing (70%)

#### Scope
- Individual functions and methods
- Business logic validation
- Data transformation
- Utility functions
- Error handling

#### Tools & Framework

```javascript
// Jest Configuration
const jestConfig = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.test.{js,ts}',
    '!src/**/*.spec.{js,ts}',
    '!src/**/index.{js,ts}'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,ts}',
    '<rootDir>/src/**/*.{test,spec}.{js,ts}'
  ]
};

// Example Unit Test Structure
const unitTestExample = `
describe('UserService', () => {
  describe('validateSubscription', () => {
    it('should return true for active subscription', () => {
      const user = {
        subscriptions: [{
          status: 'active',
          end_date: new Date(Date.now() + 86400000) // tomorrow
        }]
      };
      
      const result = UserService.validateSubscription(user);
      expect(result).toBe(true);
    });
    
    it('should return false for expired subscription', () => {
      const user = {
        subscriptions: [{
          status: 'active',
          end_date: new Date(Date.now() - 86400000) // yesterday
        }]
      };
      
      const result = UserService.validateSubscription(user);
      expect(result).toBe(false);
    });
    
    it('should throw error for invalid user object', () => {
      expect(() => {
        UserService.validateSubscription(null);
      }).toThrow('Invalid user object');
    });
  });
});
`;
```

#### Test Categories

```javascript
const unitTestCategories = {
  // API Gateway Tests
  apiGateway: {
    authentication: [
      'JWT token validation',
      'API key verification',
      'Rate limiting logic',
      'Request routing'
    ],
    middleware: [
      'Request validation',
      'Response formatting',
      'Error handling',
      'Logging middleware'
    ]
  },
  
  // Subscription Service Tests
  subscriptionService: {
    userManagement: [
      'User registration',
      'Subscription validation',
      'Payment verification',
      'User preferences'
    ],
    businessLogic: [
      'Subscription expiry',
      'Plan upgrades/downgrades',
      'Renewal logic',
      'Access control'
    ]
  },
  
  // Telegram Service Tests
  telegramService: {
    messaging: [
      'Message formatting',
      'Template rendering',
      'Keyboard generation',
      'File handling'
    ],
    botLogic: [
      'Command processing',
      'Menu navigation',
      'State management',
      'Error responses'
    ]
  },
  
  // Alert Engine Tests
  alertEngine: {
    conditionEvaluation: [
      'Rule parsing',
      'Condition matching',
      'Priority calculation',
      'Rate limiting'
    ],
    alertProcessing: [
      'Alert formatting',
      'Target user selection',
      'Delivery scheduling',
      'Retry logic'
    ]
  }
};
```

### 2. Integration Testing (20%)

#### Scope
- Service-to-service communication
- Database operations
- External API integrations
- Message queue operations

#### Test Environment Setup

```javascript
// Docker Compose for Integration Tests
const integrationTestSetup = `
version: '3.8'
services:
  mongodb-test:
    image: mongo:6.0
    environment:
      MONGO_INITDB_DATABASE: alertbot_test
    ports:
      - "27018:27017"
    tmpfs:
      - /data/db
  
  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    tmpfs:
      - /data
  
  api-gateway-test:
    build: ./api-gateway
    environment:
      NODE_ENV: test
      MONGODB_URI: mongodb://mongodb-test:27017/alertbot_test
      REDIS_URI: redis://redis-test:6379
    depends_on:
      - mongodb-test
      - redis-test
    ports:
      - "3001:3000"
  
  subscription-service-test:
    build: ./subscription-service
    environment:
      NODE_ENV: test
      MONGODB_URI: mongodb://mongodb-test:27017/alertbot_test
      REDIS_URI: redis://redis-test:6379
    depends_on:
      - mongodb-test
      - redis-test
    ports:
      - "3002:3000"
`;
```

#### Integration Test Examples

```javascript
// Database Integration Tests
const databaseIntegrationTests = `
describe('User Database Integration', () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });
  
  afterEach(async () => {
    await cleanupTestDatabase();
  });
  
  it('should create user with subscription', async () => {
    const userData = {
      telegram_id: '123456789',
      first_name: 'Test User',
      subscriptions: [{
        plan_id: new ObjectId(),
        status: 'active',
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }]
    };
    
    const user = await UserRepository.create(userData);
    expect(user._id).toBeDefined();
    expect(user.telegram_id).toBe('123456789');
    
    const foundUser = await UserRepository.findByTelegramId('123456789');
    expect(foundUser).toBeTruthy();
    expect(foundUser.subscriptions).toHaveLength(1);
  });
});
`;

// Service Communication Tests
const serviceIntegrationTests = `
describe('Service Communication', () => {
  it('should process subscription request end-to-end', async () => {
    // Create subscription request via API Gateway
    const response = await request(app)
      .post('/api/subscriptions/request')
      .set('Authorization', 'Bearer valid_jwt_token')
      .send({
        plan_id: 'premium_plan',
        payment_proof: 'https://example.com/payment.jpg'
      });
    
    expect(response.status).toBe(201);
    expect(response.body.subscription_id).toBeDefined();
    
    // Verify subscription was created in database
    const subscription = await SubscriptionRepository.findById(
      response.body.subscription_id
    );
    expect(subscription.status).toBe('pending');
    
    // Verify notification was sent to admin
    const notifications = await getTestNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('subscription_request');
  });
});
`;
```

### 3. End-to-End Testing (10%)

#### Scope
- Complete user workflows
- Cross-service functionality
- Real-world scenarios
- Performance validation

#### E2E Test Framework

```javascript
// Playwright Configuration
const playwrightConfig = {
  testDir: './e2e',
  timeout: 30000,
  retries: 2,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'telegram-bot',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'api-testing',
      use: { ...devices['Desktop Firefox'] }
    }
  ]
};

// E2E Test Examples
const e2eTestExamples = `
// Complete User Journey Test
test('User subscription and alert flow', async ({ page }) => {
  // Step 1: User starts bot
  await telegramBot.sendMessage('/start');
  const welcomeMessage = await telegramBot.getLastMessage();
  expect(welcomeMessage.text).toContain('Welcome to Alert Bot');
  
  // Step 2: User requests subscription
  await telegramBot.sendMessage('/subscribe');
  const subscriptionMenu = await telegramBot.getLastMessage();
  expect(subscriptionMenu.reply_markup).toBeDefined();
  
  // Step 3: User selects plan
  await telegramBot.clickInlineButton('premium_plan');
  const paymentInstructions = await telegramBot.getLastMessage();
  expect(paymentInstructions.text).toContain('payment instructions');
  
  // Step 4: User submits payment proof
  await telegramBot.sendPhoto('payment_proof.jpg');
  const confirmationMessage = await telegramBot.getLastMessage();
  expect(confirmationMessage.text).toContain('submitted for review');
  
  // Step 5: Admin approves subscription
  await adminPanel.login('admin@example.com', 'password');
  await adminPanel.navigateToSubscriptions();
  await adminPanel.approveSubscription(user.telegram_id);
  
  // Step 6: User receives approval notification
  const approvalMessage = await telegramBot.getLastMessage();
  expect(approvalMessage.text).toContain('approved');
  
  // Step 7: Simulate TradingView webhook
  const webhookPayload = {
    symbol: 'BTC',
    timeframe: '5min',
    signal: 'buy',
    price: 45000,
    confidence: 0.85
  };
  
  await api.post('/webhook/tradingview', webhookPayload);
  
  // Step 8: User receives alert
  const alertMessage = await telegramBot.getLastMessage();
  expect(alertMessage.text).toContain('BTC Buy Signal');
  expect(alertMessage.text).toContain('45000');
});
`;
```

## Specialized Testing

### 1. Performance Testing

#### Load Testing

```javascript
// K6 Load Testing Script
const loadTestScript = `
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp up to 200 users
    { duration: '5m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.1'],    // Error rate under 10%
    errors: ['rate<0.1'],
  },
};

export default function() {
  // Test webhook endpoint
  const webhookPayload = JSON.stringify({
    symbol: 'BTC',
    timeframe: '5min',
    signal: 'buy',
    price: Math.random() * 50000 + 40000,
    confidence: Math.random() * 0.3 + 0.7
  });
  
  const webhookResponse = http.post(
    'http://localhost:3000/webhook/tradingview',
    webhookPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test_api_key'
      }
    }
  );
  
  check(webhookResponse, {
    'webhook status is 200': (r) => r.status === 200,
    'webhook response time < 200ms': (r) => r.timings.duration < 200,
  }) || errorRate.add(1);
  
  sleep(1);
}
`;
```

#### Stress Testing

```javascript
const stressTestScenarios = {
  // High-volume alert processing
  alertFlood: {
    description: 'Process 10,000 alerts in 1 minute',
    duration: '1m',
    target_rps: 167, // requests per second
    expected_behavior: 'System should queue and process all alerts'
  },
  
  // Concurrent user subscriptions
  subscriptionRush: {
    description: '1,000 users subscribing simultaneously',
    duration: '30s',
    concurrent_users: 1000,
    expected_behavior: 'All subscriptions processed without data corruption'
  },
  
  // Database connection exhaustion
  connectionStress: {
    description: 'Exhaust database connection pool',
    concurrent_connections: 200,
    expected_behavior: 'Graceful degradation with proper error handling'
  }
};
```

### 2. Security Testing

#### Authentication & Authorization Tests

```javascript
const securityTests = `
describe('Security Tests', () => {
  describe('Authentication', () => {
    it('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer invalid_token');
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });
    
    it('should reject expired JWT tokens', async () => {
      const expiredToken = jwt.sign(
        { user_id: 'test' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );
      
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', \`Bearer \${expiredToken}\`);
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Token expired');
    });
  });
  
  describe('Input Validation', () => {
    it('should sanitize SQL injection attempts', async () => {
      const maliciousInput = "'; DROP TABLE users; --";
      
      const response = await request(app)
        .post('/api/users/search')
        .send({ query: maliciousInput });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid input');
    });
    
    it('should prevent XSS attacks', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      
      const response = await request(app)
        .post('/api/users/update')
        .send({ first_name: xssPayload });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid characters');
    });
  });
  
  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = [];
      
      // Send 101 requests (assuming limit is 100)
      for (let i = 0; i < 101; i++) {
        requests.push(
          request(app)
            .get('/api/health')
            .set('X-Forwarded-For', '192.168.1.1')
        );
      }
      
      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});
`;
```

#### Penetration Testing Checklist

```javascript
const penetrationTestChecklist = {
  authentication: [
    'Brute force protection',
    'Session management',
    'Password policy enforcement',
    'Multi-factor authentication bypass'
  ],
  
  authorization: [
    'Privilege escalation',
    'Horizontal access control',
    'Vertical access control',
    'API endpoint authorization'
  ],
  
  inputValidation: [
    'SQL injection',
    'NoSQL injection',
    'XSS (stored and reflected)',
    'Command injection',
    'Path traversal',
    'File upload vulnerabilities'
  ],
  
  businessLogic: [
    'Payment bypass',
    'Subscription manipulation',
    'Alert spoofing',
    'Rate limiting bypass'
  ],
  
  infrastructure: [
    'SSL/TLS configuration',
    'HTTP security headers',
    'CORS configuration',
    'Information disclosure'
  ]
};
```

### 3. Telegram Bot Testing

#### Bot Interaction Testing

```javascript
// Telegram Bot Test Framework
const telegramBotTests = `
class TelegramBotTester {
  constructor(botToken) {
    this.bot = new TelegramBot(botToken, { polling: false });
    this.testChatId = process.env.TEST_CHAT_ID;
    this.messageHistory = [];
  }
  
  async sendMessage(text) {
    const message = {
      message_id: Date.now(),
      from: {
        id: this.testChatId,
        first_name: 'Test',
        username: 'testuser'
      },
      chat: { id: this.testChatId },
      text: text,
      date: Math.floor(Date.now() / 1000)
    };
    
    // Simulate bot receiving message
    await this.bot.processUpdate({ message });
    return message;
  }
  
  async clickInlineButton(callbackData) {
    const callbackQuery = {
      id: Date.now().toString(),
      from: {
        id: this.testChatId,
        first_name: 'Test',
        username: 'testuser'
      },
      message: {
        message_id: Date.now() - 1000,
        chat: { id: this.testChatId }
      },
      data: callbackData
    };
    
    await this.bot.processUpdate({ callback_query: callbackQuery });
    return callbackQuery;
  }
  
  async getLastMessage() {
    // Mock implementation - in real tests, capture bot responses
    return this.messageHistory[this.messageHistory.length - 1];
  }
}

// Bot Command Tests
describe('Telegram Bot Commands', () => {
  let botTester;
  
  beforeEach(() => {
    botTester = new TelegramBotTester(process.env.TEST_BOT_TOKEN);
  });
  
  it('should respond to /start command', async () => {
    await botTester.sendMessage('/start');
    const response = await botTester.getLastMessage();
    
    expect(response.text).toContain('Welcome to Alert Bot');
    expect(response.reply_markup.inline_keyboard).toBeDefined();
  });
  
  it('should handle subscription flow', async () => {
    // Start subscription
    await botTester.sendMessage('/subscribe');
    let response = await botTester.getLastMessage();
    expect(response.text).toContain('Choose a subscription plan');
    
    // Select plan
    await botTester.clickInlineButton('plan_premium');
    response = await botTester.getLastMessage();
    expect(response.text).toContain('payment instructions');
    
    // Submit payment proof
    await botTester.sendPhoto('test_payment.jpg');
    response = await botTester.getLastMessage();
    expect(response.text).toContain('submitted for review');
  });
  
  it('should handle invalid commands gracefully', async () => {
    await botTester.sendMessage('/invalidcommand');
    const response = await botTester.getLastMessage();
    
    expect(response.text).toContain('Unknown command');
    expect(response.reply_markup.inline_keyboard).toBeDefined();
  });
});
`;
```

## Test Data Management

### Test Data Strategy

```javascript
const testDataStrategy = {
  // Test Data Categories
  categories: {
    minimal: {
      description: 'Minimal data for basic functionality',
      users: 5,
      subscriptions: 3,
      charts: 2,
      alerts: 10
    },
    
    realistic: {
      description: 'Realistic data volume for integration tests',
      users: 100,
      subscriptions: 50,
      charts: 20,
      alerts: 1000
    },
    
    stress: {
      description: 'Large data set for performance testing',
      users: 10000,
      subscriptions: 5000,
      charts: 100,
      alerts: 100000
    }
  },
  
  // Data Generation
  generators: {
    user: () => ({
      telegram_id: faker.datatype.number({ min: 100000000, max: 999999999 }).toString(),
      first_name: faker.name.firstName(),
      last_name: faker.name.lastName(),
      username: faker.internet.userName(),
      email: faker.internet.email(),
      status: faker.helpers.arrayElement(['active', 'inactive']),
      created_at: faker.date.past()
    }),
    
    subscription: (userId, planId) => ({
      user_id: userId,
      plan_id: planId,
      status: faker.helpers.arrayElement(['active', 'pending', 'expired']),
      start_date: faker.date.past(),
      end_date: faker.date.future(),
      payment_amount: faker.datatype.number({ min: 10, max: 100 }),
      payment_currency: 'USD'
    }),
    
    alert: (chartId) => ({
      chart_id: chartId,
      symbol: faker.helpers.arrayElement(['BTC', 'ETH', 'AAPL', 'TSLA']),
      timeframe: faker.helpers.arrayElement(['5min', '1h', '4h', '1d']),
      signal_type: faker.helpers.arrayElement(['buy', 'sell']),
      payload: {
        price: faker.datatype.number({ min: 100, max: 50000 }),
        confidence: faker.datatype.float({ min: 0.5, max: 1.0 }),
        volume: faker.datatype.number({ min: 1000, max: 10000000 })
      },
      created_at: faker.date.recent()
    })
  }
};

// Test Data Seeding
const testDataSeeder = `
class TestDataSeeder {
  constructor(database) {
    this.db = database;
  }
  
  async seedMinimalData() {
    await this.clearDatabase();
    
    // Create admin user
    const admin = await this.db.admin_users.insertOne({
      username: 'testadmin',
      email: 'admin@test.com',
      password_hash: await bcrypt.hash('testpassword', 10),
      role: 'admin',
      status: 'active'
    });
    
    // Create subscription plans
    const plans = await this.db.subscription_plans.insertMany([
      {
        name: 'Basic Plan',
        slug: 'basic',
        pricing: { base_price: { amount: 19.99, currency: 'USD' } },
        duration_days: 30,
        status: 'active'
      },
      {
        name: 'Premium Plan',
        slug: 'premium',
        pricing: { base_price: { amount: 49.99, currency: 'USD' } },
        duration_days: 30,
        status: 'active'
      }
    ]);
    
    // Create test users
    const users = [];
    for (let i = 0; i < 5; i++) {
      const user = testDataStrategy.generators.user();
      users.push(await this.db.users.insertOne(user));
    }
    
    // Create charts
    const charts = await this.db.charts.insertMany([
      {
        name: 'BTC 5min Signals',
        symbol: 'BTC',
        timeframe: '5min',
        market_type: 'crypto',
        status: 'active',
        subscription_plans: [plans.insertedIds[1]] // Premium plan
      },
      {
        name: 'ETH 1h Signals',
        symbol: 'ETH',
        timeframe: '1h',
        market_type: 'crypto',
        status: 'active',
        subscription_plans: [plans.insertedIds[0], plans.insertedIds[1]]
      }
    ]);
    
    return {
      admin: admin.insertedId,
      plans: plans.insertedIds,
      users: users.map(u => u.insertedId),
      charts: charts.insertedIds
    };
  }
  
  async clearDatabase() {
    const collections = [
      'users', 'subscription_plans', 'charts', 'alert_logs',
      'alert_conditions', 'admin_users', 'system_config'
    ];
    
    for (const collection of collections) {
      await this.db[collection].deleteMany({});
    }
  }
}
`;
```

## Continuous Integration Testing

### CI/CD Pipeline Integration

```yaml
# GitHub Actions Workflow
name: Test Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16.x, 18.x]
        service: [api-gateway, subscription-service, telegram-service, alert-engine]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: |
        cd ${{ matrix.service }}
        npm ci
    
    - name: Run unit tests
      run: |
        cd ${{ matrix.service }}
        npm run test:unit -- --coverage
    
    - name: Upload coverage reports
      uses: codecov/codecov-action@v3
      with:
        file: ./${{ matrix.service }}/coverage/lcov.info
        flags: ${{ matrix.service }}

  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    
    services:
      mongodb:
        image: mongo:6.0
        env:
          MONGO_INITDB_DATABASE: alertbot_test
        ports:
          - 27017:27017
      
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 18.x
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run integration tests
      run: npm run test:integration
      env:
        MONGODB_URI: mongodb://localhost:27017/alertbot_test
        REDIS_URI: redis://localhost:6379
        NODE_ENV: test

  e2e-tests:
    runs-on: ubuntu-latest
    needs: integration-tests
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 18.x
        cache: 'npm'
    
    - name: Start services
      run: |
        docker-compose -f docker-compose.test.yml up -d
        sleep 30  # Wait for services to be ready
    
    - name: Run E2E tests
      run: npm run test:e2e
    
    - name: Stop services
      run: docker-compose -f docker-compose.test.yml down

  security-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Run security audit
      run: npm audit --audit-level=high
    
    - name: Run SAST scan
      uses: github/super-linter@v4
      env:
        DEFAULT_BRANCH: main
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        VALIDATE_JAVASCRIPT_ES: true
        VALIDATE_TYPESCRIPT_ES: true

  performance-tests:
    runs-on: ubuntu-latest
    needs: integration-tests
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup K6
      run: |
        sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
        echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
        sudo apt-get update
        sudo apt-get install k6
    
    - name: Start services
      run: docker-compose -f docker-compose.test.yml up -d
    
    - name: Run performance tests
      run: k6 run tests/performance/load-test.js
    
    - name: Stop services
      run: docker-compose -f docker-compose.test.yml down
```

### Quality Gates

```javascript
const qualityGates = {
  // Code Quality Gates
  codeQuality: {
    unitTestCoverage: { minimum: 80 },
    integrationTestCoverage: { minimum: 70 },
    codeComplexity: { maximum: 10 },
    duplicatedLines: { maximum: 3 },
    maintainabilityIndex: { minimum: 70 }
  },
  
  // Performance Gates
  performance: {
    apiResponseTime: { p95: 500 }, // milliseconds
    alertProcessingTime: { p95: 2000 }, // milliseconds
    throughput: { minimum: 1000 }, // requests per minute
    errorRate: { maximum: 1 } // percentage
  },
  
  // Security Gates
  security: {
    vulnerabilities: {
      critical: { maximum: 0 },
      high: { maximum: 0 },
      medium: { maximum: 5 }
    },
    dependencyAudit: { allowedRisk: 'low' },
    secretsDetection: { violations: 0 }
  },
  
  // Deployment Gates
  deployment: {
    allTestsPassing: true,
    codeReviewApproved: true,
    securityScanPassed: true,
    performanceTestsPassed: true
  }
};
```

## Test Reporting & Monitoring

### Test Metrics Dashboard

```javascript
const testMetrics = {
  // Test Execution Metrics
  execution: {
    totalTests: 'number',
    passedTests: 'number',
    failedTests: 'number',
    skippedTests: 'number',
    executionTime: 'milliseconds',
    testSuccessRate: 'percentage'
  },
  
  // Coverage Metrics
  coverage: {
    lineCoverage: 'percentage',
    branchCoverage: 'percentage',
    functionCoverage: 'percentage',
    statementCoverage: 'percentage'
  },
  
  // Quality Metrics
  quality: {
    codeComplexity: 'number',
    maintainabilityIndex: 'number',
    technicalDebt: 'hours',
    duplicatedCode: 'percentage'
  },
  
  // Performance Metrics
  performance: {
    averageResponseTime: 'milliseconds',
    p95ResponseTime: 'milliseconds',
    throughput: 'requests_per_second',
    errorRate: 'percentage'
  }
};

// Test Report Generation
const testReportGenerator = `
class TestReportGenerator {
  constructor() {
    this.results = {
      unit: [],
      integration: [],
      e2e: [],
      performance: [],
      security: []
    };
  }
  
  addTestResult(type, result) {
    this.results[type].push({
      ...result,
      timestamp: new Date().toISOString()
    });
  }
  
  generateSummaryReport() {
    const summary = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      coverage: {
        overall: 0,
        byService: {}
      },
      performance: {
        averageResponseTime: 0,
        throughput: 0
      },
      security: {
        vulnerabilities: 0,
        riskLevel: 'low'
      }
    };
    
    // Calculate metrics from test results
    Object.values(this.results).forEach(typeResults => {
      typeResults.forEach(result => {
        summary.totalTests += result.total || 0;
        summary.passedTests += result.passed || 0;
        summary.failedTests += result.failed || 0;
      });
    });
    
    return summary;
  }
  
  generateDetailedReport() {
    return {
      summary: this.generateSummaryReport(),
      details: this.results,
      trends: this.calculateTrends(),
      recommendations: this.generateRecommendations()
    };
  }
  
  calculateTrends() {
    // Analyze test results over time
    return {
      coverageTrend: 'increasing',
      performanceTrend: 'stable',
      qualityTrend: 'improving'
    };
  }
  
  generateRecommendations() {
    const recommendations = [];
    
    // Analyze results and generate actionable recommendations
    if (this.getCoveragePercentage() < 80) {
      recommendations.push({
        type: 'coverage',
        priority: 'high',
        message: 'Increase test coverage to meet 80% threshold',
        actions: [
          'Add unit tests for uncovered functions',
          'Implement integration tests for new features',
          'Review and update existing test cases'
        ]
      });
    }
    
    return recommendations;
  }
}
`;
```

## Test Environment Management

### Environment Configuration

```javascript
const testEnvironments = {
  // Local Development
  local: {
    database: {
      mongodb: 'mongodb://localhost:27017/alertbot_test',
      redis: 'redis://localhost:6379'
    },
    services: {
      apiGateway: 'http://localhost:3000',
      subscriptionService: 'http://localhost:3001',
      telegramService: 'http://localhost:3002',
      alertEngine: 'http://localhost:3003'
    },
    external: {
      telegramBot: 'mock',
      tradingView: 'mock'
    }
  },
  
  // CI/CD Pipeline
  ci: {
    database: {
      mongodb: 'mongodb://mongodb-test:27017/alertbot_test',
      redis: 'redis://redis-test:6379'
    },
    services: {
      apiGateway: 'http://api-gateway-test:3000',
      subscriptionService: 'http://subscription-service-test:3000',
      telegramService: 'http://telegram-service-test:3000',
      alertEngine: 'http://alert-engine-test:3000'
    },
    external: {
      telegramBot: 'mock',
      tradingView: 'mock'
    }
  },
  
  // Staging Environment
  staging: {
    database: {
      mongodb: process.env.STAGING_MONGODB_URI,
      redis: process.env.STAGING_REDIS_URI
    },
    services: {
      apiGateway: 'https://api-staging.alertbot.com',
      subscriptionService: 'https://subscription-staging.alertbot.com',
      telegramService: 'https://telegram-staging.alertbot.com',
      alertEngine: 'https://alert-staging.alertbot.com'
    },
    external: {
      telegramBot: 'real',
      tradingView: 'real'
    }
  }
};
```

This comprehensive testing strategy ensures high-quality software delivery through systematic testing at all levels, from unit tests to end-to-end scenarios, with proper automation, monitoring, and continuous improvement processes.