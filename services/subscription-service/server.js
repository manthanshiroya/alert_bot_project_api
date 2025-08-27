const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
require('express-async-errors');
require('dotenv').config();

// Import shared modules
const { DatabaseConfig } = require('../../shared/config/database');
const { EnvironmentConfig } = require('../../shared/config/environment');
const { Logger } = require('../../shared/utils/logger');
const { MiddlewareManager } = require('../../shared/middleware');

// Import service-specific modules
const subscriptionRoutes = require('./routes/subscriptions');
const planRoutes = require('./routes/plans');
const billingRoutes = require('./routes/billing');
const userRoutes = require('./routes/users');
const webhookRoutes = require('./routes/webhooks');
const reportRoutes = require('./routes/reports');
const healthRoutes = require('./routes/health');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;
const SERVICE_NAME = 'subscription-service';

// Initialize logger
const logger = new Logger(SERVICE_NAME);

// Initialize environment config
const envConfig = new EnvironmentConfig();
const config = envConfig.getConfig();

// Initialize middleware manager
const middlewareManager = new MiddlewareManager(logger, config);

/**
 * Configure Express middleware
 */
function configureMiddleware() {
  // Security middleware
  app.use(helmet({
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
  app.use(cors({
    origin: config.api.allowedOrigins || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID']
  }));

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.logHttpRequest({
        message: message.trim(),
        service: SERVICE_NAME
      })
    }
  }));

  // Apply common middleware
  middlewareManager.applyCommonMiddleware(app);

  logger.info('Middleware configured successfully', {
    service: SERVICE_NAME,
    environment: config.environment
  });
}

/**
 * Configure API routes
 */
function configureRoutes() {
  // Health check routes (no authentication required)
  app.use('/health', healthRoutes);

  // API documentation
  try {
    const swaggerDocument = YAML.load(path.join(__dirname, 'docs', 'swagger.yaml'));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Subscription Service API Documentation'
    }));
    logger.info('API documentation configured', { path: '/api-docs' });
  } catch (error) {
    logger.warn('Failed to load API documentation', { error: error.message });
  }

  // API routes with versioning
  const apiV1 = express.Router();
  
  // Apply security middleware to API routes
  middlewareManager.applySecurityMiddleware(apiV1);

  // Mount service routes
  apiV1.use('/subscriptions', subscriptionRoutes);
  apiV1.use('/plans', planRoutes);
  apiV1.use('/billing', billingRoutes);
  apiV1.use('/users', userRoutes);
  apiV1.use('/webhooks', webhookRoutes);
  apiV1.use('/reports', reportRoutes);

  // Mount API router
  app.use('/api/v1', apiV1);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      service: SERVICE_NAME,
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      environment: config.environment,
      endpoints: {
        health: '/health',
        docs: '/api-docs',
        api: '/api/v1'
      }
    });
  });

  logger.info('Routes configured successfully', {
    service: SERVICE_NAME,
    routes: ['/subscriptions', '/plans', '/billing', '/users', '/webhooks', '/reports']
  });
}

/**
 * Configure error handling
 */
function configureErrorHandling() {
  // 404 handler
  middlewareManager.handle404(app);

  // Global error handler
  middlewareManager.applyErrorHandling(app);

  logger.info('Error handling configured successfully');
}

/**
 * Initialize database connections
 */
async function initializeDatabases() {
  try {
    // Connect to MongoDB
    await DatabaseConfig.connectMongoDB();
    logger.info('MongoDB connected successfully', {
      service: SERVICE_NAME,
      database: 'MongoDB'
    });

    // Connect to Redis
    await DatabaseConfig.connectRedis();
    logger.info('Redis connected successfully', {
      service: SERVICE_NAME,
      database: 'Redis'
    });

    // Test database health
    const mongoHealth = await DatabaseConfig.checkMongoHealth();
    const redisHealth = await DatabaseConfig.checkRedisHealth();

    logger.info('Database health check completed', {
      service: SERVICE_NAME,
      mongodb: mongoHealth,
      redis: redisHealth
    });

    return { mongodb: mongoHealth, redis: redisHealth };
  } catch (error) {
    logger.error('Database initialization failed', {
      service: SERVICE_NAME,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Start the server
 */
async function startServer() {
  try {
    // Initialize databases
    await initializeDatabases();

    // Configure middleware
    configureMiddleware();

    // Configure routes
    configureRoutes();

    // Configure error handling
    configureErrorHandling();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info('Subscription Service started successfully', {
        service: SERVICE_NAME,
        port: PORT,
        environment: config.environment,
        nodeVersion: process.version,
        pid: process.pid,
        timestamp: new Date().toISOString()
      });
    });

    // Configure server timeouts
    server.timeout = config.api.timeout || 30000;
    server.keepAliveTimeout = config.api.keepAliveTimeout || 5000;
    server.headersTimeout = config.api.headersTimeout || 6000;

    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, starting graceful shutdown`, {
        service: SERVICE_NAME,
        signal
      });

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed', { service: SERVICE_NAME });

        try {
          // Close database connections
          await DatabaseConfig.disconnectMongoDB();
          logger.info('MongoDB disconnected', { service: SERVICE_NAME });

          await DatabaseConfig.disconnectRedis();
          logger.info('Redis disconnected', { service: SERVICE_NAME });

          logger.info('Graceful shutdown completed', { service: SERVICE_NAME });
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown', {
            service: SERVICE_NAME,
            error: error.message
          });
          process.exit(1);
        }
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout', { service: SERVICE_NAME });
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', {
        service: SERVICE_NAME,
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', {
        service: SERVICE_NAME,
        reason: reason?.message || reason,
        promise
      });
      process.exit(1);
    });

    return server;
  } catch (error) {
    logger.error('Failed to start Subscription Service', {
      service: SERVICE_NAME,
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };