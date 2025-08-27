const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Import shared utilities and middleware
const { Logger } = require('../../shared/utils/logger');
const { errorHandler, notFoundHandler } = require('../../shared/middleware/error');
const { requestLogger } = require('../../shared/middleware/logging');
const { validateRequest } = require('../../shared/middleware/validation');
const { connectDatabase } = require('../../shared/config/database');
const { CacheService } = require('../../shared/services/cache');
const { EventEmitter } = require('../../shared/services/events');

// Import routes
const routes = require('./routes');

// Import models to ensure they're registered
require('./models');

class SubscriptionServiceApp {
  constructor() {
    this.app = express();
    this.logger = new Logger('subscription-service');
    this.cacheService = new CacheService();
    this.eventEmitter = new EventEmitter();
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Initialize middleware
   */
  initializeMiddleware() {
    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.getAllowedOrigins(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cache-Control',
        'X-API-Key',
        'X-Request-ID'
      ]
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'production' ? 100 : 1000, // requests per window
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for health checks and internal requests
        return req.path === '/health' || req.headers['x-internal-request'] === 'true';
      }
    });
    this.app.use('/api', limiter);

    // Webhook rate limiting (more restrictive)
    const webhookLimiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 50, // requests per window
      message: {
        error: 'Too many webhook requests, please try again later.'
      }
    });
    this.app.use('/api/webhooks', webhookLimiter);

    // Body parsing middleware
    this.app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
    this.app.use('/api/webhooks/paypal', express.raw({ type: 'application/json' }));
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        // Store raw body for webhook signature verification
        if (req.originalUrl.includes('/webhooks/')) {
          req.rawBody = buf;
        }
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Data sanitization
    this.app.use(mongoSanitize());
    this.app.use(xss());
    this.app.use(hpp());

    // Compression
    this.app.use(compression());

    // Logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message) => this.logger.info(message.trim())
        }
      }));
    }
    this.app.use(requestLogger);

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.requestId = req.headers['x-request-id'] || 
        `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.requestId);
      next();
    });

    // Service identification
    this.app.use((req, res, next) => {
      res.setHeader('X-Service', 'subscription-service');
      res.setHeader('X-Version', process.env.npm_package_version || '1.0.0');
      next();
    });

    // Health check endpoint (before authentication)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'subscription-service',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // Readiness check endpoint
    this.app.get('/ready', async (req, res) => {
      try {
        // Check database connection
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
          throw new Error('Database not connected');
        }

        // Check cache service
        await this.cacheService.ping();

        res.json({
          status: 'ready',
          service: 'subscription-service',
          checks: {
            database: 'connected',
            cache: 'connected'
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(503).json({
          status: 'not ready',
          service: 'subscription-service',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  /**
   * Initialize routes
   */
  initializeRoutes() {
    // API routes
    this.app.use('/api', routes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Subscription Service',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Handles user subscriptions, billing, and plan management',
        endpoints: {
          health: '/health',
          ready: '/ready',
          api: '/api',
          docs: '/api/docs'
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Initialize error handling
   */
  initializeErrorHandling() {
    // 404 handler for API routes
    this.app.use('/api/*', notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);

    // Catch unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection at:', {
        promise,
        reason: reason.stack || reason
      });
      // Don't exit the process in production
      if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
      }
    });

    // Catch uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception:', {
        error: error.stack || error.message
      });
      // Exit gracefully
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle process termination
    process.on('SIGTERM', () => {
      this.logger.info('SIGTERM received, shutting down gracefully');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      this.logger.info('SIGINT received, shutting down gracefully');
      this.gracefulShutdown('SIGINT');
    });
  }

  /**
   * Get allowed origins for CORS
   */
  getAllowedOrigins() {
    const origins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8080'
    ];

    // Add production origins from environment
    if (process.env.ALLOWED_ORIGINS) {
      origins.push(...process.env.ALLOWED_ORIGINS.split(','));
    }

    // Add API Gateway origin
    if (process.env.API_GATEWAY_URL) {
      origins.push(process.env.API_GATEWAY_URL);
    }

    return origins;
  }

  /**
   * Initialize database connection
   */
  async initializeDatabase() {
    try {
      await connectDatabase({
        uri: process.env.MONGODB_URI,
        options: {
          dbName: process.env.MONGODB_DB_NAME || 'alert_bot_subscription'
        }
      });
      this.logger.info('Database connected successfully');
    } catch (error) {
      this.logger.error('Database connection failed:', { error: error.message });
      throw error;
    }
  }

  /**
   * Initialize cache service
   */
  async initializeCache() {
    try {
      await this.cacheService.connect({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB || 1
      });
      this.logger.info('Cache service connected successfully');
    } catch (error) {
      this.logger.error('Cache service connection failed:', { error: error.message });
      // Cache is not critical, continue without it
    }
  }

  /**
   * Initialize event emitter
   */
  initializeEvents() {
    // Set up event listeners for subscription events
    this.eventEmitter.on('subscription.created', (data) => {
      this.logger.info('Subscription created', {
        subscriptionId: data.subscription._id,
        userId: data.subscription.userId,
        planId: data.subscription.planId
      });
    });

    this.eventEmitter.on('subscription.updated', (data) => {
      this.logger.info('Subscription updated', {
        subscriptionId: data.subscription._id,
        changes: data.changes
      });
    });

    this.eventEmitter.on('subscription.canceled', (data) => {
      this.logger.info('Subscription canceled', {
        subscriptionId: data.subscription._id,
        reason: data.reason
      });
    });

    this.eventEmitter.on('payment.failed', (data) => {
      this.logger.warn('Payment failed', {
        subscriptionId: data.subscription._id,
        error: data.error
      });
    });

    this.eventEmitter.on('usage.limit.reached', (data) => {
      this.logger.warn('Usage limit reached', {
        subscriptionId: data.subscription._id,
        metric: data.metric,
        usage: data.usage,
        limit: data.limit
      });
    });

    this.logger.info('Event listeners initialized');
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Initialize services
      await this.initializeDatabase();
      await this.initializeCache();
      this.initializeEvents();

      // Start server
      const port = process.env.SUBSCRIPTION_SERVICE_PORT || 3002;
      const host = process.env.HOST || '0.0.0.0';

      this.server = this.app.listen(port, host, () => {
        this.logger.info(`Subscription Service started on ${host}:${port}`, {
          environment: process.env.NODE_ENV || 'development',
          version: process.env.npm_package_version || '1.0.0'
        });
      });

      // Set server timeout
      this.server.timeout = 30000; // 30 seconds

      return this.server;
    } catch (error) {
      this.logger.error('Failed to start Subscription Service:', { error: error.message });
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown(signal) {
    this.logger.info(`Received ${signal}, starting graceful shutdown`);

    // Stop accepting new connections
    if (this.server) {
      this.server.close(async () => {
        this.logger.info('HTTP server closed');

        try {
          // Close database connection
          const mongoose = require('mongoose');
          await mongoose.connection.close();
          this.logger.info('Database connection closed');

          // Close cache connection
          await this.cacheService.disconnect();
          this.logger.info('Cache connection closed');

          this.logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          this.logger.error('Error during graceful shutdown:', { error: error.message });
          process.exit(1);
        }
      });

      // Force close after timeout
      setTimeout(() => {
        this.logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    } else {
      process.exit(0);
    }
  }

  /**
   * Get Express app instance
   */
  getApp() {
    return this.app;
  }
}

// Create and export app instance
const subscriptionServiceApp = new SubscriptionServiceApp();

// Start server if this file is run directly
if (require.main === module) {
  subscriptionServiceApp.start().catch((error) => {
    console.error('Failed to start Subscription Service:', error);
    process.exit(1);
  });
}

module.exports = subscriptionServiceApp;