const express = require('express');
const telegramRoutes = require('./telegram');
const alertRoutes = require('./alerts');

const router = express.Router();

// Mount route modules
router.use('/telegram', telegramRoutes);
router.use('/alerts', alertRoutes);

// Root health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'telegram-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API documentation endpoint
router.get('/docs', (req, res) => {
  res.json({
    service: 'Telegram Service API',
    version: '1.0.0',
    endpoints: {
      telegram: {
        'POST /telegram/bots': 'Register a new Telegram bot',
        'GET /telegram/bots': 'Get user\'s bots',
        'GET /telegram/bots/:botId': 'Get bot details',
        'PUT /telegram/bots/:botId': 'Update bot settings',
        'DELETE /telegram/bots/:botId': 'Delete bot',
        'GET /telegram/bots/:botId/chats': 'Get bot\'s chats',
        'POST /telegram/bots/:botId/messages': 'Send message to chat',
        'GET /telegram/bots/:botId/chats/:chatId/messages': 'Get chat messages',
        'POST /telegram/webhook/:botId': 'Handle Telegram webhook',
        'GET /telegram/health': 'Telegram service health check',
        'GET /telegram/stats': 'Get user\'s Telegram statistics'
      },
      alerts: {
        'POST /alerts': 'Create a new alert',
        'GET /alerts': 'Get user\'s alerts',
        'GET /alerts/:alertId': 'Get alert details',
        'PUT /alerts/:alertId': 'Update alert',
        'DELETE /alerts/:alertId': 'Delete alert',
        'POST /alerts/:alertId/toggle': 'Pause/Resume alert',
        'POST /alerts/:alertId/test': 'Test alert (trigger manually)',
        'GET /alerts/:alertId/history': 'Get alert execution history',
        'GET /alerts/stats/overview': 'Get alert statistics',
        'POST /alerts/bulk/pause': 'Pause multiple alerts',
        'POST /alerts/bulk/resume': 'Resume multiple alerts',
        'DELETE /alerts/bulk/delete': 'Delete multiple alerts',
        'GET /alerts/templates/list': 'Get alert templates',
        'POST /alerts/validate/conditions': 'Validate alert conditions',
        'GET /alerts/health/status': 'Alert service health check'
      },
      general: {
        'GET /health': 'Service health check',
        'GET /docs': 'API documentation'
      }
    },
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer <token>',
      description: 'All endpoints except health checks require authentication'
    },
    rateLimit: {
      description: 'Rate limiting is applied to all endpoints',
      limits: {
        createBot: '5 requests per hour',
        sendMessage: '100 requests per hour',
        createAlert: '20 requests per hour',
        general: '1000 requests per hour'
      }
    }
  });
});

module.exports = router;