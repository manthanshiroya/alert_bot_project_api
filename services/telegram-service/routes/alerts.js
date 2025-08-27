const express = require('express');
const { AlertController } = require('../controllers');
const { authenticate, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { rateLimiter } = require('../middleware/rateLimiter');
const { 
  alertCreationSchema, 
  alertUpdateSchema, 
  alertToggleSchema 
} = require('../schemas/alerts');

const router = express.Router();
const alertController = new AlertController();

// Apply authentication to all routes
router.use(authenticate);

// Alert Management Routes

/**
 * @route POST /api/alerts
 * @desc Create a new alert
 * @access Private
 */
router.post('/',
  rateLimiter.createAlert,
  validateRequest(alertCreationSchema),
  authorize(['user', 'admin']),
  alertController.createAlert.bind(alertController)
);

/**
 * @route GET /api/alerts
 * @desc Get user's alerts
 * @access Private
 */
router.get('/',
  rateLimiter.getAlerts,
  authorize(['user', 'admin']),
  alertController.getAlerts.bind(alertController)
);

/**
 * @route GET /api/alerts/:alertId
 * @desc Get alert details
 * @access Private
 */
router.get('/:alertId',
  rateLimiter.getAlert,
  authorize(['user', 'admin']),
  alertController.getAlert.bind(alertController)
);

/**
 * @route PUT /api/alerts/:alertId
 * @desc Update alert
 * @access Private
 */
router.put('/:alertId',
  rateLimiter.updateAlert,
  validateRequest(alertUpdateSchema),
  authorize(['user', 'admin']),
  alertController.updateAlert.bind(alertController)
);

/**
 * @route DELETE /api/alerts/:alertId
 * @desc Delete alert
 * @access Private
 */
router.delete('/:alertId',
  rateLimiter.deleteAlert,
  authorize(['user', 'admin']),
  alertController.deleteAlert.bind(alertController)
);

// Alert Control Routes

/**
 * @route POST /api/alerts/:alertId/toggle
 * @desc Pause/Resume alert
 * @access Private
 */
router.post('/:alertId/toggle',
  rateLimiter.toggleAlert,
  validateRequest(alertToggleSchema),
  authorize(['user', 'admin']),
  alertController.toggleAlert.bind(alertController)
);

/**
 * @route POST /api/alerts/:alertId/test
 * @desc Test alert (trigger manually)
 * @access Private
 */
router.post('/:alertId/test',
  rateLimiter.testAlert,
  authorize(['user', 'admin']),
  alertController.testAlert.bind(alertController)
);

// Alert History and Statistics Routes

/**
 * @route GET /api/alerts/:alertId/history
 * @desc Get alert execution history
 * @access Private
 */
router.get('/:alertId/history',
  rateLimiter.getAlertHistory,
  authorize(['user', 'admin']),
  alertController.getAlertHistory.bind(alertController)
);

/**
 * @route GET /api/alerts/stats
 * @desc Get alert statistics
 * @access Private
 */
router.get('/stats/overview',
  rateLimiter.getAlertStats,
  authorize(['user', 'admin']),
  alertController.getAlertStats.bind(alertController)
);

// Bulk Operations Routes

/**
 * @route POST /api/alerts/bulk/pause
 * @desc Pause multiple alerts
 * @access Private
 */
router.post('/bulk/pause',
  rateLimiter.bulkOperation,
  authorize(['user', 'admin']),
  async (req, res) => {
    try {
      const { alertIds } = req.body;
      const userId = req.user.id;

      if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Alert IDs array is required'
        });
      }

      const { Alert } = require('../models');
      
      const alerts = await Alert.find({
        _id: { $in: alertIds },
        userId,
        deletedAt: null
      });

      const results = [];
      for (const alert of alerts) {
        try {
          await alert.pause();
          await alertController.unscheduleAlert(alert._id);
          results.push({ alertId: alert._id, success: true });
        } catch (error) {
          results.push({ 
            alertId: alert._id, 
            success: false, 
            error: error.message 
          });
        }
      }

      res.json({
        success: true,
        message: 'Bulk pause operation completed',
        data: {
          total: alertIds.length,
          processed: results.length,
          results
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to pause alerts'
      });
    }
  }
);

/**
 * @route POST /api/alerts/bulk/resume
 * @desc Resume multiple alerts
 * @access Private
 */
router.post('/bulk/resume',
  rateLimiter.bulkOperation,
  authorize(['user', 'admin']),
  async (req, res) => {
    try {
      const { alertIds } = req.body;
      const userId = req.user.id;

      if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Alert IDs array is required'
        });
      }

      const { Alert } = require('../models');
      
      const alerts = await Alert.find({
        _id: { $in: alertIds },
        userId,
        deletedAt: null
      });

      const results = [];
      for (const alert of alerts) {
        try {
          await alert.resume();
          await alertController.scheduleAlert(alert._id);
          results.push({ alertId: alert._id, success: true });
        } catch (error) {
          results.push({ 
            alertId: alert._id, 
            success: false, 
            error: error.message 
          });
        }
      }

      res.json({
        success: true,
        message: 'Bulk resume operation completed',
        data: {
          total: alertIds.length,
          processed: results.length,
          results
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to resume alerts'
      });
    }
  }
);

