const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TradingView Alert Bot API',
      version: '1.0.0',
      description: 'A comprehensive API for managing TradingView alerts and Telegram bot integration',
      contact: {
        name: 'API Support',
        email: 'support@alertbot.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: 'Development server'
      },
      {
        url: 'https://api.alertbot.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for webhook authentication'
        }
      },
      schemas: {
        User: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            id: {
              type: 'string',
              description: 'User ID'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            password: {
              type: 'string',
              minLength: 6,
              description: 'User password (min 6 characters)'
            },
            telegramUserId: {
              type: 'string',
              description: 'Telegram user ID for direct bot messaging',
              example: '123456789'
            },
            subscription: {
              type: 'object',
              properties: {
                plan: {
                  type: 'string',
                  enum: ['free', 'premium', 'pro'],
                  description: 'Subscription plan'
                },
                status: {
                  type: 'string',
                  enum: ['active', 'inactive', 'expired'],
                  description: 'Subscription status'
                },
                expiresAt: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Subscription expiration date'
                }
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation date'
            }
          }
        },
        Alert: {
          type: 'object',
          required: ['symbol', 'action', 'price'],
          properties: {
            id: {
              type: 'string',
              description: 'Alert ID'
            },
            symbol: {
              type: 'string',
              description: 'Trading symbol (e.g., BTCUSDT)'
            },
            action: {
              type: 'string',
              enum: ['buy', 'sell'],
              description: 'Trading action'
            },
            price: {
              type: 'number',
              description: 'Alert price'
            },
            quantity: {
              type: 'number',
              description: 'Trading quantity'
            },
            tradeNumber: {
              type: 'integer',
              description: 'Sequential trade number'
            },
            userId: {
              type: 'string',
              description: 'User ID who owns this alert'
            },
            status: {
              type: 'string',
              enum: ['pending', 'processed', 'failed'],
              description: 'Alert processing status'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Alert creation date'
            }
          }
        },
        WebhookPayload: {
          type: 'object',
          required: ['symbol', 'action', 'price'],
          properties: {
            symbol: {
              type: 'string',
              example: 'BTCUSDT',
              description: 'Trading symbol'
            },
            action: {
              type: 'string',
              enum: ['buy', 'sell'],
              example: 'buy',
              description: 'Trading action'
            },
            price: {
              type: 'number',
              example: 45000.50,
              description: 'Current price'
            },
            quantity: {
              type: 'number',
              example: 0.001,
              description: 'Trading quantity'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Alert timestamp'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            code: {
              type: 'string',
              description: 'Error code'
            },
            details: {
              type: 'object',
              description: 'Additional error details'
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              description: 'Success message'
            },
            data: {
              type: 'object',
              description: 'Response data'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './src/routes/*.js',
    './src/server.js'
  ]
};

const specs = swaggerJsdoc(options);

module.exports = {
  swaggerUi,
  specs
};