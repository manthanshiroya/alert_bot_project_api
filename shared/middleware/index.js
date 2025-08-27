const AuthMiddleware = require('./auth');
const ValidationMiddleware = require('./validation');
const ErrorHandler = require('./errorHandler');
const RateLimiter = require('./rateLimiter');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const logger = require('../utils/logger');
const environmentConfig = require('../config/environment');

class MiddlewareManager {
  // Apply common middleware to Express app
  static applyCommonMiddleware(app) {
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
    const corsOptions = {
      origin: (origin, callback) => {
        const allowedOrigins = environmentConfig.get('CORS_ORIGINS') || ['http://localhost:3000'];
        
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-Signature',
        'X-Hub-Signature-256'
      ],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'Retry-After'
      ]
    };
    
    app.use(cors(corsOptions));

    // Compression middleware
    app.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      threshold: 1024 // Only compress responses larger than 1KB
    }));

    // Body parsing middleware
    app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        // Store raw body for webhook signature verification
        req.rawBody = buf;
      }
    }));
    
    app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // Request ID middleware
    app.use(this.requestId());

    // Request logging middleware
    app.use(this.requestLogger());

    // Request timeout middleware
    app.use(ErrorHandler.timeout(30000)); // 30 seconds

    // Health check endpoint (before rate limiting)
    app.get('/health', this.healthCheck());
    app.get('/health/detailed', this.detailedHealthCheck());
  }

  // Apply security middleware
  static applySecurityMiddleware(app) {
    // Rate limiting
    app.use('/api/auth', RateLimiter.auth());
    app.use('/api/webhooks', RateLimiter.webhook());
    app.use('/api/admin', RateLimiter.admin());
    app.use('/api', RateLimiter.api());

    // Input sanitization
    app.use(ValidationMiddleware.sanitize());
  }

  // Apply error handling middleware (should be last)
  static applyErrorHandling(app) {
    // 404 handler
    app.use(ErrorHandler.notFound());

    // Global error handler
    app.use(ErrorHandler.handle());
  }

  // Request ID middleware
  static requestId() {
    return (req, res, next) => {
      req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.id);
      next();
    };
  }

  // Request logging middleware
  static requestLogger() {
    const morganFormat = environmentConfig.get('NODE_ENV') === 'production' 
      ? 'combined' 
      : 'dev';

    return morgan(morganFormat, {
      stream: {
        write: (message) => {
          logger.info(message.trim(), { context: 'http_request' });
        }
      },
      skip: (req, res) => {
        // Skip logging for health checks in production
        if (environmentConfig.get('NODE_ENV') === 'production') {
          return req.path === '/health' || req.path === '/health/detailed';
        }
        return false;
      }
    });
  }

  // Health check middleware
  static healthCheck() {
    return async (req, res) => {
      try {
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: environmentConfig.get('NODE_ENV'),
          version: process.env.npm_package_version || '1.0.0'
        };

        res.status(200).json(health);
      } catch (error) {
        logger.logError(error, { context: 'health_check' });
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    };
  }

  // Detailed health check middleware
  static detailedHealthCheck() {
    return async (req, res) => {
      try {
        const DatabaseConfig = require('../config/database');
        
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: environmentConfig.get('NODE_ENV'),
          version: process.env.npm_package_version || '1.0.0',
          services: {}
        };

        // Check MongoDB
        try {
          const mongoHealth = await DatabaseConfig.checkMongoHealth();
          health.services.mongodb = {
            status: 'healthy',
            ...mongoHealth
          };
        } catch (error) {
          health.services.mongodb = ErrorHandler.handleHealthCheckError(error, 'mongodb');
          health.status = 'degraded';
        }

        // Check Redis
        try {
          const redisHealth = await DatabaseConfig.checkRedisHealth();
          health.services.redis = {
            status: 'healthy',
            ...redisHealth
          };
        } catch (error) {
          health.services.redis = ErrorHandler.handleHealthCheckError(error, 'redis');
          health.status = 'degraded';
        }

        // Check memory usage
        const memUsage = process.memoryUsage();
        health.memory = {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
        };

        // Determine overall status
        const unhealthyServices = Object.values(health.services)
          .filter(service => service.status === 'unhealthy');
        
        if (unhealthyServices.length > 0) {
          health.status = 'unhealthy';
        }

        const statusCode = health.status === 'healthy' ? 200 : 
                          health.status === 'degraded' ? 200 : 503;

        res.status(statusCode).json(health);
      } catch (error) {
        logger.logError(error, { context: 'detailed_health_check' });
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    };
  }

  // API documentation middleware
  static apiDocs() {
    return (req, res) => {
      const docs = {
        name: 'Alert Bot API',
        version: '1.0.0',
        description: 'Microservices API for Alert Bot system',
        endpoints: {
          health: {
            'GET /health': 'Basic health check',
            'GET /health/detailed': 'Detailed health check with service status'
          },
          auth: {
            'POST /api/auth/register': 'User registration',
            'POST /api/auth/login': 'User login',
            'POST /api/auth/logout': 'User logout',
            'POST /api/auth/refresh': 'Refresh access token'
          },
          users: {
            'GET /api/users/profile': 'Get user profile',
            'PUT /api/users/profile': 'Update user profile',
            'DELETE /api/users/account': 'Delete user account'
          },
          alerts: {
            'GET /api/alerts': 'Get user alerts',
            'POST /api/alerts': 'Create new alert',
            'PUT /api/alerts/:id': 'Update alert',
            'DELETE /api/alerts/:id': 'Delete alert'
          },
          charts: {
            'GET /api/charts': 'Get user charts',
            'POST /api/charts': 'Create new chart',
            'PUT /api/charts/:id': 'Update chart',
            'DELETE /api/charts/:id': 'Delete chart'
          },
          webhooks: {
            'POST /api/webhooks/tradingview': 'TradingView webhook endpoint'
          },
          admin: {
            'GET /api/admin/users': 'Get all users (admin only)',
            'GET /api/admin/stats': 'Get system statistics (admin only)',
            'POST /api/admin/users': 'Create admin user'
          }
        },
        authentication: {
          type: 'Bearer Token (JWT)',
          header: 'Authorization: Bearer <token>'
        },
        rateLimit: {
          general: '100 requests per 15 minutes',
          auth: '5 attempts per 15 minutes',
          api: 'Based on subscription plan',
          webhooks: '60 requests per minute'
        }
      };

      res.json(docs);
    };
  }

  // Metrics middleware
  static metrics() {
    const startTime = Date.now();
    const requestCounts = new Map();
    const responseTimes = [];

    return (req, res, next) => {
      const start = Date.now();
      
      // Count requests
      const key = `${req.method}:${req.path}`;
      requestCounts.set(key, (requestCounts.get(key) || 0) + 1);

      // Measure response time
      res.on('finish', () => {
        const duration = Date.now() - start;
        responseTimes.push(duration);
        
        // Keep only last 1000 response times
        if (responseTimes.length > 1000) {
          responseTimes.shift();
        }

        // Log slow requests
        if (duration > 5000) { // 5 seconds
          logger.warn('Slow request detected', {
            method: req.method,
            path: req.path,
            duration,
            userId: req.user?.id,
            ip: req.ip
          });
        }
      });

      // Attach metrics to request for potential use
      req.metrics = {
        getRequestCounts: () => Object.fromEntries(requestCounts),
        getAverageResponseTime: () => {
          if (responseTimes.length === 0) return 0;
          return responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        },
        getUptime: () => Date.now() - startTime
      };

      next();
    };
  }

  // Development middleware
  static development(app) {
    if (environmentConfig.get('NODE_ENV') === 'development') {
      // API documentation endpoint
      app.get('/api/docs', this.apiDocs());
      
      // Metrics endpoint
      app.get('/api/metrics', (req, res) => {
        res.json({
          requestCounts: req.metrics?.getRequestCounts() || {},
          averageResponseTime: req.metrics?.getAverageResponseTime() || 0,
          uptime: req.metrics?.getUptime() || 0,
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        });
      });

      // Enable metrics collection
      app.use(this.metrics());
    }
  }

  // Initialize all middleware
  static initialize(app) {
    // Apply middleware in correct order
    this.applyCommonMiddleware(app);
    this.applySecurityMiddleware(app);
    this.development(app);
    
    // Error handling should be applied last by the individual services
    return {
      applyErrorHandling: () => this.applyErrorHandling(app)
    };
  }
}

// Export all middleware components
module.exports = {
  AuthMiddleware,
  ValidationMiddleware,
  ErrorHandler,
  RateLimiter,
  MiddlewareManager
};