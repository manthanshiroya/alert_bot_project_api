const express = require('express');
const alertRoutes = require('./alerts');
const marketRoutes = require('./market');
const healthRoutes = require('./health');
const { logger } = require('../utils');

const router = express.Router();

// Log all API requests
router.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date()
  });
  next();
});

// Mount route modules
router.use('/alerts', alertRoutes);
router.use('/market', marketRoutes);
router.use('/health', healthRoutes);

// API documentation endpoint
router.get('/', (req, res) => {
  res.json({
    service: 'Alert Engine API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      alerts: {
        description: 'Alert management endpoints',
        routes: [
          'GET /api/alerts - Get user alerts',
          'GET /api/alerts/:id - Get specific alert',
          'POST /api/alerts - Create new alert',
          'PUT /api/alerts/:id - Update alert',
          'DELETE /api/alerts/:id - Delete alert',
          'POST /api/alerts/:id/pause - Pause alert',
          'POST /api/alerts/:id/resume - Resume alert',
          'POST /api/alerts/:id/test - Test alert conditions',
          'GET /api/alerts/statistics - Get alert statistics',
          'POST /api/alerts/bulk-action - Bulk actions on alerts'
        ]
      },
      market: {
        description: 'Market data endpoints',
        routes: [
          'GET /api/market/symbols - Get supported symbols',
          'GET /api/market/price/:symbol - Get current price',
          'GET /api/market/data/:symbol - Get comprehensive market data',
          'GET /api/market/indicators/:symbol - Get technical indicators',
          'GET /api/market/batch - Get batch market data',
          'GET /api/market/trending - Get trending symbols',
          'GET /api/market/gainers-losers - Get top gainers and losers',
          'GET /api/market/health - Get data sources health',
          'GET /api/market/stats - Get market statistics'
        ]
      },
      health: {
        description: 'Health check endpoints',
        routes: [
          'GET /api/health - Basic health check',
          'GET /api/health/detailed - Detailed health check',
          'GET /api/health/database - Database health check',
          'GET /api/health/metrics - System metrics',
          'GET /api/health/readiness - Kubernetes readiness probe',
          'GET /api/health/liveness - Kubernetes liveness probe'
        ]
      }
    },
    documentation: {
      swagger: '/api/docs',
      postman: '/api/postman'
    },
    timestamp: new Date()
  });
});

// Handle 404 for API routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date()
  });
});

module.exports = router;