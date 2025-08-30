# TradingView Alert Distribution System - API Documentation

## 1. API Overview

### 1.1 Base Information
- **Base URL**: `https://api.tradingalerts.com/v1`
- **Protocol**: HTTPS only
- **Content Type**: `application/json`
- **Authentication**: JWT Bearer tokens, API Keys
- **Rate Limiting**: Implemented per endpoint
- **API Version**: v1

### 1.2 Response Format
All API responses follow a consistent structure:

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully",
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "req_123456789"
}
```

### 1.3 Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": {
      "field": "email",
      "reason": "Invalid email format"
    }
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "req_123456789"
}
```

### 1.4 HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `429` - Too Many Requests
- `500` - Internal Server Error

## 2. Authentication

### 2.1 JWT Authentication
Used for admin panel and user management.

**Login Endpoint:**
```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "securePassword"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "refresh_token_here",
    "expiresIn": 3600,
    "user": {
      "id": "admin_123",
      "email": "admin@example.com",
      "role": "admin",
      "permissions": ["users.view", "subscriptions.approve"]
    }
  }
}
```

**Usage:**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2.2 API Key Authentication
Used for webhook endpoints and external integrations.

**Usage:**
```http
X-API-Key: your_api_key_here
```

### 2.3 Webhook Signature Verification
For TradingView webhooks:

```http
X-TradingView-Signature: sha256=calculated_signature
```

## 3. Core API Endpoints

### 3.1 User Management

