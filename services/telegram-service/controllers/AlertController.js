const { Alert, Bot, Chat, Message } = require('../models');
const logger = require('../utils/logger');
const { validateAlertConditions, sanitizeInput } = require('../utils/validation');
const { generateId } = require('../utils/helpers');
const EventEmitter = require('events');
const cron = require('node-cron');

/**
 * AlertController
 * Handles alert creation, management, and processing
 */
class AlertController extends EventEmitter {
  constructor() {
    super();
    this.scheduledJobs = new Map(); // Store cron jobs
    this.alertQueue = new Map(); // Store alerts pending execution
    this.isProcessing = false;
  }

  /**
   * Create a new alert
   */
  async createAlert(req, res) {
    try {
      const userId = req.user.id;
      const alertData = sanitizeInput(req.body);

      // Validate required fields
      const { name, description, type, conditions, triggers, botId, chatIds } = alertData;

      if (!name || !type || !conditions || !botId || !chatIds || chatIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: name, type, conditions, botId, chatIds'
        });
      }

      // Validate bot ownership
      const bot = await Bot.findOne({
        _id: botId,
        userId,
        isActive: true,
        deletedAt: null
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          message: 'Bot not found or inactive'
        });
      }

      // Validate chat ownership
      const chats = await Chat.find({
        _id: { $in: chatIds },
        botId,
        userId,
        isActive: true,
        deletedAt: null
      });

      if (chats.length !== chatIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more chats not found or inactive'
        });
      }

      // Validate alert conditions
      const validationResult = validateAlertConditions(type, conditions);
      if (!validationResult.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid alert conditions',
          errors: validationResult.errors
        });
      }

      // Create alert
      const alert = new Alert({
        userId,
        botId,
        chatIds,
        name: name.trim(),
        description: description?.trim(),
        type,
        category: alertData.category || 'general',
        status: 'active',
        conditions: {
          ...conditions,
          // Ensure numeric values are properly typed
          ...(conditions.price && {
            price: {
              ...conditions.price,
              target: parseFloat(conditions.price.target),
              threshold: conditions.price.threshold ? parseFloat(conditions.price.threshold) : undefined
            }
          }),
          ...(conditions.volume && {
            volume: {
              ...conditions.volume,
              target: parseFloat(conditions.volume.target),
              threshold: conditions.volume.threshold ? parseFloat(conditions.volume.threshold) : undefined
            }
          })
        },
        triggers: {
          checkInterval: triggers?.checkInterval || 60, // Default 1 minute
          cooldownPeriod: triggers?.cooldownPeriod || 300, // Default 5 minutes
          maxAlertsPerDay: triggers?.maxAlertsPerDay || 50,
          timeRestrictions: triggers?.timeRestrictions || {},
          autoDisableAfter: triggers?.autoDisableAfter,
          retryAttempts: triggers?.retryAttempts || 3
        },
        messageFormat: {
          template: alertData.messageFormat?.template || this.getDefaultTemplate(type),
          parseMode: alertData.messageFormat?.parseMode || 'Markdown',
          includeChart: alertData.messageFormat?.includeChart || false,
          customFields: alertData.messageFormat?.customFields || []
        }
      });

      await alert.save();

      // Schedule alert checking
      await this.scheduleAlert(alert._id);

      logger.info(`Alert created: ${alert.name}`, {
        userId,
        alertId: alert._id,
        type: alert.type,
        botId
      });

      // Emit event
      this.emit('alertCreated', {
        alertId: alert._id,
        userId,
        type: alert.type,
        name: alert.name
      });

      res.status(201).json({
        success: true,
        message: 'Alert created successfully',
        data: {
          alertId: alert._id,
          name: alert.name,
          type: alert.type,
          status: alert.status,
          nextCheck: alert.nextExecution
        }
      });

    } catch (error) {
      logger.error('Error creating alert:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create alert',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get user's alerts
   */
  async getAlerts(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, status, type, category, botId, search } = req.query;

      const query = { userId, deletedAt: null };

      // Apply filters
      if (status) query.status = status;
      if (type) query.type = type;
      if (category) query.category = category;
      if (botId) query.botId = botId;

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { 'conditions.symbol': { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * limit;
      const alerts = await Alert.find(query)
        .populate('botId', 'name username')
        .populate('chatIds', 'title username firstName lastName type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Alert.countDocuments(query);

      res.json({
        success: true,
        data: {
          alerts,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching alerts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch alerts'
      });
    }
  }

  /**
   * Get alert details
   */
  async getAlert(req, res) {
    try {
      const { alertId } = req.params;
      const userId = req.user.id;

      const alert = await Alert.findOne({
        _id: alertId,
        userId,
        deletedAt: null
      })
        .populate('botId', 'name username isActive')
        .populate('chatIds', 'title username firstName lastName type isActive');

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }

      // Get recent execution history
      const recentHistory = alert.executionHistory
        .slice(-10)
        .sort((a, b) => b.executedAt - a.executedAt);

      res.json({
        success: true,
        data: {
          alert,
          recentHistory,
          stats: {
            totalExecutions: alert.stats.totalChecks,
            totalAlerts: alert.stats.totalAlerts,
            successRate: alert.stats.totalChecks > 0 ? 
              ((alert.stats.totalChecks - alert.stats.totalErrors) / alert.stats.totalChecks * 100).toFixed(2) : 0,
            lastTriggered: alert.stats.lastTriggered,
            nextExecution: alert.nextExecution
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching alert:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch alert'
      });
    }
  }

  /**
   * Update alert
   */
  async updateAlert(req, res) {
    try {
      const { alertId } = req.params;
      const userId = req.user.id;
      const updates = sanitizeInput(req.body);

      const alert = await Alert.findOne({
        _id: alertId,
        userId,
        deletedAt: null
      });

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }

      // Validate conditions if being updated
      if (updates.conditions) {
        const validationResult = validateAlertConditions(alert.type, updates.conditions);
        if (!validationResult.isValid) {
          return res.status(400).json({
            success: false,
            message: 'Invalid alert conditions',
            errors: validationResult.errors
          });
        }
      }

      // Validate chat ownership if chatIds being updated
      if (updates.chatIds) {
        const chats = await Chat.find({
          _id: { $in: updates.chatIds },
          botId: alert.botId,
          userId,
          isActive: true,
          deletedAt: null
        });

        if (chats.length !== updates.chatIds.length) {
          return res.status(400).json({
            success: false,
            message: 'One or more chats not found or inactive'
          });
        }
      }

      // Update allowed fields
      const allowedUpdates = [
        'name', 'description', 'conditions', 'triggers', 
        'messageFormat', 'chatIds', 'category'
      ];

      const updateData = {};
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          if (field === 'conditions' || field === 'triggers' || field === 'messageFormat') {
            updateData[field] = { ...alert[field], ...updates[field] };
          } else {
            updateData[field] = updates[field];
          }
        }
      });

      Object.assign(alert, updateData);
      await alert.save();

      // Reschedule if triggers changed
      if (updates.triggers) {
        await this.rescheduleAlert(alertId);
      }

      logger.info(`Alert updated: ${alert.name}`, {
        userId,
        alertId,
        updates: Object.keys(updateData)
      });

      res.json({
        success: true,
        message: 'Alert updated successfully',
        data: {
          alert: await Alert.findById(alertId)
            .populate('botId', 'name username')
            .populate('chatIds', 'title username firstName lastName type')
        }
      });

    } catch (error) {
      logger.error('Error updating alert:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update alert'
      });
    }
  }

  /**
   * Delete alert
   */
  async deleteAlert(req, res) {
    try {
      const { alertId } = req.params;
      const userId = req.user.id;

      const alert = await Alert.findOne({
        _id: alertId,
        userId,
        deletedAt: null
      });

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }

      // Unschedule alert
      await this.unscheduleAlert(alertId);

      // Soft delete alert
      await alert.softDelete();

      logger.info(`Alert deleted: ${alert.name}`, {
        userId,
        alertId
      });

      // Emit event
      this.emit('alertDeleted', {
        alertId,
        userId,
        name: alert.name
      });

      res.json({
        success: true,
        message: 'Alert deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting alert:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete alert'
      });
    }
  }

  /**
   * Pause/Resume alert
   */
  async toggleAlert(req, res) {
    try {
      const { alertId } = req.params;
      const { action } = req.body; // 'pause' or 'resume'
      const userId = req.user.id;

      if (!['pause', 'resume'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Use "pause" or "resume"'
        });
      }

      const alert = await Alert.findOne({
        _id: alertId,
        userId,
        deletedAt: null
      });

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }

      if (action === 'pause') {
        await alert.pause();
        await this.unscheduleAlert(alertId);
      } else {
        await alert.resume();
        await this.scheduleAlert(alertId);
      }

      logger.info(`Alert ${action}d: ${alert.name}`, {
        userId,
        alertId,
        action
      });

      res.json({
        success: true,
        message: `Alert ${action}d successfully`,
        data: {
          alertId,
          status: alert.status
        }
      });

    } catch (error) {
      logger.error(`Error ${req.body.action}ing alert:`, error);
      res.status(500).json({
        success: false,
        message: `Failed to ${req.body.action} alert`
      });
    }
  }

  /**
   * Test alert (trigger manually)
   */
  async testAlert(req, res) {
    try {
      const { alertId } = req.params;
      const userId = req.user.id;

      const alert = await Alert.findOne({
        _id: alertId,
        userId,
        deletedAt: null
      });

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }

      // Trigger alert manually
      const result = await this.processAlert(alert, true);

      res.json({
        success: true,
        message: 'Alert test completed',
        data: {
          triggered: result.triggered,
          message: result.message,
          sentTo: result.sentTo || [],
          error: result.error
        }
      });

    } catch (error) {
      logger.error('Error testing alert:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to test alert'
      });
    }
  }

  /**
   * Get alert execution history
   */
  async getAlertHistory(req, res) {
    try {
      const { alertId } = req.params;
      const userId = req.user.id;
      const { page = 1, limit = 50, status } = req.query;

      const alert = await Alert.findOne({
        _id: alertId,
        userId,
        deletedAt: null
      });

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found'
        });
      }

      let history = alert.executionHistory;

      // Filter by status if provided
      if (status) {
        history = history.filter(h => h.status === status);
      }

      // Sort by execution time (newest first)
      history.sort((a, b) => b.executedAt - a.executedAt);

      // Paginate
      const skip = (page - 1) * limit;
      const paginatedHistory = history.slice(skip, skip + parseInt(limit));

      res.json({
        success: true,
        data: {
          history: paginatedHistory,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: history.length,
            pages: Math.ceil(history.length / limit)
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching alert history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch alert history'
      });
    }
  }

  /**
   * Get alert statistics
   */
  async getAlertStats(req, res) {
    try {
      const userId = req.user.id;
      const { period = '7d', botId } = req.query;

      const query = { userId, deletedAt: null };
      if (botId) query.botId = botId;

      const stats = await Alert.getStatistics(query, period);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Error fetching alert statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch alert statistics'
      });
    }
  }

  /**
   * Schedule alert for checking
   */
  async scheduleAlert(alertId) {
    try {
      const alert = await Alert.findById(alertId);
      if (!alert || alert.status !== 'active') {
        return;
      }

      // Unschedule existing job if any
      await this.unscheduleAlert(alertId);

      // Create cron expression based on check interval
      const intervalMinutes = alert.triggers.checkInterval;
      const cronExpression = this.createCronExpression(intervalMinutes);

      // Schedule new job
      const job = cron.schedule(cronExpression, async () => {
        await this.processAlert(alert);
      }, {
        scheduled: true,
        timezone: 'UTC'
      });

      this.scheduledJobs.set(alertId.toString(), job);

      logger.debug(`Alert scheduled: ${alertId} (${cronExpression})`);

    } catch (error) {
      logger.error(`Error scheduling alert ${alertId}:`, error);
    }
  }

  /**
   * Unschedule alert
   */
  async unscheduleAlert(alertId) {
    try {
      const job = this.scheduledJobs.get(alertId.toString());
      if (job) {
        job.stop();
        job.destroy();
        this.scheduledJobs.delete(alertId.toString());
        logger.debug(`Alert unscheduled: ${alertId}`);
      }
    } catch (error) {
      logger.error(`Error unscheduling alert ${alertId}:`, error);
    }
  }

  /**
   * Reschedule alert
   */
  async rescheduleAlert(alertId) {
    await this.unscheduleAlert(alertId);
    await this.scheduleAlert(alertId);
  }

  /**
   * Process alert (check conditions and trigger if needed)
   */
  async processAlert(alert, isTest = false) {
    try {
      // Check if alert can be triggered
      if (!isTest && !alert.canTrigger()) {
        return {
          triggered: false,
          message: 'Alert cannot be triggered at this time',
          reason: 'cooldown_or_limit'
        };
      }

      // Check time restrictions
      if (!isTest && !this.isWithinTimeRestrictions(alert.triggers.timeRestrictions)) {
        return {
          triggered: false,
          message: 'Alert is outside time restrictions',
          reason: 'time_restriction'
        };
      }

      // Evaluate alert conditions
      const conditionResult = await this.evaluateConditions(alert);

      if (!conditionResult.met) {
        // Record execution but no trigger
        if (!isTest) {
          await alert.recordExecution({
            status: 'checked',
            conditionsMet: false,
            data: conditionResult.data
          });
        }

        return {
          triggered: false,
          message: 'Conditions not met',
          data: conditionResult.data
        };
      }

      // Conditions met - trigger alert
      const message = this.formatAlertMessage(alert, conditionResult.data);
      const sentTo = [];
      const errors = [];

      // Send to all associated chats
      for (const chatId of alert.chatIds) {
        try {
          const result = await this.sendAlertMessage(alert.botId, chatId, message, alert.messageFormat);
          if (result.success) {
            sentTo.push(chatId);
          } else {
            errors.push({ chatId, error: result.error });
          }
        } catch (error) {
          errors.push({ chatId, error: error.message });
        }
      }

      // Record execution
      if (!isTest) {
        await alert.recordSentAlert({
          message,
          sentTo,
          errors,
          data: conditionResult.data
        });
      }

      // Emit event
      this.emit('alertTriggered', {
        alertId: alert._id,
        userId: alert.userId,
        name: alert.name,
        sentTo,
        errors
      });

      return {
        triggered: true,
        message: 'Alert triggered successfully',
        sentTo,
        errors: errors.length > 0 ? errors : undefined,
        data: conditionResult.data
      };

    } catch (error) {
      logger.error(`Error processing alert ${alert._id}:`, error);
      
      if (!isTest) {
        await alert.recordError(error.message);
      }

      return {
        triggered: false,
        message: 'Error processing alert',
        error: error.message
      };
    }
  }

  /**
   * Evaluate alert conditions
   */
  async evaluateConditions(alert) {
    try {
      const { type, conditions } = alert;
      let data = {};
      let met = false;

      switch (type) {
        case 'price':
          const priceResult = await this.evaluatePriceCondition(conditions.price);
          data = priceResult.data;
          met = priceResult.met;
          break;

        case 'volume':
          const volumeResult = await this.evaluateVolumeCondition(conditions.volume);
          data = volumeResult.data;
          met = volumeResult.met;
          break;

        case 'technical':
          const technicalResult = await this.evaluateTechnicalCondition(conditions.technical);
          data = technicalResult.data;
          met = technicalResult.met;
          break;

        case 'news':
          const newsResult = await this.evaluateNewsCondition(conditions.news);
          data = newsResult.data;
          met = newsResult.met;
          break;

        case 'custom':
          const customResult = await this.evaluateCustomCondition(conditions.custom);
          data = customResult.data;
          met = customResult.met;
          break;

        default:
          throw new Error(`Unknown alert type: ${type}`);
      }

      return { met, data };

    } catch (error) {
      logger.error('Error evaluating conditions:', error);
      return {
        met: false,
        data: { error: error.message }
      };
    }
  }

  /**
   * Evaluate price condition
   */
  async evaluatePriceCondition(condition) {
    // This would integrate with external price APIs
    // For now, return mock data
    const mockPrice = Math.random() * 100 + 50;
    
    const met = this.checkPriceCondition(mockPrice, condition);
    
    return {
      met,
      data: {
        symbol: condition.symbol,
        currentPrice: mockPrice,
        targetPrice: condition.target,
        operator: condition.operator,
        timestamp: new Date()
      }
    };
  }

  /**
   * Evaluate volume condition
   */
  async evaluateVolumeCondition(condition) {
    // This would integrate with external volume APIs
    const mockVolume = Math.random() * 1000000;
    
    const met = this.checkVolumeCondition(mockVolume, condition);
    
    return {
      met,
      data: {
        symbol: condition.symbol,
        currentVolume: mockVolume,
        targetVolume: condition.target,
        operator: condition.operator,
        timeframe: condition.timeframe,
        timestamp: new Date()
      }
    };
  }

  /**
   * Evaluate technical condition
   */
  async evaluateTechnicalCondition(condition) {
    // This would integrate with technical analysis APIs
    const mockValue = Math.random() * 100;
    
    const met = this.checkTechnicalCondition(mockValue, condition);
    
    return {
      met,
      data: {
        symbol: condition.symbol,
        indicator: condition.indicator,
        currentValue: mockValue,
        targetValue: condition.target,
        operator: condition.operator,
        timeframe: condition.timeframe,
        timestamp: new Date()
      }
    };
  }

  /**
   * Evaluate news condition
   */
  async evaluateNewsCondition(condition) {
    // This would integrate with news APIs
    const mockSentiment = Math.random() > 0.5 ? 'positive' : 'negative';
    
    const met = condition.sentiment ? mockSentiment === condition.sentiment : true;
    
    return {
      met,
      data: {
        keywords: condition.keywords,
        sentiment: mockSentiment,
        sources: condition.sources,
        timestamp: new Date()
      }
    };
  }

  /**
   * Evaluate custom condition
   */
  async evaluateCustomCondition(condition) {
    // This would execute custom logic
    const met = Math.random() > 0.7; // Random for demo
    
    return {
      met,
      data: {
        expression: condition.expression,
        variables: condition.variables,
        result: met,
        timestamp: new Date()
      }
    };
  }

  /**
   * Check price condition
   */
  checkPriceCondition(currentPrice, condition) {
    const { operator, target } = condition;
    
    switch (operator) {
      case 'above':
        return currentPrice > target;
      case 'below':
        return currentPrice < target;
      case 'equals':
        return Math.abs(currentPrice - target) < 0.01;
      case 'crosses_above':
        // Would need historical data to implement properly
        return currentPrice > target;
      case 'crosses_below':
        // Would need historical data to implement properly
        return currentPrice < target;
      default:
        return false;
    }
  }

  /**
   * Check volume condition
   */
  checkVolumeCondition(currentVolume, condition) {
    const { operator, target } = condition;
    
    switch (operator) {
      case 'above':
        return currentVolume > target;
      case 'below':
        return currentVolume < target;
      case 'spike':
        // Would need historical data to calculate average
        return currentVolume > target * 2;
      default:
        return false;
    }
  }

  /**
   * Check technical condition
   */
  checkTechnicalCondition(currentValue, condition) {
    const { operator, target } = condition;
    
    switch (operator) {
      case 'above':
        return currentValue > target;
      case 'below':
        return currentValue < target;
      case 'crosses_above':
        return currentValue > target;
      case 'crosses_below':
        return currentValue < target;
      default:
        return false;
    }
  }

  /**
   * Check if current time is within restrictions
   */
  isWithinTimeRestrictions(restrictions) {
    if (!restrictions || Object.keys(restrictions).length === 0) {
      return true;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Check time range
    if (restrictions.startTime && restrictions.endTime) {
      const startHour = parseInt(restrictions.startTime.split(':')[0]);
      const endHour = parseInt(restrictions.endTime.split(':')[0]);
      
      if (startHour <= endHour) {
        if (currentHour < startHour || currentHour >= endHour) {
          return false;
        }
      } else {
        // Overnight range
        if (currentHour < startHour && currentHour >= endHour) {
          return false;
        }
      }
    }

    // Check days of week
    if (restrictions.daysOfWeek && restrictions.daysOfWeek.length > 0) {
      if (!restrictions.daysOfWeek.includes(currentDay)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Format alert message
   */
  formatAlertMessage(alert, data) {
    let message = alert.messageFormat.template;

    // Replace placeholders with actual data
    const replacements = {
      '{alertName}': alert.name,
      '{symbol}': data.symbol || 'N/A',
      '{currentPrice}': data.currentPrice?.toFixed(2) || 'N/A',
      '{targetPrice}': data.targetPrice?.toFixed(2) || 'N/A',
      '{currentVolume}': data.currentVolume?.toLocaleString() || 'N/A',
      '{targetVolume}': data.targetVolume?.toLocaleString() || 'N/A',
      '{indicator}': data.indicator || 'N/A',
      '{currentValue}': data.currentValue?.toFixed(2) || 'N/A',
      '{targetValue}': data.targetValue?.toFixed(2) || 'N/A',
      '{sentiment}': data.sentiment || 'N/A',
      '{timestamp}': new Date().toLocaleString(),
      '{date}': new Date().toLocaleDateString(),
      '{time}': new Date().toLocaleTimeString()
    };

    Object.entries(replacements).forEach(([placeholder, value]) => {
      message = message.replace(new RegExp(placeholder, 'g'), value);
    });

    return message;
  }

  /**
   * Send alert message
   */
  async sendAlertMessage(botId, chatId, message, messageFormat) {
    try {
      // This would integrate with TelegramController
      // For now, create a mock message record
      const messageRecord = new Message({
        messageId: generateId(),
        botId,
        chatId,
        direction: 'outbound',
        messageType: 'alert',
        content: {
          text: message,
          entities: []
        },
        parseMode: messageFormat.parseMode,
        status: 'sent',
        delivery: {
          sentAt: new Date(),
          deliveredAt: new Date()
        },
        analytics: {
          source: 'alert',
          tags: ['automated']
        }
      });

      await messageRecord.save();

      return {
        success: true,
        messageId: messageRecord._id
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get default message template for alert type
   */
  getDefaultTemplate(type) {
    const templates = {
      price: '🚨 *{alertName}*\n\n📊 Symbol: `{symbol}`\n💰 Current Price: `${currentPrice}`\n🎯 Target Price: `${targetPrice}`\n\n⏰ {timestamp}',
      volume: '📈 *{alertName}*\n\n📊 Symbol: `{symbol}`\n📊 Current Volume: `{currentVolume}`\n🎯 Target Volume: `{targetVolume}`\n\n⏰ {timestamp}',
      technical: '📊 *{alertName}*\n\n📈 Symbol: `{symbol}`\n🔍 Indicator: `{indicator}`\n📊 Current Value: `{currentValue}`\n🎯 Target Value: `{targetValue}`\n\n⏰ {timestamp}',
      news: '📰 *{alertName}*\n\n📊 Sentiment: `{sentiment}`\n\n⏰ {timestamp}',
      custom: '⚡ *{alertName}*\n\n✅ Custom condition triggered\n\n⏰ {timestamp}'
    };

    return templates[type] || templates.custom;
  }

  /**
   * Create cron expression from interval minutes
   */
  createCronExpression(intervalMinutes) {
    if (intervalMinutes < 1) {
      return '* * * * *'; // Every minute
    } else if (intervalMinutes === 1) {
      return '* * * * *'; // Every minute
    } else if (intervalMinutes < 60) {
      return `*/${intervalMinutes} * * * *`; // Every N minutes
    } else {
      const hours = Math.floor(intervalMinutes / 60);
      return `0 */${hours} * * *`; // Every N hours
    }
  }

  /**
   * Initialize all active alerts on startup
   */
  async initializeAllAlerts() {
    try {
      const activeAlerts = await Alert.find({
        status: 'active',
        deletedAt: null
      });

      logger.info(`Initializing ${activeAlerts.length} active alerts...`);

      for (const alert of activeAlerts) {
        await this.scheduleAlert(alert._id);
      }

      logger.info('All active alerts initialized');
    } catch (error) {
      logger.error('Error initializing alerts:', error);
    }
  }

  /**
   * Stop all alerts on shutdown
   */
  async stopAllAlerts() {
    try {
      logger.info('Stopping all alerts...');
      
      for (const [alertId] of this.scheduledJobs) {
        await this.unscheduleAlert(alertId);
      }
      
      logger.info('All alerts stopped');
    } catch (error) {
      logger.error('Error stopping alerts:', error);
    }
  }
}

module.exports = AlertController;