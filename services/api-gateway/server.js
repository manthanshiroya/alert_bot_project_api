require('express-async-errors');
require('dotenv').config();

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

// Import shared components
const { MiddlewareManager, ErrorHandler } = require('../../shared/middleware');
const DatabaseConfig = require('../../shared/config/database');
const environmentConfig = require('../../shared/config/environment');
const logger = require('../../shared/utils/logger');

// Import API Gateway specific components
const routeConfig = require('./config/routes');
const proxyConfig = require('./config/proxy');
const swaggerConfig = require('./config/swagger');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhooks');

class APIGateway {
  constructor() {
    this.app = express();
    this.server = null;
    this.port = environmentConfig.get('API_GATEWAY_PORT') || 3000;
    this.host = environmentConfig.get('API_GATEWAY_HOST') || '0.0.0.0';
  }

  // Initialize the API Gateway
  async initialize() {
    try {
      logger.info('Initializing API Gateway...');

      // Connect to databases
      await this.connectDatabases();

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup proxy routes
      this.setupProxyRoutes();

      // Setup Swagger documentation
      this.setupSwagger();

      // Setup error handling (must be last)
      this.setupErrorHandling();

      logger.info('API Gateway initialized successfully');
    } catch (error) {
      logger.logError(error, {
        context: 'api_gateway_initialization',
        service: 'api-gateway'
      });
      throw error;
    }
  }

  // Connect to databases
  async connectDatabases() {
    try {
      logger.info('Connecting to databases...');
      
      await DatabaseConfig.connectMongo();
      await DatabaseConfig.connectRedis();
      
      logger.info('Database connections established');
    } catch (error) {
      logger.logError(error, {
        context: 'database_connection',
        service: 'api-gateway'
      });
      throw error;
    }
  }

  // Setup middleware
  setupMiddleware() {
    logger.info('Setting up middleware...');
    
    // Apply common middleware (security, parsing, logging, etc.)
    const middlewareManager = MiddlewareManager.initialize(this.app);
    
    // Store reference to error handling setup
    this.applyErrorHandling = middlewareManager.applyErrorHandling;
    
    logger.info('Middleware setup completed');
  }

  // Setup direct routes (handled by API Gateway)
  setupRoutes() {
    logger.info('Setting up direct routes...');

    // API Gateway info endpoint
    this.app.get('/api/gateway/info', (req, res) => {
      res.json({
        service: 'API Gateway',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: environmentConfig.get('NODE_ENV'),
        routes: routeConfig.getRouteInfo()
      });
    });

    // Authentication routes (handled directly by API Gateway)
    this.app.use('/api/auth', authRoutes);

    // Admin routes (handled directly by API Gateway)
    this.app.use('/api/admin', adminRoutes);

    // Webhook routes (handled directly by API Gateway)
    this.app.use('/api/webhooks', webhookRoutes);

    logger.info('Direct routes setup completed');
  }

  // Setup proxy routes to microservices
  setupProxyRoutes() {
    logger.info('Setting up proxy routes...');

    const routes = routeConfig.getProxyRoutes();

    routes.forEach(route => {
      const proxyOptions = proxyConfig.createProxyOptions(route);
      
      logger.info(`Setting up proxy route: ${route.path} -> ${route.target}`);
      
      this.app.use(
        route.path,
        route.middleware || [],
        createProxyMiddleware(proxyOptions)
      );
    });

    logger.info('Proxy routes setup completed');
  }

  // Setup Swagger documentation
  setupSwagger() {
    if (environmentConfig.get('NODE_ENV') !== 'production') {
      logger.info('Setting up Swagger documentation...');
      swaggerConfig.setup(this.app);
      logger.info('Swagger documentation available at /api/docs');
    }
  }

  // Setup error handling
  setupErrorHandling() {
    logger.info('Setting up error handling...');
    this.applyErrorHandling();
    logger.info('Error handling setup completed');
  }

  // Start the server
  async start() {
    try {
      await this.initialize();

      this.server = this.app.listen(this.port, this.host, () => {
        logger.info(`API Gateway started successfully`, {
          port: this.port,
          host: this.host,
          environment: environmentConfig.get('NODE_ENV'),
          processId: process.pid
        });

        // Log available routes
        this.logRoutes();
      });

      // Handle server errors
      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.logError(new Error(`Port ${this.port} is already in use`), {
            context: 'server_startup',
            service: 'api-gateway',
            port: this.port
          });
        } else {
          logger.logError(error, {
            context: 'server_error',
            service: 'api-gateway'
          });
        }
        process.exit(1);
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown();

    } catch (error) {
      logger.logError(error, {
        context: 'server_startup',
        service: 'api-gateway'
      });
      process.exit(1);
    }
  }

  // Log available routes
  logRoutes() {
    const routes = [];
    
    // Extract routes from Express app
    this.app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        // Direct routes
        const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
        routes.push(`${methods} ${middleware.route.path}`);
      } else if (middleware.name === 'router') {
        // Router middleware
        middleware.handle.stack.forEach((handler) => {
          if (handler.route) {
            const methods = Object.keys(handler.route.methods).join(', ').toUpperCase();
            const path = middleware.regexp.source.replace('\\', '').replace('(?=\/|$)', '');
            routes.push(`${methods} ${path}${handler.route.path}`);
          }
        });
      }
    });

    logger.info('Available routes:', { routes });
  }

  // Setup graceful shutdown
  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Stop accepting new connections
      if (this.server) {
        this.server.close(async () => {
          logger.info('HTTP server closed');

          try {
            // Close database connections
            await DatabaseConfig.disconnect();
            logger.info('Database connections closed');

            logger.info('Graceful shutdown completed');
            process.exit(0);
          } catch (error) {
            logger.logError(error, {
              context: 'graceful_shutdown',
              service: 'api-gateway'
            });
            process.exit(1);
          }
        });

        // Force close after timeout
        setTimeout(() => {
          logger.error('Forced shutdown due to timeout');
          process.exit(1);
        }, 10000); // 10 seconds timeout
      } else {
        process.exit(0);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.logError(error, {
        context: 'uncaught_exception',
        service: 'api-gateway'
      });
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.logError(new Error(`Unhandled Rejection: ${reason}`), {
        context: 'unhandled_rejection',
        service: 'api-gateway',
        promise: promise.toString()
      });
      gracefulShutdown('UNHANDLED_REJECTION');
    });
  }

  // Stop the server
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
  }

  // Get Express app instance (for testing)
  getApp() {
    return this.app;
  }
}

// Create and start the API Gateway
const apiGateway = new APIGateway();

// Start the server if this file is run directly
if (require.main === module) {
  apiGateway.start().catch((error) => {
    logger.logError(error, {
      context: 'startup_error',
      service: 'api-gateway'
    });
    process.exit(1);
  });
}

// Export for testing
module.exports = apiGateway;