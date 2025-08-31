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
        },
        Payment: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Payment ID'
            },
            userId: {
              type: 'string',
              description: 'User ID who made the payment'
            },
            amount: {
              type: 'number',
              description: 'Payment amount'
            },
            currency: {
              type: 'string',
              description: 'Payment currency',
              example: 'INR'
            },
            status: {
              type: 'string',
              enum: ['pending', 'approved', 'rejected', 'expired'],
              description: 'Payment status'
            },
            paymentMethod: {
              type: 'string',
              description: 'Payment method used'
            },
            transactionId: {
              type: 'string',
              description: 'Transaction ID from payment gateway'
            },
            upiQrCode: {
              type: 'string',
              description: 'UPI QR code for payment'
            },
            proofUrl: {
              type: 'string',
              description: 'URL of payment proof image'
            },
            notes: {
              type: 'string',
              description: 'Admin notes'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Payment creation date'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Payment last update date'
            }
          }
        },
        PaymentRequest: {
          type: 'object',
          required: ['amount', 'subscriptionPlan'],
          properties: {
            amount: {
              type: 'number',
              minimum: 1,
              description: 'Payment amount'
            },
            subscriptionPlan: {
              type: 'string',
              enum: ['premium', 'pro'],
              description: 'Subscription plan to purchase'
            },
            paymentMethod: {
              type: 'string',
              description: 'Preferred payment method'
            }
          }
        },
        PaymentStats: {
          type: 'object',
          properties: {
            totalPayments: {
              type: 'integer',
              description: 'Total number of payments'
            },
            totalAmount: {
              type: 'number',
              description: 'Total payment amount'
            },
            pendingPayments: {
              type: 'integer',
              description: 'Number of pending payments'
            },
            approvedPayments: {
              type: 'integer',
              description: 'Number of approved payments'
            },
            rejectedPayments: {
              type: 'integer',
              description: 'Number of rejected payments'
            },
            revenueByPlan: {
              type: 'object',
              properties: {
                premium: {
                  type: 'number',
                  description: 'Revenue from premium plans'
                },
                pro: {
                  type: 'number',
                  description: 'Revenue from pro plans'
                }
              }
            }
          }
        },
        TelegramUser: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Telegram user ID'
            },
            userId: {
              type: 'string',
              description: 'Associated app user ID'
            },
            username: {
              type: 'string',
              description: 'Telegram username'
            },
            firstName: {
              type: 'string',
              description: 'Telegram first name'
            },
            lastName: {
              type: 'string',
              description: 'Telegram last name'
            },
            isBlocked: {
              type: 'boolean',
              description: 'Whether user is blocked'
            },
            lastActivity: {
              type: 'string',
              format: 'date-time',
              description: 'Last activity timestamp'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation date'
            }
          }
        },
        BotStats: {
          type: 'object',
          properties: {
            totalUsers: {
              type: 'integer',
              description: 'Total number of Telegram users'
            },
            activeUsers: {
              type: 'integer',
              description: 'Number of active users'
            },
            blockedUsers: {
              type: 'integer',
              description: 'Number of blocked users'
            },
            messagesSent: {
              type: 'integer',
              description: 'Total messages sent by bot'
            },
            messagesReceived: {
              type: 'integer',
              description: 'Total messages received by bot'
            }
          }
        },
        BroadcastMessage: {
          type: 'object',
          required: ['message'],
          properties: {
            message: {
              type: 'string',
              description: 'Message to broadcast'
            },
            targetUsers: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Specific user IDs to target (optional)'
            }
          }
        },
        LinkAccountRequest: {
          type: 'object',
          required: ['telegramUserId', 'userId'],
          properties: {
            telegramUserId: {
              type: 'string',
              description: 'Telegram user ID'
            },
            userId: {
              type: 'string',
              description: 'App user ID'
            }
          }
        },
        UserProfile: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            telegramUserId: {
              type: 'string',
              description: 'Telegram user ID'
            },
            subscription: {
              $ref: '#/components/schemas/UserSubscription'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation date'
            }
          }
        },
        UserSubscription: {
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
            },
            features: {
              type: 'object',
              properties: {
                maxAlerts: {
                  type: 'integer',
                  description: 'Maximum number of alerts allowed'
                },
                telegramNotifications: {
                  type: 'boolean',
                  description: 'Telegram notifications enabled'
                },
                prioritySupport: {
                  type: 'boolean',
                  description: 'Priority support access'
                }
              }
            }
          }
        },
        UserStats: {
          type: 'object',
          properties: {
            totalAlerts: {
              type: 'integer',
              description: 'Total alerts created'
            },
            activeAlerts: {
              type: 'integer',
              description: 'Currently active alerts'
            },
            triggeredAlerts: {
              type: 'integer',
              description: 'Total triggered alerts'
            },
            accountAge: {
              type: 'integer',
              description: 'Account age in days'
            }
          }
        },
        PasswordChangeRequest: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: {
              type: 'string',
              description: 'Current password'
            },
            newPassword: {
              type: 'string',
              minLength: 6,
              description: 'New password (min 6 characters)'
            }
          }
        },
        AccountDeletionRequest: {
          type: 'object',
          required: ['password', 'confirmation'],
          properties: {
            password: {
              type: 'string',
              description: 'Current password for confirmation'
            },
            confirmation: {
              type: 'string',
              enum: ['DELETE_MY_ACCOUNT'],
              description: 'Confirmation text'
            }
          }
        }
      },
      responses: {
        BadRequest: {
          description: 'Bad request',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        Unauthorized: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        Forbidden: {
          description: 'Forbidden',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
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