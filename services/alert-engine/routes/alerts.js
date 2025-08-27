const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Alert } = require('../models');
const { AlertEngine } = require('../services');
const { logger, alertLogger, helpers, utils } = require('../utils');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// Validation rules
const alertValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Alert name must be between 1 and 100 characters'),
  body('symbol')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Symbol is required and must be valid'),
  body('type')
    .isIn(['price', 'volume', 'technical', 'news', 'custom'])
    .withMessage('Invalid alert type'),
  body('conditions')
    .isArray({ min: 1, max: 5 })
    .withMessage('Must have between 1 and 5 conditions'),
  body('conditions.*.field')
    .isIn(['price', 'volume', 'change', 'changePercent', 'marketCap', 'custom'])
    .withMessage('Invalid condition field'),
  body('conditions.*.operator')
    .isIn(['>', '<', '>=', '<=', '==', '!=', 'crosses_above', 'crosses_below', 'between', 'not_between'])
    .withMessage('Invalid condition operator'),
  body('conditions.*.value')
    .isNumeric()
    .withMessage('Condition value must be numeric'),
  body('logicalOperator')
    .optional()
    .isIn(['AND', 'OR'])
    .withMessage('Logical operator must be AND or OR'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid priority level'),
  body('frequency')
    .optional()
    .isIn(['once', 'recurring'])
    .withMessage('Frequency must be once or recurring'),
  body('cooldownPeriod')
    .optional()
    .isInt({ min: 0, max: 86400000 })
    .withMessage('Cooldown period must be between 0 and 24 hours (in ms)'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiration date must be valid ISO 8601 date'),
  body('notificationChannels.telegram.enabled')
    .optional()
    .isBoolean()
    .withMessage('Telegram notification enabled must be boolean'),
  body('notificationChannels.webhook.enabled')
    .optional()
    .isBoolean()
    .withMessage('Webhook notification enabled must be boolean'),
  body('notificationChannels.email.enabled')
    .optional()
    .isBoolean()
    .withMessage('Email notification enabled must be boolean')
];

const updateAlertValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Alert name must be between 1 and 100 characters'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
  body('isPaused')
    .optional()
    .isBoolean()
    .withMessage('isPaused must be boolean'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid priority level'),
  body('cooldownPeriod')
    .optional()
    .isInt({ min: 0, max: 86400000 })
    .withMessage('Cooldown period must be between 0 and 24 hours (in ms)'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiration date must be valid ISO 8601 date')
];

// Apply rate limiting
router.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
}));

// Apply authentication to all routes
router.use(auth);

/**
 * @route   GET /api/alerts
 * @desc    Get user's alerts with pagination and filtering
 * @access  Private
 */
router.get('/', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'paused', 'expired'])
    .withMessage('Invalid status filter'),
  query('type')
    .optional()
    .isIn(['price', 'volume', 'technical', 'news', 'custom'])
    .withMessage('Invalid type filter'),
  query('symbol')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Invalid symbol filter'),
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid priority filter')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const {
      page = 1,
      limit = 20,
      status,
      type,
      symbol,
      priority,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = { userId: req.user.id };
    
    if (status) {
      switch (status) {
        case 'active':
          filter.isActive = true;
          filter.isPaused = false;
          break;
        case 'inactive':
          filter.isActive = false;
          break;
        case 'paused':
          filter.isPaused = true;
          break;
        case 'expired':
          filter.expiresAt = { $lt: new Date() };
          break;
      }
    }
    
    if (type) filter.type = type;
    if (symbol) filter.symbol = new RegExp(symbol, 'i');
    if (priority) filter.priority = priority;

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const alerts = await Alert.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('executionHistory', null, null, { sort: { triggeredAt: -1 }, limit: 5 });

    const total = await Alert.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json(helpers.successResponse('Alerts retrieved successfully', {
      alerts,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    }));

  } catch (error) {
    logger.error('Error getting alerts:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve alerts'));
  }
});

/**
 * @route   GET /api/alerts/:id
 * @desc    Get specific alert by ID
 * @access  Private
 */
router.get('/:id', [
  param('id')
    .isMongoId()
    .withMessage('Invalid alert ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const alert = await Alert.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).populate('executionHistory');

    if (!alert) {
      return res.status(404).json(helpers.errorResponse('Alert not found'));
    }

    res.json(helpers.successResponse('Alert retrieved successfully', alert));

  } catch (error) {
    logger.error('Error getting alert:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve alert'));
  }
});

/**
 * @route   POST /api/alerts
 * @desc    Create new alert
 * @access  Private
 */
router.post('/', alertValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    // Validate alert configuration
    const configValidation = helpers.validateAlertConfig(req.body);
    if (!configValidation.isValid) {
      return res.status(400).json(helpers.errorResponse('Invalid alert configuration', configValidation.errors));
    }

    // Check user's alert limit (implement based on subscription)
    const userAlertCount = await Alert.countDocuments({
      userId: req.user.id,
      isActive: true
    });

    const alertLimit = req.user.subscription?.alertLimit || 10;
    if (userAlertCount >= alertLimit) {
      return res.status(403).json(helpers.errorResponse(
        `Alert limit reached. You can create up to ${alertLimit} alerts.`
      ));
    }

    // Create alert
    const alertData = {
      ...req.body,
      userId: req.user.id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const alert = new Alert(alertData);
    await alert.save();

    // Log alert creation
    alertLogger.created(alert._id, req.user.id, {
      symbol: alert.symbol,
      type: alert.type,
      conditions: alert.conditions.length
    });

    res.status(201).json(helpers.successResponse('Alert created successfully', alert));

  } catch (error) {
    logger.error('Error creating alert:', error);
    res.status(500).json(helpers.errorResponse('Failed to create alert'));
  }
});