/**
 * @route DELETE /api/alerts/bulk/delete
 * @desc Delete multiple alerts
 * @access Private
 */
router.delete('/bulk/delete',
  rateLimiter.bulkOperation,
  authorize(['user', 'admin']),
  async (req, res) => {
    try {
      const { alertIds } = req.body;
      const userId = req.user.id;

      if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Alert IDs array is required'
        });
      }

      const { Alert } = require('../models');
      
      const alerts = await Alert.find({
        _id: { $in: alertIds },
        userId,
        deletedAt: null
      });

      const results = [];
      for (const alert of alerts) {
        try {
          await alertController.unscheduleAlert(alert._id);
          await alert.softDelete();
          results.push({ alertId: alert._id, success: true });
        } catch (error) {
          results.push({ 
            alertId: alert._id, 
            success: false, 
            error: error.message 
          });
        }
      }

      res.json({
        success: true,
        message: 'Bulk delete operation completed',
        data: {
          total: alertIds.length,
          processed: results.length,
          results
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to delete alerts'
      });
    }
  }
);

// Alert Templates Routes

/**
 * @route GET /api/alerts/templates
 * @desc Get alert templates
 * @access Private
 */
router.get('/templates/list',
  rateLimiter.getTemplates,
  authorize(['user', 'admin']),
  async (req, res) => {
    try {
      const templates = {
        price: {
          name: 'Price Alert',
          description: 'Alert when price crosses a threshold',
          conditions: {
            symbol: 'BTC/USD',
            operator: 'above',
            target: 50000
          },
          messageFormat: {
            template: '🚨 *Price Alert*\n\n📊 {symbol}\n💰 Current: ${currentPrice}\n🎯 Target: ${targetPrice}\n\n⏰ {timestamp}',
            parseMode: 'Markdown'
          }
        },
        volume: {
          name: 'Volume Alert',
          description: 'Alert when volume exceeds threshold',
          conditions: {
            symbol: 'BTC/USD',
            operator: 'above',
            target: 1000000,
            timeframe: '1h'
          },
          messageFormat: {
            template: '📈 *Volume Alert*\n\n📊 {symbol}\n📊 Volume: {currentVolume}\n🎯 Target: {targetVolume}\n\n⏰ {timestamp}',
            parseMode: 'Markdown'
          }
        },
        technical: {
          name: 'Technical Indicator Alert',
          description: 'Alert based on technical indicators',
          conditions: {
            symbol: 'BTC/USD',
            indicator: 'RSI',
            operator: 'above',
            target: 70,
            timeframe: '1h'
          },
          messageFormat: {
            template: '📊 *Technical Alert*\n\n📈 {symbol}\n🔍 {indicator}: {currentValue}\n🎯 Target: {targetValue}\n\n⏰ {timestamp}',
            parseMode: 'Markdown'
          }
        },
        news: {
          name: 'News Sentiment Alert',
          description: 'Alert based on news sentiment',
          conditions: {
            keywords: ['bitcoin', 'crypto'],
            sentiment: 'positive',
            sources: ['coindesk', 'cointelegraph']
          },
          messageFormat: {
            template: '📰 *News Alert*\n\n📊 Sentiment: {sentiment}\n🔍 Keywords: {keywords}\n\n⏰ {timestamp}',
            parseMode: 'Markdown'
          }
        }
      };

      res.json({
        success: true,
        data: { templates }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch templates'
      });
    }
  }
);

// Alert Validation Routes

/**
 * @route POST /api/alerts/validate
 * @desc Validate alert conditions
 * @access Private
 */
router.post('/validate/conditions',
  rateLimiter.validateAlert,
  authorize(['user', 'admin']),
  async (req, res) => {
    try {
      const { type, conditions } = req.body;

      if (!type || !conditions) {
        return res.status(400).json({
          success: false,
          message: 'Type and conditions are required'
        });
      }

      const { validateAlertConditions } = require('../utils/validation');
      const result = validateAlertConditions(type, conditions);

      res.json({
        success: true,
        data: {
          isValid: result.isValid,
          errors: result.errors || [],
          warnings: result.warnings || []
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to validate conditions'
      });
    }
  }
);

// Health Check Route

/**
 * @route GET /api/alerts/health
 * @desc Health check for Alert service
 * @access Public
 */
router.get('/health/status', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'alert-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    scheduledAlerts: alertController.scheduledJobs.size,
    queuedAlerts: alertController.alertQueue.size
  });
});

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Alert route error:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details
    });
  }
  
  if (error.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

module.exports = router;