require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const { v4: uuidv4 } = require('uuid');

// Import utilities and services
const { logger } = require('./utils');
const { connectDB, connectRedis } = require('./config/database');
const { AlertEngine } = require('./services');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3004;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Global variables
let alertEngine;
let server;

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
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // CORS configuration
  const corsOptions = {
    origin: function (origin, callback) {
      const allowedOrigins = [
        process.env.FRONTEND_URL,
        process.env.API_GATEWAY_URL,
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003'
      ].filter(Boolean);

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID']
  };

  app.use(cors(corsOptions));
  app.use(compression());
  app.use(mongoSanitize());
  app.use(hpp());

  // Request parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request ID middleware
  app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-ID', req.id);
    next();
  });

  // Logging middleware
  if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined', {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    }));
  }

  // Custom request logging
  app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP Request', {
        requestId: req.id,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    });
    
    next();
  });

  // Rate limiting
  app.use('/api/', rateLimiter.general);
}

/**
 * Configure routes
 */
function configureRoutes() {
  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'alert-engine',
        version: process.env.npm_package_version || '1.0.0',
        environment: NODE_ENV,
        uptime: Math.floor(process.uptime()),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024)
        },
        cpu: {
          usage: process.cpuUsage()
        }
      };

      // Check database connection
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        health.database = { status: 'connected' };
      } else {
        health.database = { status: 'disconnected' };
        health.status = 'unhealthy';
      }

      // Check Redis connection
      try {
        const redis = require('./config/database').getRedisClient();
        if (redis && redis.status === 'ready') {
          health.redis = { status: 'connected' };
        } else {
          health.redis = { status: 'disconnected' };
        }
      } catch (error) {
        health.redis = { status: 'error', error: error.message };
      }

      // Check Alert Engine status
      if (alertEngine) {
        health.alertEngine = {
          status: alertEngine.isRunning() ? 'running' : 'stopped',
          activeRules: alertEngine.getActiveRulesCount(),
          processedAlerts: alertEngine.getProcessedCount()
        };
      } else {
        health.alertEngine = { status: 'not_initialized' };
        health.status = 'unhealthy';
      }

      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // API routes
  app.use('/api', routes);

  // 404 handler
  app.use(notFound);

  // Global error handler
  app.use(errorHandler);
}

/**
 * Initialize services
 */
async function initializeServices() {
  try {
    logger.info('Initializing Alert Engine services...');

    // Initialize Alert Engine
    alertEngine = new AlertEngine();
    await alertEngine.initialize();

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
}

/**
 * Start the server
 */
async function startServer() {
  try {
    logger.info('Starting Alert Engine service...');

    // Connect to databases
    await connectDB();
    await connectRedis();

    // Configure middleware and routes
    configureMiddleware();
    configureRoutes();

    // Initialize services
    await initializeServices();

    // Start HTTP server
    server = app.listen(PORT, () => {
      logger.info(`Alert Engine service started on port ${PORT}`);
      logger.info(`Environment: ${NODE_ENV}`);
      logger.info(`Process ID: ${process.pid}`);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    // Stop accepting new requests
    if (server) {
      server.close(() => {
        logger.info('HTTP server closed');
      });
    }

    // Shutdown Alert Engine
    if (alertEngine) {
      await alertEngine.shutdown();
      logger.info('Alert Engine shutdown complete');
    }

    // Close database connections
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
    }

    // Close Redis connection
    try {
      const redis = require('./config/database').getRedisClient();
      if (redis) {
        await redis.quit();
        logger.info('Redis connection closed');
      }
    } catch (error) {
      logger.warn('Error closing Redis connection:', error);
    }

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

/**
 * Process event handlers
 */
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Handle process warnings
process.on('warning', (warning) => {
  logger.warn('Process warning:', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  });
});

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;