/**
 * @route   PUT /api/alerts/:id
 * @desc    Update alert
 * @access  Private
 */
router.put('/:id', [
  param('id')
    .isMongoId()
    .withMessage('Invalid alert ID'),
  ...updateAlertValidation
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const alert = await Alert.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!alert) {
      return res.status(404).json(helpers.errorResponse('Alert not found'));
    }

    // Update alert
    Object.assign(alert, req.body);
    alert.updatedAt = new Date();
    await alert.save();

    res.json(helpers.successResponse('Alert updated successfully', alert));

  } catch (error) {
    logger.error('Error updating alert:', error);
    res.status(500).json(helpers.errorResponse('Failed to update alert'));
  }
});

/**
 * @route   DELETE /api/alerts/:id
 * @desc    Delete alert
 * @access  Private
 */
router.delete('/:id', [
  param('id')
    .isMongoId()
    .withMessage('Invalid alert ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const alert = await Alert.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!alert) {
      return res.status(404).json(helpers.errorResponse('Alert not found'));
    }

    res.json(helpers.successResponse('Alert deleted successfully'));

  } catch (error) {
    logger.error('Error deleting alert:', error);
    res.status(500).json(helpers.errorResponse('Failed to delete alert'));
  }
});

/**
 * @route   POST /api/alerts/:id/pause
 * @desc    Pause alert
 * @access  Private
 */
router.post('/:id/pause', [
  param('id')
    .isMongoId()
    .withMessage('Invalid alert ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const alert = await Alert.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!alert) {
      return res.status(404).json(helpers.errorResponse('Alert not found'));
    }

    alert.pause();
    await alert.save();

    res.json(helpers.successResponse('Alert paused successfully', alert));

  } catch (error) {
    logger.error('Error pausing alert:', error);
    res.status(500).json(helpers.errorResponse('Failed to pause alert'));
  }
});

/**
 * @route   POST /api/alerts/:id/resume
 * @desc    Resume alert
 * @access  Private
 */
router.post('/:id/resume', [
  param('id')
    .isMongoId()
    .withMessage('Invalid alert ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const alert = await Alert.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!alert) {
      return res.status(404).json(helpers.errorResponse('Alert not found'));
    }

    alert.resume();
    await alert.save();

    res.json(helpers.successResponse('Alert resumed successfully', alert));

  } catch (error) {
    logger.error('Error resuming alert:', error);
    res.status(500).json(helpers.errorResponse('Failed to resume alert'));
  }
});

/**
 * @route   POST /api/alerts/:id/test
 * @desc    Test alert conditions
 * @access  Private
 */
router.post('/:id/test', [
  param('id')
    .isMongoId()
    .withMessage('Invalid alert ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const alert = await Alert.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!alert) {
      return res.status(404).json(helpers.errorResponse('Alert not found'));
    }

    // Test alert conditions without triggering
    const alertEngine = new AlertEngine();
    const marketData = await alertEngine.getMarketData(alert.symbol, alert.exchange);
    
    if (!marketData) {
      return res.status(400).json(helpers.errorResponse('Market data not available for testing'));
    }

    const conditionResult = await alertEngine.evaluateConditions(alert, marketData);

    res.json(helpers.successResponse('Alert test completed', {
      alert: {
        id: alert._id,
        name: alert.name,
        symbol: alert.symbol,
        conditions: alert.conditions
      },
      marketData: {
        currentPrice: marketData.currentPrice,
        volume: marketData.volume,
        change: marketData.priceChange,
        changePercent: marketData.priceChangePercent
      },
      testResult: conditionResult,
      wouldTrigger: conditionResult.triggered
    }));

  } catch (error) {
    logger.error('Error testing alert:', error);
    res.status(500).json(helpers.errorResponse('Failed to test alert'));
  }
});

/**
 * @route   GET /api/alerts/statistics
 * @desc    Get user's alert statistics
 * @access  Private
 */
router.get('/statistics', async (req, res) => {
  try {
    const stats = await Alert.getStatistics(req.user.id);
    res.json(helpers.successResponse('Statistics retrieved successfully', stats));

  } catch (error) {
    logger.error('Error getting alert statistics:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve statistics'));
  }
});

/**
 * @route   POST /api/alerts/bulk-action
 * @desc    Perform bulk actions on alerts
 * @access  Private
 */
router.post('/bulk-action', [
  body('alertIds')
    .isArray({ min: 1, max: 50 })
    .withMessage('Must provide 1-50 alert IDs'),
  body('alertIds.*')
    .isMongoId()
    .withMessage('Invalid alert ID'),
  body('action')
    .isIn(['pause', 'resume', 'activate', 'deactivate', 'delete'])
    .withMessage('Invalid bulk action')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const { alertIds, action } = req.body;
    const results = {
      successful: [],
      failed: []
    };

    for (const alertId of alertIds) {
      try {
        const alert = await Alert.findOne({
          _id: alertId,
          userId: req.user.id
        });

        if (!alert) {
          results.failed.push({ alertId, error: 'Alert not found' });
          continue;
        }

        switch (action) {
          case 'pause':
            alert.pause();
            break;
          case 'resume':
            alert.resume();
            break;
          case 'activate':
            alert.activate();
            break;
          case 'deactivate':
            alert.deactivate();
            break;
          case 'delete':
            await alert.deleteOne();
            results.successful.push({ alertId, action: 'deleted' });
            continue;
        }

        await alert.save();
        results.successful.push({ alertId, action });

      } catch (error) {
        results.failed.push({ alertId, error: error.message });
      }
    }

    res.json(helpers.successResponse('Bulk action completed', results));

  } catch (error) {
    logger.error('Error performing bulk action:', error);
    res.status(500).json(helpers.errorResponse('Failed to perform bulk action'));
  }
});

module.exports = router;