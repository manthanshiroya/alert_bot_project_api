const express = require('express');
const { Logger } = require('../../../shared/utils/logger');
const { ErrorHandler } = require('../../../shared/middleware');

// Import route modules
const subscriptionRoutes = require('./subscriptions');
const planRoutes = require('./plans');
const billingRoutes = require('./billing');
const userRoutes = require('./users');
const webhookRoutes = require('./webhooks');
const reportRoutes = require('./reports');

// Initialize dependencies
const logger = new Logger('subscription-routes');
const errorHandler = new ErrorHandler(logger);
const router = express.Router();

/**
 * @route GET /api/v1/health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/health',
  errorHandler.asyncWrapper(async (req, res) => {
    const health = {
      status: 'healthy',
      service: 'subscription-service',
      version: process.env.SERVICE_VERSION || '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024)
      },
      dependencies: {
        mongodb: 'connected', // This would be checked dynamically
        redis: 'connected'    // This would be checked dynamically
      }
    };
    
    logger.info('Health check requested', {
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    
    res.json({
      success: true,
      data: health
    });
  })
);

/**
 * @route GET /api/v1/info
 * @desc Service information endpoint
 * @access Public
 */
router.get('/info',
  errorHandler.asyncWrapper(async (req, res) => {
    const info = {
      name: 'Alert Bot Subscription Service',
      description: 'Manages user subscriptions, billing, and plan management',
      version: process.env.SERVICE_VERSION || '1.0.0',
      author: 'Alert Bot Team',
      license: 'MIT',
      repository: process.env.REPOSITORY_URL || '',
      documentation: process.env.DOCS_URL || '/docs',
      support: process.env.SUPPORT_EMAIL || 'support@alertbot.com',
      features: [
        'Subscription Management',
        'Plan Management',
        'Billing & Invoicing',
        'Payment Processing',
        'Usage Tracking',
        'Reporting & Analytics',
        'Webhook Integration',
        'User Management'
      ],
      endpoints: {
        subscriptions: '/api/v1/subscriptions',
        plans: '/api/v1/plans',
        billing: '/api/v1/billing',
        users: '/api/v1/users',
        webhooks: '/api/v1/webhooks',
        reports: '/api/v1/reports',
        health: '/api/v1/health',
        docs: '/docs'
      }
    };
    
    res.json({
      success: true,
      data: info
    });
  })
);

// Mount route modules
router.use('/subscriptions', subscriptionRoutes);
router.use('/plans', planRoutes);
router.use('/billing', billingRoutes);
router.use('/users', userRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/reports', reportRoutes);

// Handle 404 for API routes
router.use('*', (req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(404).json({
    success: false,
    message: 'Route not found',
    error: {
      code: 'ROUTE_NOT_FOUND',
      details: `${req.method} ${req.originalUrl} is not a valid endpoint`
    },
    availableEndpoints: {
      subscriptions: '/api/v1/subscriptions',
      plans: '/api/v1/plans',
      billing: '/api/v1/billing',
      users: '/api/v1/users',
      webhooks: '/api/v1/webhooks',
      reports: '/api/v1/reports',
      health: '/api/v1/health',
      info: '/api/v1/info',
      docs: '/docs'
    }
  });
});

module.exports = router;