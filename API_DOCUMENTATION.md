# Alert Bot Project - API Documentation

## Overview

This document provides comprehensive API documentation for the Alert Bot microservices architecture. The system follows RESTful API principles with OpenAPI 3.0 specification.

## API Gateway Configuration

### Base URLs
```yaml
production: https://api.alertbot.com
development: http://localhost:3000
staging: https://staging-api.alertbot.com
```

### Global Headers
```yaml
Content-Type: application/json
Authorization: Bearer {jwt_token}
X-API-Key: {api_key} # For webhook endpoints
X-Request-ID: {uuid} # For request tracing
```

## Authentication

### JWT Token Structure
```json
{
  "user_id": "507f1f77bcf86cd799439011",
  "telegram_id": "123456789",
  "role": "user",
  "permissions": ["read:subscriptions", "write:preferences"],
  "iat": 1640995200,
  "exp": 1641081600
}
```

### API Key Authentication
```yaml
header: X-API-Key
format: "ak_" + base64(32_random_bytes)
example: ak_dGVzdF9hcGlfa2V5XzEyMzQ1Njc4OTA
```

## Subscription Service API

### OpenAPI Specification

```yaml
openapi: 3.0.3
info:
  title: Alert Bot Subscription Service API
  description: Core business logic API for user and subscription management
  version: 1.0.0
  contact:
    name: Alert Bot Support
    email: support@alertbot.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: https://api.alertbot.com/api/v1
    description: Production server
  - url: http://localhost:3001/api/v1
    description: Development server

security:
  - BearerAuth: []
  - ApiKeyAuth: []

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key

  schemas:
    User:
      type: object
      required:
        - telegram_id
        - first_name
      properties:
        _id:
          type: string
          format: objectid
          example: "507f1f77bcf86cd799439011"
        telegram_id:
          type: string
          example: "123456789"
          description: Unique Telegram user ID
        username:
          type: string
          example: "john_doe"
          nullable: true
        first_name:
          type: string
          example: "John"
        last_name:
          type: string
          example: "Doe"
          nullable: true
        subscriptions:
          type: array
          items:
            $ref: '#/components/schemas/UserSubscription'
        status:
          type: string
          enum: [active, inactive, banned]
          default: active
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time

    UserSubscription:
      type: object
      properties:
        subscription_id:
          type: string
          format: objectid
        plan_id:
          type: string
          format: objectid
        status:
          type: string
          enum: [pending, active, expired, cancelled]
        start_date:
          type: string
          format: date-time
        end_date:
          type: string
          format: date-time
        payment_proof:
          type: string
          format: uri
          description: URL to payment proof image
        preferences:
          $ref: '#/components/schemas/UserPreferences'

    UserPreferences:
      type: object
      properties:
        symbols:
          type: array
          items:
            type: string
          example: ["BTC", "ETH", "AAPL"]
        timeframes:
          type: array
          items:
            type: string
            enum: ["1min", "5min", "15min", "30min", "1h", "4h", "1d"]
          example: ["5min", "1h"]
        alert_types:
          type: array
          items:
            type: string
          example: ["buy_signal", "sell_signal", "price_alert"]

    SubscriptionPlan:
      type: object
      required:
        - name
        - price
        - duration_days
      properties:
        _id:
          type: string
          format: objectid
        name:
          type: string
          example: "Premium Plan"
        description:
          type: string
          example: "Access to premium charts and alerts"
        features:
          type: array
          items:
            $ref: '#/components/schemas/PlanFeature'
        charts:
          type: array
          items:
            type: string
            format: objectid
          description: Array of chart IDs included in this plan
        symbols:
          type: array
          items:
            type: string
          example: ["BTC", "ETH", "AAPL"]
        timeframes:
          type: array
          items:
            type: string
          example: ["5min", "1h", "1d"]
        price:
          $ref: '#/components/schemas/Price'
        duration_days:
          type: integer
          example: 30
        max_alerts_per_hour:
          type: integer
          default: 50
        status:
          type: string
          enum: [active, inactive]
          default: active
        created_at:
          type: string
          format: date-time

    PlanFeature:
      type: object
      properties:
        name:
          type: string
          example: "Real-time alerts"
        description:
          type: string
          example: "Receive alerts within 5 seconds"
        enabled:
          type: boolean
          default: true

    Price:
      type: object
      required:
        - amount
        - currency
      properties:
        amount:
          type: number
          format: float
          example: 29.99
        currency:
          type: string
          example: "USD"
          enum: ["USD", "EUR", "GBP"]

    Chart:
      type: object
      required:
        - name
        - symbol
        - timeframe
      properties:
        _id:
          type: string
          format: objectid
        name:
          type: string
          example: "BTC 5-Minute Premium"
        symbol:
          type: string
          example: "BTC"
        timeframe:
          type: string
          example: "5min"
        tradingview_chart_id:
          type: string
          example: "tv_chart_123"
        subscription_plans:
          type: array
          items:
            type: string
            format: objectid
        conditions:
          type: array
          items:
            $ref: '#/components/schemas/AlertCondition'
        status:
          type: string
          enum: [active, inactive]
          default: active
        created_at:
          type: string
          format: date-time

    AlertCondition:
      type: object
      properties:
        condition_id:
          type: string
          example: "btc_premium_5min"
        name:
          type: string
          example: "BTC Premium 5-Minute Alerts"
        rules:
          type: object
          description: Dynamic rule configuration
        actions:
          type: array
          items:
            type: object
        priority:
          type: string
          enum: [low, medium, high]
          default: medium
        enabled:
          type: boolean
          default: true

    SubscriptionRequest:
      type: object
      required:
        - plan_id
        - payment_proof
      properties:
        _id:
          type: string
          format: objectid
        user_id:
          type: string
          format: objectid
        plan_id:
          type: string
          format: objectid
        payment_proof:
          type: string
          format: uri
        preferences:
          $ref: '#/components/schemas/UserPreferences'
        status:
          type: string
          enum: [pending, approved, rejected]
          default: pending
        admin_notes:
          type: string
          nullable: true
        created_at:
          type: string
          format: date-time
        processed_at:
          type: string
          format: date-time
          nullable: true

    WebhookPayload:
      type: object
      required:
        - symbol
        - timeframe
        - signal
        - timestamp
      properties:
        symbol:
          type: string
          example: "BTC"
        timeframe:
          type: string
          example: "5min"
        price:
          type: number
          format: float
          example: 45000.50
        signal:
          type: string
          enum: [buy, sell, hold]
        timestamp:
          type: string
          format: date-time
        chart_id:
          type: string
          format: objectid
          nullable: true
        metadata:
          type: object
          additionalProperties: true

    Error:
      type: object
      properties:
        error:
          type: string
          example: "Validation failed"
        message:
          type: string
          example: "The provided data is invalid"
        code:
          type: string
          example: "VALIDATION_ERROR"
        details:
          type: array
          items:
            type: object
            properties:
              field:
                type: string
              message:
                type: string
        timestamp:
          type: string
          format: date-time
        request_id:
          type: string
          format: uuid

    Success:
      type: object
      properties:
        success:
          type: boolean
          example: true
        message:
          type: string
          example: "Operation completed successfully"
        data:
          type: object
        timestamp:
          type: string
          format: date-time
        request_id:
          type: string
          format: uuid

paths:
  # User Management Endpoints
  /users:
    post:
      tags:
        - Users
      summary: Register a new user
      description: Create a new user account with Telegram ID
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - telegram_id
                - first_name
              properties:
                telegram_id:
                  type: string
                  example: "123456789"
                username:
                  type: string
                  example: "john_doe"
                first_name:
                  type: string
                  example: "John"
                last_name:
                  type: string
                  example: "Doe"
      responses:
        '201':
          description: User created successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/User'
        '400':
          description: Invalid input data
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: User already exists
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /users/{id}:
    get:
      tags:
        - Users
      summary: Get user details
      description: Retrieve user information by ID
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: objectid
      responses:
        '200':
          description: User details retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/User'
        '404':
          description: User not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

    put:
      tags:
        - Users
      summary: Update user details
      description: Update user information
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: objectid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                username:
                  type: string
                first_name:
                  type: string
                last_name:
                  type: string
                status:
                  type: string
                  enum: [active, inactive, banned]
      responses:
        '200':
          description: User updated successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/User'
        '400':
          description: Invalid input data
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '404':
          description: User not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

    delete:
      tags:
        - Users
      summary: Delete user
      description: Delete user account (Admin only)
      security:
        - BearerAuth: [admin]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: objectid
      responses:
        '200':
          description: User deleted successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Success'
        '403':
          description: Insufficient permissions
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '404':
          description: User not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /users/{id}/subscriptions:
    get:
      tags:
        - Users
      summary: Get user subscriptions
      description: Retrieve all subscriptions for a user
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: objectid
        - name: status
          in: query
          schema:
            type: string
            enum: [pending, active, expired, cancelled]
          description: Filter by subscription status
      responses:
        '200':
          description: User subscriptions retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        type: array
                        items:
                          $ref: '#/components/schemas/UserSubscription'

  # Subscription Plan Management
  /subscriptions:
    get:
      tags:
        - Subscription Plans
      summary: List subscription plans
      description: Get all available subscription plans
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [active, inactive]
          description: Filter by plan status
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
        - name: offset
          in: query
          schema:
            type: integer
            minimum: 0
            default: 0
      responses:
        '200':
          description: Subscription plans retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          plans:
                            type: array
                            items:
                              $ref: '#/components/schemas/SubscriptionPlan'
                          total:
                            type: integer
                          limit:
                            type: integer
                          offset:
                            type: integer

    post:
      tags:
        - Subscription Plans
      summary: Create subscription plan
      description: Create a new subscription plan (Admin only)
      security:
        - BearerAuth: [admin]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - name
                - price
                - duration_days
              properties:
                name:
                  type: string
                description:
                  type: string
                features:
                  type: array
                  items:
                    $ref: '#/components/schemas/PlanFeature'
                charts:
                  type: array
                  items:
                    type: string
                    format: objectid
                symbols:
                  type: array
                  items:
                    type: string
                timeframes:
                  type: array
                  items:
                    type: string
                price:
                  $ref: '#/components/schemas/Price'
                duration_days:
                  type: integer
                max_alerts_per_hour:
                  type: integer
      responses:
        '201':
          description: Subscription plan created successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/SubscriptionPlan'

  /subscriptions/{id}:
    get:
      tags:
        - Subscription Plans
      summary: Get subscription plan details
      description: Retrieve detailed information about a subscription plan
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: objectid
      responses:
        '200':
          description: Subscription plan details retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/SubscriptionPlan'

    put:
      tags:
        - Subscription Plans
      summary: Update subscription plan
      description: Update subscription plan details (Admin only)
      security:
        - BearerAuth: [admin]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: objectid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                description:
                  type: string
                features:
                  type: array
                  items:
                    $ref: '#/components/schemas/PlanFeature'
                price:
                  $ref: '#/components/schemas/Price'
                status:
                  type: string
                  enum: [active, inactive]
      responses:
        '200':
          description: Subscription plan updated successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/SubscriptionPlan'

  # Subscription Requests
  /subscription-requests:
    get:
      tags:
        - Subscription Requests
      summary: List subscription requests
      description: Get all subscription requests (Admin only)
      security:
        - BearerAuth: [admin]
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [pending, approved, rejected]
        - name: user_id
          in: query
          schema:
            type: string
            format: objectid
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
        - name: offset
          in: query
          schema:
            type: integer
            minimum: 0
            default: 0
      responses:
        '200':
          description: Subscription requests retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          requests:
                            type: array
                            items:
                              $ref: '#/components/schemas/SubscriptionRequest'
                          total:
                            type: integer

    post:
      tags:
        - Subscription Requests
      summary: Submit subscription request
      description: Submit a new subscription request
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - plan_id
                - payment_proof
              properties:
                plan_id:
                  type: string
                  format: objectid
                payment_proof:
                  type: string
                  format: uri
                preferences:
                  $ref: '#/components/schemas/UserPreferences'
      responses:
        '201':
          description: Subscription request submitted successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/SubscriptionRequest'

  /subscription-requests/{id}/approve:
    put:
      tags:
        - Subscription Requests
      summary: Approve subscription request
      description: Approve a pending subscription request (Admin only)
      security:
        - BearerAuth: [admin]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: objectid
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                admin_notes:
                  type: string
                  description: Optional notes from admin
      responses:
        '200':
          description: Subscription request approved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/SubscriptionRequest'

  /subscription-requests/{id}/reject:
    put:
      tags:
        - Subscription Requests
      summary: Reject subscription request
      description: Reject a pending subscription request (Admin only)
      security:
        - BearerAuth: [admin]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: objectid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - reason
              properties:
                reason:
                  type: string
                  description: Reason for rejection
                admin_notes:
                  type: string
      responses:
        '200':
          description: Subscription request rejected successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/SubscriptionRequest'

  # Chart Management
  /charts:
    get:
      tags:
        - Charts
      summary: List charts
      description: Get all available charts
      parameters:
        - name: symbol
          in: query
          schema:
            type: string
        - name: timeframe
          in: query
          schema:
            type: string
        - name: status
          in: query
          schema:
            type: string
            enum: [active, inactive]
      responses:
        '200':
          description: Charts retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        type: array
                        items:
                          $ref: '#/components/schemas/Chart'

    post:
      tags:
        - Charts
      summary: Create chart
      description: Create a new chart configuration (Admin only)
      security:
        - BearerAuth: [admin]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - name
                - symbol
                - timeframe
              properties:
                name:
                  type: string
                symbol:
                  type: string
                timeframe:
                  type: string
                tradingview_chart_id:
                  type: string
                subscription_plans:
                  type: array
                  items:
                    type: string
                    format: objectid
                conditions:
                  type: array
                  items:
                    $ref: '#/components/schemas/AlertCondition'
      responses:
        '201':
          description: Chart created successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/Chart'

  # Webhook Endpoints
  /webhooks/tradingview:
    post:
      tags:
        - Webhooks
      summary: Receive TradingView webhook
      description: Endpoint for receiving alerts from TradingView
      security:
        - ApiKeyAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/WebhookPayload'
      responses:
        '200':
          description: Webhook processed successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          processed_alerts:
                            type: integer
                          matched_users:
                            type: integer
                          queued_messages:
                            type: integer
        '400':
          description: Invalid webhook payload
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '401':
          description: Invalid API key
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /webhooks/status:
    get:
      tags:
        - Webhooks
      summary: Webhook health check
      description: Check webhook endpoint health
      responses:
        '200':
          description: Webhook is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: "healthy"
                  timestamp:
                    type: string
                    format: date-time
                  version:
                    type: string
                    example: "1.0.0"

  # Admin Endpoints
  /admin/dashboard:
    get:
      tags:
        - Admin
      summary: Get dashboard data
      description: Retrieve admin dashboard statistics
      security:
        - BearerAuth: [admin]
      responses:
        '200':
          description: Dashboard data retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          total_users:
                            type: integer
                          active_subscriptions:
                            type: integer
                          pending_requests:
                            type: integer
                          alerts_sent_today:
                            type: integer
                          revenue_this_month:
                            type: number
                          top_symbols:
                            type: array
                            items:
                              type: object
                              properties:
                                symbol:
                                  type: string
                                count:
                                  type: integer

  /admin/dropdown-options:
    get:
      tags:
        - Admin
      summary: Get dropdown options
      description: Retrieve all dropdown options for admin interface
      security:
        - BearerAuth: [admin]
      responses:
        '200':
          description: Dropdown options retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/Success'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          symbols:
                            type: array
                            items:
                              type: string
                          timeframes:
                            type: array
                            items:
                              type: string
                          alert_types:
                            type: array
                            items:
                              type: string
                          subscription_statuses:
                            type: array
                            items:
                              type: string
                          user_statuses:
                            type: array
                            items:
                              type: string
```