#### Get User Profile
```http
GET /users/{userId}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "telegram": {
      "userId": "telegram_123",
      "username": "john_trader",
      "firstName": "John",
      "lastName": "Doe",
      "chatId": "chat_123"
    },
    "profile": {
      "name": "John Doe",
      "phone": "+1234567890",
      "timezone": "UTC"
    },
    "status": "active",
    "preferences": {
      "notifications": {
        "email": true,
        "telegram": true,
        "renewalReminders": true
      },
      "trading": {
        "riskLevel": "medium",
        "maxDailyAlerts": 50
      }
    },
    "createdAt": "2024-01-01T00:00:00Z",
    "lastLoginAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Update User Profile
```http
PUT /users/{userId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "profile": {
    "name": "John Smith",
    "phone": "+1234567890",
    "timezone": "America/New_York"
  },
  "preferences": {
    "notifications": {
      "email": false,
      "telegram": true,
      "renewalReminders": true
    },
    "trading": {
      "riskLevel": "high",
      "maxDailyAlerts": 100
    }
  }
}
```

#### List Users (Admin)
```http
GET /admin/users?page=1&limit=20&status=active&search=john
Authorization: Bearer {admin_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user_123",
        "email": "user@example.com",
        "profile": {
          "name": "John Doe"
        },
        "status": "active",
        "activeSubscriptions": 2,
        "createdAt": "2024-01-01T00:00:00Z",
        "lastLoginAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

### 3.2 Subscription Management

#### Get Subscription Plans
```http
GET /subscription-plans?status=active
```

**Response:**
```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "plan_123",
        "name": "Premium Trading Alerts",
        "description": "Advanced trading alerts with premium features",
        "pricing": {
          "amount": 2999,
          "currency": "INR",
          "duration": {
            "months": 3,
            "days": 0
          }
        },
        "features": {
          "maxAlertConfigs": -1,
          "maxOpenTrades": 3,
          "prioritySupport": true,
          "advancedAnalytics": true
        },
        "alertConfigurations": [
          {
            "id": "config_123",
            "name": "BTC Premium Signals",
            "symbol": "BTC",
            "timeframe": "5m",
            "strategy": "Premium Strategy V2"
          }
        ],
        "status": "active",
        "metadata": {
          "displayOrder": 1,
          "isPopular": true,
          "tags": ["premium", "crypto"]
        }
      }
    ]
  }
}
```

#### Create Subscription Request
```http
POST /subscriptions
Authorization: Bearer {token}
Content-Type: application/json

{
  "subscriptionPlanId": "plan_123",
  "payment": {
    "transactionId": "txn_123456789",
    "amount": 2999,
    "currency": "INR",
    "method": "UPI",
    "proofUrl": "https://example.com/payment-proof.jpg"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscriptionId": "sub_123",
    "status": "pending",
    "message": "Subscription request created successfully. Awaiting admin approval."
  }
}
```

#### Get User Subscriptions
```http
GET /users/{userId}/subscriptions?status=active
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscriptions": [
      {
        "id": "sub_123",
        "subscriptionPlan": {
          "id": "plan_123",
          "name": "Premium Trading Alerts",
          "pricing": {
            "amount": 2999,
            "currency": "INR",
            "duration": {
              "months": 3
            }
          }
        },
        "payment": {
          "transactionId": "txn_123456789",
          "amount": 2999,
          "status": "approved",
          "approvedAt": "2024-01-02T10:00:00Z"
        },
        "subscription": {
          "startDate": "2024-01-02T10:00:00Z",
          "endDate": "2024-04-02T10:00:00Z",
          "status": "active",
          "autoRenew": false
        },
        "usage": {
          "alertsReceived": 245,
          "tradesOpened": 12,
          "lastActivityAt": "2024-01-15T09:30:00Z"
        }
      }
    ]
  }
}
```

#### Approve Subscription (Admin)
```http
PUT /admin/subscriptions/{subscriptionId}/approve
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "approved": true,
  "startDate": "2024-01-15T00:00:00Z",
  "notes": "Payment verified and approved"
}
```

### 3.3 Alert Configuration Management

#### Get Alert Configurations
```http
GET /alert-configurations?symbol=BTC&timeframe=5m&status=active
Authorization: Bearer {admin_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "configurations": [
      {
        "id": "config_123",
        "name": "BTC 5-Minute Premium Signals",
        "description": "High-frequency BTC trading signals",
        "symbol": "BTC",
        "timeframe": "5m",
        "strategy": "Premium Strategy V2",
        "tradeManagement": {
          "maxOpenTrades": 3,
          "allowOppositeSignals": true,
          "replaceOnSameSignal": true,
          "autoCloseOnTPSL": true
        },
        "alertTypes": {
          "entry": {
            "enabled": true,
            "signals": ["BUY", "SELL"]
          },
          "exit": {
            "enabled": true,
            "signals": ["TP_HIT", "SL_HIT"]
          }
        },
        "validation": {
          "requiredFields": ["symbol", "timeframe", "strategy", "signal", "price", "tp", "sl"],
          "priceValidation": {
            "enabled": true,
            "tolerance": 0.05
          }
        },
        "status": "active",
        "statistics": {
          "totalAlerts": 1250,
          "totalTrades": 89,
          "successRate": 0.73,
          "lastAlertAt": "2024-01-15T10:25:00Z"
        }
      }
    ]
  }
}
```

#### Create Alert Configuration (Admin)
```http
POST /admin/alert-configurations
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "name": "ETH 15-Minute Signals",
  "description": "Ethereum 15-minute timeframe trading signals",
  "symbol": "ETH",
  "timeframe": "15m",
  "strategy": "ETH Momentum Strategy",
  "tradeManagement": {
    "maxOpenTrades": 2,
    "allowOppositeSignals": true,
    "replaceOnSameSignal": true,
    "autoCloseOnTPSL": true
  },
  "alertTypes": {
    "entry": {
      "enabled": true,
      "signals": ["BUY", "SELL"]
    },
    "exit": {
      "enabled": true,
      "signals": ["TP_HIT", "SL_HIT"]
    }
  },
  "validation": {
    "requiredFields": ["symbol", "timeframe", "strategy", "signal", "price", "tp", "sl"],
    "priceValidation": {
      "enabled": true,
      "tolerance": 0.03
    }
  }
}
```

### 3.4 Trade Management

#### Get User Trades
```http
GET /users/{userId}/trades?status=open&alertConfigId=config_123&page=1&limit=20
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "trades": [
      {
        "id": "trade_123",
        "tradeNumber": 15,
        "alertConfiguration": {
          "id": "config_123",
          "name": "BTC 5-Minute Premium Signals",
          "symbol": "BTC",
          "timeframe": "5m",
          "strategy": "Premium Strategy V2"
        },
        "tradeData": {
          "symbol": "BTC",
          "timeframe": "5m",
          "strategy": "Premium Strategy V2",
          "signal": "BUY",
          "entryPrice": 45000.50,
          "takeProfitPrice": 46000.00,
          "stopLossPrice": 44500.00,
          "exitPrice": null,
          "exitReason": null
        },
        "status": "open",
        "pnl": {
          "amount": null,
          "percentage": null,
          "currency": "USD"
        },
        "timestamps": {
          "openedAt": "2024-01-15T10:30:00Z",
          "closedAt": null,
          "replacedAt": null
        },
        "alerts": {
          "entryAlertId": "alert_123",
          "exitAlertId": null
        },
        "metadata": {
          "replacedBy": null,
          "replacementReason": null,
          "notes": null
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "pages": 1
    },
    "summary": {
      "openTrades": 3,
      "closedTrades": 12,
      "totalPnL": 1250.75,
      "winRate": 0.67
    }
  }
}
```

#### Get Trade Details
```http
GET /trades/{tradeId}
Authorization: Bearer {token}
```

#### Close Trade Manually (Admin)
```http
PUT /admin/trades/{tradeId}/close
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "exitPrice": 45750.00,
  "exitReason": "MANUAL",
  "notes": "Manual close due to market conditions"
}
```

### 3.5 Alert Processing

#### Get Alert History
```http
GET /alerts?symbol=BTC&timeframe=5m&signal=BUY&page=1&limit=50
Authorization: Bearer {admin_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "alert_123",
        "source": "tradingview",
        "webhook": {
          "receivedAt": "2024-01-15T10:30:00Z",
          "processedAt": "2024-01-15T10:30:02Z",
          "ipAddress": "52.89.214.238"
        },
        "alertData": {
          "symbol": "BTC",
          "timeframe": "5m",
          "strategy": "Premium Strategy V2",
          "signal": "BUY",
          "price": 45000.50,
          "takeProfitPrice": 46000.00,
          "stopLossPrice": 44500.00,
          "timestamp": "2024-01-15T10:30:00Z"
        },
        "processing": {
          "status": "processed",
          "alertConfigId": "config_123",
          "matchedUsers": [
            {
              "userId": "user_123",
              "subscriptionId": "sub_123",
              "delivered": true,
              "deliveredAt": "2024-01-15T10:30:03Z"
            }
          ],
          "tradeActions": [
            {
              "action": "OPEN_TRADE",
              "tradeId": "trade_123",
              "userId": "user_123"
            }
          ]
        },
        "statistics": {
          "processingTime": 2000,
          "deliveryCount": 1,
          "failureCount": 0
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1250,
      "pages": 25
    }
  }
}
```

### 3.6 User Alert Preferences

#### Get User Alert Preferences
```http
GET /users/{userId}/alert-preferences
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "preferences": [
      {
        "id": "pref_123",
        "alertConfiguration": {
          "id": "config_123",
          "name": "BTC 5-Minute Premium Signals",
          "symbol": "BTC",
          "timeframe": "5m",
          "strategy": "Premium Strategy V2"
        },
        "subscription": {
          "id": "sub_123",
          "planName": "Premium Trading Alerts",
          "status": "active"
        },
        "preferences": {
          "enabled": true,
          "alertTypes": {
            "entry": true,
            "exit": true,
            "replacement": true
          },
          "notifications": {
            "telegram": true,
            "email": false
          },
          "customSettings": {
            "minPrice": 40000,
            "maxPrice": 50000,
            "riskLevel": "medium"
          }
        },
        "statistics": {
          "alertsReceived": 89,
          "tradesOpened": 6,
          "lastAlertAt": "2024-01-15T10:30:00Z"
        }
      }
    ]
  }
}
```

#### Update Alert Preferences
```http
PUT /users/{userId}/alert-preferences/{preferenceId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "preferences": {
    "enabled": true,
    "alertTypes": {
      "entry": true,
      "exit": false,
      "replacement": true
    },
    "notifications": {
      "telegram": true,
      "email": true
    },
    "customSettings": {
      "minPrice": 42000,
      "maxPrice": 48000,
      "riskLevel": "high"
    }
  }
}
```

## 4. Webhook Endpoints

### 4.1 TradingView Webhook
Receives alerts from TradingView and processes them for distribution.

```http
POST /webhooks/tradingview
Content-Type: application/json
X-TradingView-Signature: sha256=calculated_signature

{
  "symbol": "BTC",
  "timeframe": "5m",
  "strategy": "Premium Strategy V2",
  "signal": "BUY",
  "price": 45000.50,
  "tp": 46000.00,
  "sl": 44500.00,
  "timestamp": "2024-01-15T10:30:00Z",
  "confidence": 0.85,
  "volume": 1250000,
  "indicators": {
    "rsi": 35.2,
    "macd": 0.15,
    "ema_20": 44950.00,
    "ema_50": 44800.00
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "alertId": "alert_123",
    "status": "received",
    "message": "Alert received and queued for processing"
  }
}
```

### 4.2 TP/SL Hit Webhook
Receives notifications when Take Profit or Stop Loss is hit.

```http
POST /webhooks/tradingview
Content-Type: application/json
X-TradingView-Signature: sha256=calculated_signature

{
  "symbol": "BTC",
  "timeframe": "5m",
  "strategy": "Premium Strategy V2",
  "signal": "TP_HIT",
  "price": 46000.00,
  "tradeNumber": 15,
  "timestamp": "2024-01-15T11:45:00Z",
  "originalEntry": {
    "signal": "BUY",
    "price": 45000.50,
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

## 5. Telegram Bot Integration

### 5.1 Bot Commands
The Telegram bot uses menu-driven UI instead of commands, but supports these internal commands:

#### User Registration
```
/start - Initialize bot and register user
/help - Show help information
/menu - Show main menu
```

### 5.2 Menu Structure
```
Main Menu:
├── 📊 My Subscriptions
│   ├── View Active Subscriptions
│   ├── Subscription History
│   └── Renew Subscription
├── ⚙️ Alert Preferences
│   ├── Configure Alerts
│   ├── Notification Settings
│   └── Trading Preferences
├── 📈 My Trades
│   ├── Open Trades
│   ├── Trade History
│   └── Performance Stats
├── 💳 Purchase Subscription
│   ├── View Plans
│   ├── Make Payment
│   └── Upload Proof
├── 👤 Profile Settings
│   ├── Update Profile
│   ├── Change Preferences
│   └── Account Status
└── 📞 Support
    ├── Contact Admin
    ├── FAQ
    └── Report Issue
```

### 5.3 Alert Message Format

#### Entry Signal
```
🚀 Trade #15 - BUY Signal

📊 Symbol: BTC
⏰ Timeframe: 5m
🎯 Strategy: Premium Strategy V2

💰 Entry Price: $45,000.50
🎯 Take Profit: $46,000.00
🛡️ Stop Loss: $44,500.00

📈 Confidence: 85%
⏱️ Time: 15 Jan 2024, 10:30 UTC

📱 Manage this trade in your dashboard
```

#### Exit Signal
```
✅ Trade #15 - Take Profit Hit!

📊 Symbol: BTC
💰 Entry: $45,000.50
🎯 Exit: $46,000.00

💵 Profit: $999.50 (+2.22%)
⏱️ Duration: 1h 15m

🎉 Congratulations on your successful trade!
```

#### Trade Replacement
```
🔄 Trade #15 Replaced

📊 Symbol: BTC
⚠️ Previous BUY trade closed
🆕 New BUY signal received

💰 New Entry: $45,200.00
🎯 Take Profit: $46,200.00
🛡️ Stop Loss: $44,700.00

📱 Check your dashboard for details
```

## 6. Admin Panel API

### 6.1 Dashboard Statistics
```http
GET /admin/dashboard/stats
Authorization: Bearer {admin_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalUsers": 1250,
      "activeSubscriptions": 890,
      "pendingApprovals": 15,
      "totalRevenue": 2650000,
      "alertsSentToday": 1450
    },
    "userStats": {
      "newUsersToday": 25,
      "newUsersThisWeek": 180,
      "newUsersThisMonth": 720,
      "activeUsersToday": 650
    },
    "subscriptionStats": {
      "pendingPayments": 15,
      "expiringThisWeek": 45,
      "renewalRate": 0.73,
      "averageSubscriptionValue": 2980
    },
    "alertStats": {
      "alertsSentToday": 1450,
      "alertsSentThisWeek": 9800,
      "averageProcessingTime": 1.2,
      "successRate": 0.998
    },
    "tradeStats": {
      "openTrades": 2340,
      "tradesClosedToday": 180,
      "averageWinRate": 0.68,
      "totalPnL": 125000
    }
  }
}
```

### 6.2 Subscription Approval Queue
```http
GET /admin/subscriptions/pending?page=1&limit=20
Authorization: Bearer {admin_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscriptions": [
      {
        "id": "sub_123",
        "user": {
          "id": "user_123",
          "email": "user@example.com",
          "profile": {
            "name": "John Doe"
          },
          "telegram": {
            "username": "john_trader"
          }
        },
        "subscriptionPlan": {
          "id": "plan_123",
          "name": "Premium Trading Alerts",
          "pricing": {
            "amount": 2999,
            "currency": "INR"
          }
        },
        "payment": {
          "transactionId": "txn_123456789",
          "amount": 2999,
          "method": "UPI",
          "proofUrl": "https://example.com/payment-proof.jpg",
          "status": "pending"
        },
        "createdAt": "2024-01-15T09:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 15,
      "pages": 1
    }
  }
}
```

### 6.3 System Configuration
```http
GET /admin/config
Authorization: Bearer {admin_token}
```

```http
PUT /admin/config
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "telegram": {
    "botToken": "encrypted_token",
    "webhookUrl": "https://api.tradingalerts.com/webhooks/telegram",
    "maxRetries": 3
  },
  "alerts": {
    "maxPerHour": 10000,
    "processingTimeout": 30000,
    "retryDelay": 5000
  },
  "trading": {
    "maxOpenTradesPerUser": 10,
    "defaultRiskLevel": "medium",
    "priceTolerancePercent": 5
  },
  "notifications": {
    "renewalReminderDays": [7, 3, 1],
    "emailEnabled": true,
    "telegramEnabled": true
  }
}
```

## 7. Rate Limiting

### 7.1 Rate Limit Headers
All responses include rate limiting information:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642248000
X-RateLimit-Window: 3600
```