## Telegram Service API

### OpenAPI Specification

```yaml
openapi: 3.0.3
info:
  title: Alert Bot Telegram Service API
  description: Telegram bot operations and message delivery service
  version: 1.0.0

servers:
  - url: https://api.alertbot.com/api/v1/telegram
    description: Production server
  - url: http://localhost:3002/api/v1
    description: Development server

security:
  - BearerAuth: []
  - ApiKeyAuth: []

components:
  schemas:
    TelegramMessage:
      type: object
      required:
        - telegram_id
        - text
      properties:
        telegram_id:
          type: string
          example: "123456789"
        text:
          type: string
          example: "🚀 BTC Alert: Buy signal detected at $45,000"
        parse_mode:
          type: string
          enum: [HTML, Markdown, MarkdownV2]
          default: HTML
        reply_markup:
          type: object
          description: Telegram inline keyboard markup
        disable_notification:
          type: boolean
          default: false

    AlertMessage:
      type: object
      required:
        - user_id
        - symbol
        - signal
        - price
      properties:
        user_id:
          type: string
          format: objectid
        telegram_id:
          type: string
        symbol:
          type: string
          example: "BTC"
        timeframe:
          type: string
          example: "5min"
        signal:
          type: string
          enum: [buy, sell, hold]
        price:
          type: number
          format: float
          example: 45000.50
        timestamp:
          type: string
          format: date-time
        priority:
          type: string
          enum: [low, medium, high]
          default: medium
        template:
          type: string
          example: "premium_alert"
          description: Message template to use

    BroadcastMessage:
      type: object
      required:
        - message
        - target_criteria
      properties:
        message:
          type: string
          example: "📢 System maintenance scheduled for tonight at 2 AM UTC"
        target_criteria:
          type: object
          properties:
            subscription_status:
              type: array
              items:
                type: string
                enum: [active, expired]
            user_status:
              type: array
              items:
                type: string
                enum: [active, inactive]
            subscription_plans:
              type: array
              items:
                type: string
                format: objectid
        parse_mode:
          type: string
          enum: [HTML, Markdown, MarkdownV2]
          default: HTML
        schedule_time:
          type: string
          format: date-time
          description: Optional scheduled delivery time

    BotInfo:
      type: object
      properties:
        id:
          type: integer
          example: 123456789
        is_bot:
          type: boolean
          example: true
        first_name:
          type: string
          example: "Alert Bot"
        username:
          type: string
          example: "alertbot"
        can_join_groups:
          type: boolean
        can_read_all_group_messages:
          type: boolean
        supports_inline_queries:
          type: boolean

    UserSession:
      type: object
      properties:
        telegram_id:
          type: string
        user_id:
          type: string
          format: objectid
        current_menu:
          type: string
          example: "main_menu"
        temp_data:
          type: object
          description: Temporary session data
        last_activity:
          type: string
          format: date-time
        expires_at:
          type: string
          format: date-time

paths:
  /send-message:
    post:
      tags:
        - Messages
      summary: Send message to user
      description: Send a custom message to a specific Telegram user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TelegramMessage'
      responses:
        '200':
          description: Message sent successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                    example: true
                  message_id:
                    type: integer
                    example: 123
                  delivery_time:
                    type: string
                    format: date-time
        '400':
          description: Invalid message data
        '404':
          description: User not found
        '429':
          description: Rate limit exceeded

  /send-alert:
    post:
      tags:
        - Messages
      summary: Send alert message
      description: Send a formatted alert message to user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/AlertMessage'
      responses:
        '200':
          description: Alert sent successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  message_id:
                    type: integer
                  formatted_message:
                    type: string
                  delivery_time:
                    type: string
                    format: date-time

  /broadcast:
    post:
      tags:
        - Messages
      summary: Broadcast message
      description: Send message to multiple users based on criteria (Admin only)
      security:
        - BearerAuth: [admin]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/BroadcastMessage'
      responses:
        '200':
          description: Broadcast initiated successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  broadcast_id:
                    type: string
                  target_count:
                    type: integer
                  estimated_delivery_time:
                    type: string

  /bot-info:
    get:
      tags:
        - Bot Management
      summary: Get bot information
      description: Retrieve Telegram bot information
      responses:
        '200':
          description: Bot information retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      success:
                        type: boolean
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/BotInfo'

  /webhook-info:
    get:
      tags:
        - Bot Management
      summary: Get webhook information
      description: Get current webhook configuration
      responses:
        '200':
          description: Webhook information retrieved successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    type: object
                    properties:
                      url:
                        type: string
                        format: uri
                      has_custom_certificate:
                        type: boolean
                      pending_update_count:
                        type: integer
                      last_error_date:
                        type: integer
                      last_error_message:
                        type: string
                      max_connections:
                        type: integer
                      allowed_updates:
                        type: array
                        items:
                          type: string

  /set-webhook:
    post:
      tags:
        - Bot Management
      summary: Set webhook URL
      description: Configure Telegram webhook URL (Admin only)
      security:
        - BearerAuth: [admin]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - url
              properties:
                url:
                  type: string
                  format: uri
                  example: "https://api.alertbot.com/api/v1/telegram/webhook"
                max_connections:
                  type: integer
                  minimum: 1
                  maximum: 100
                  default: 40
                allowed_updates:
                  type: array
                  items:
                    type: string
                  example: ["message", "callback_query"]
      responses:
        '200':
          description: Webhook set successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  message:
                    type: string

  /webhook:
    post:
      tags:
        - Bot Management
      summary: Telegram webhook endpoint
      description: Endpoint for receiving updates from Telegram
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              description: Telegram Update object
      responses:
        '200':
          description: Update processed successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
                    example: true

  /user/{id}/session:
    get:
      tags:
        - User Sessions
      summary: Get user session
      description: Retrieve current session data for a user
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            description: Telegram user ID
      responses:
        '200':
          description: Session data retrieved successfully
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      success:
                        type: boolean
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/UserSession'
        '404':
          description: Session not found
```

## Error Handling

### Standard Error Response Format

```json
{
  "error": "VALIDATION_ERROR",
  "message": "The provided data is invalid",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "telegram_id",
      "message": "Telegram ID is required"
    },
    {
      "field": "first_name",
      "message": "First name must be at least 1 character long"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req_123e4567-e89b-12d3-a456-426614174000"
}
```

### Error Codes

```javascript
const errorCodes = {
  // Authentication & Authorization
  'UNAUTHORIZED': 401,
  'FORBIDDEN': 403,
  'INVALID_TOKEN': 401,
  'TOKEN_EXPIRED': 401,
  'INVALID_API_KEY': 401,
  
  // Validation
  'VALIDATION_ERROR': 400,
  'INVALID_INPUT': 400,
  'MISSING_REQUIRED_FIELD': 400,
  'INVALID_FORMAT': 400,
  
  // Resource Management
  'RESOURCE_NOT_FOUND': 404,
  'RESOURCE_ALREADY_EXISTS': 409,
  'RESOURCE_CONFLICT': 409,
  
  // Business Logic
  'SUBSCRIPTION_EXPIRED': 402,
  'SUBSCRIPTION_NOT_FOUND': 404,
  'PAYMENT_REQUIRED': 402,
  'INSUFFICIENT_PERMISSIONS': 403,
  
  // Rate Limiting
  'RATE_LIMIT_EXCEEDED': 429,
  'QUOTA_EXCEEDED': 429,
  
  // External Services
  'TELEGRAM_API_ERROR': 502,
  'DATABASE_ERROR': 500,
  'EXTERNAL_SERVICE_ERROR': 502,
  
  // System
  'INTERNAL_SERVER_ERROR': 500,
  'SERVICE_UNAVAILABLE': 503,
  'MAINTENANCE_MODE': 503
};
```