### 7.2 Rate Limits by Endpoint

| Endpoint Category | Limit | Window |
|------------------|-------|--------|
| Authentication | 5 requests | 15 minutes |
| User Management | 100 requests | 1 hour |
| Subscription Management | 50 requests | 1 hour |
| Alert Processing | 1000 requests | 1 hour |
| Webhook Endpoints | 10000 requests | 1 hour |
| Admin Panel | 500 requests | 1 hour |

### 7.3 Rate Limit Exceeded Response
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "details": {
      "limit": 100,
      "window": 3600,
      "resetTime": "2024-01-15T11:30:00Z"
    }
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "req_123456789"
}
```

## 8. Error Codes

### 8.1 Authentication Errors
- `AUTH_TOKEN_MISSING` - Authorization token not provided
- `AUTH_TOKEN_INVALID` - Invalid or expired token
- `AUTH_TOKEN_EXPIRED` - Token has expired
- `AUTH_INSUFFICIENT_PERMISSIONS` - User lacks required permissions

### 8.2 Validation Errors
- `VALIDATION_ERROR` - General validation error
- `REQUIRED_FIELD_MISSING` - Required field not provided
- `INVALID_FORMAT` - Field format is invalid
- `VALUE_OUT_OF_RANGE` - Value exceeds allowed range

### 8.3 Business Logic Errors
- `USER_NOT_FOUND` - User does not exist
- `SUBSCRIPTION_NOT_FOUND` - Subscription does not exist
- `SUBSCRIPTION_EXPIRED` - Subscription has expired
- `SUBSCRIPTION_LIMIT_EXCEEDED` - User has reached subscription limit
- `TRADE_NOT_FOUND` - Trade does not exist
- `TRADE_ALREADY_CLOSED` - Trade is already closed
- `ALERT_CONFIG_NOT_FOUND` - Alert configuration does not exist
- `DUPLICATE_TRANSACTION_ID` - Transaction ID already exists

### 8.4 System Errors
- `INTERNAL_SERVER_ERROR` - Unexpected server error
- `DATABASE_ERROR` - Database operation failed
- `EXTERNAL_SERVICE_ERROR` - External service unavailable
- `WEBHOOK_SIGNATURE_INVALID` - Webhook signature verification failed

## 9. Pagination

All list endpoints support pagination with consistent parameters:

### 9.1 Query Parameters
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `sort` - Sort field (default: createdAt)
- `order` - Sort order: asc/desc (default: desc)

### 9.2 Response Format
```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

## 10. Filtering and Search

### 10.1 Common Filter Parameters
- `status` - Filter by status
- `search` - Text search in relevant fields
- `dateFrom` - Start date filter (ISO 8601)
- `dateTo` - End date filter (ISO 8601)
- `userId` - Filter by user ID
- `subscriptionId` - Filter by subscription ID

### 10.2 Example Usage
```http
GET /admin/users?status=active&search=john&dateFrom=2024-01-01&dateTo=2024-01-31&page=1&limit=20
```

## 11. Webhooks Security

### 11.1 Signature Verification
All webhook payloads are signed using HMAC-SHA256:

```javascript
// Verification example
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}
```

### 11.2 IP Whitelisting
Webhook endpoints accept requests only from whitelisted IP addresses:
- TradingView IPs: `52.89.214.238`, `34.212.75.30`, `54.218.53.128`
- Custom webhook IPs (configurable)

## 12. API Versioning

### 12.1 Version Strategy
- URL versioning: `/v1/`, `/v2/`
- Current version: `v1`
- Backward compatibility maintained for 12 months
- Deprecation notices provided 6 months in advance

### 12.2 Version Headers
```http
API-Version: v1
API-Deprecated: false
API-Sunset: 2025-01-15T00:00:00Z
```

This comprehensive API documentation provides all the necessary information for integrating with the TradingView Alert Distribution System, covering authentication, core functionality, webhooks, admin operations, and security considerations.