## Rate Limiting

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
X-RateLimit-Window: 900
```

### Rate Limit Configuration

```javascript
const rateLimitConfig = {
  // General API endpoints
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // requests per window
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later'
    }
  },
  
  // Authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts'
    }
  },
  
  // Webhook endpoints
  webhook: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 1000,
    skipSuccessfulRequests: true
  },
  
  // User-specific limits
  user: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // alerts per user per hour
    keyGenerator: (req) => req.user?.user_id || req.ip
  }
};
```

## API Testing

### Postman Collection Structure

```json
{
  "info": {
    "name": "Alert Bot API",
    "description": "Complete API collection for Alert Bot services",
    "version": "1.0.0"
  },
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{jwt_token}}",
        "type": "string"
      }
    ]
  },
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:3000/api/v1"
    },
    {
      "key": "jwt_token",
      "value": ""
    },
    {
      "key": "api_key",
      "value": ""
    }
  ],
  "item": [
    {
      "name": "Authentication",
      "item": [
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "header": [],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"telegram_id\": \"123456789\",\n  \"first_name\": \"John\"\n}",
              "options": {
                "raw": {
                  "language": "json"
                }
              }
            },
            "url": {
              "raw": "{{base_url}}/auth/login",
              "host": ["{{base_url}}"],
              "path": ["auth", "login"]
            }
          }
        }
      ]
    }
  ]
}
```

### Test Scenarios

```javascript
// Example test scenarios for API endpoints
const testScenarios = {
  userRegistration: {
    validData: {
      telegram_id: "123456789",
      username: "john_doe",
      first_name: "John",
      last_name: "Doe"
    },
    invalidData: [
      {
        description: "Missing telegram_id",
        data: { first_name: "John" },
        expectedError: "VALIDATION_ERROR"
      },
      {
        description: "Invalid telegram_id format",
        data: { telegram_id: "invalid", first_name: "John" },
        expectedError: "VALIDATION_ERROR"
      }
    ]
  },
  
  subscriptionRequest: {
    validData: {
      plan_id: "507f1f77bcf86cd799439011",
      payment_proof: "https://example.com/payment.jpg",
      preferences: {
        symbols: ["BTC", "ETH"],
        timeframes: ["5min", "1h"],
        alert_types: ["buy_signal", "sell_signal"]
      }
    },
    invalidData: [
      {
        description: "Invalid plan_id format",
        data: { plan_id: "invalid", payment_proof: "https://example.com/payment.jpg" },
        expectedError: "VALIDATION_ERROR"
      }
    ]
  }
};
```

This comprehensive API documentation provides a complete reference for all endpoints, request/response formats, authentication methods, error handling, and testing guidelines for the Alert Bot microservices architecture.