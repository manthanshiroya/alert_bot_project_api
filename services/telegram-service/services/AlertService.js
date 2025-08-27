const { Alert, Bot, Chat } = require('../models');
const { logger } = require('../utils');
const { formatMessage, validateAlertCondition, parseCronExpression } = require('../utils/helpers');
const TelegramService = require('./TelegramService');

class AlertService {
  constructor(telegramService) {
    this.telegramService = telegramService;
    this.activeAlerts = new Map(); // Store active alert timers
    this.alertQueue = []; // Queue for processing alerts
    this.isProcessing = false;
    this.processingInterval = null;
  }

  /**
   * Initialize the alert service
   */
  async initialize() {
    try {
      logger.info('Initializing Alert Service');
      
      // Load active alerts from database
      const activeAlerts = await Alert.find({ 
        status: 'active',
        isPaused: false 
      });
      
      logger.info(`Found ${activeAlerts.length} active alerts`);
      
      // Start alert processing
      this.startProcessing();
      
      logger.info('Alert Service initialized');
    } catch (error) {
      logger.error('Failed to initialize Alert Service:', error);
      throw error;
    }
  }

  /**
   * Create a new alert
   */
  async createAlert(userId, alertData) {
    try {
      const {
        name,
        description,
        type,
        conditions,
        chatId,
        botId,
        messageTemplate,
        schedule,
        cooldownMinutes,
        maxTriggers,
        tags
      } = alertData;

      // Validate bot ownership
      const bot = await Bot.findOne({ _id: botId, userId });
      if (!bot) {
        throw new Error('Bot not found or not owned by user');
      }

      // Validate chat exists
      const chat = await Chat.findOne({ botId, chatId });
      if (!chat) {
        throw new Error('Chat not found for this bot');
      }

      // Validate alert conditions
      if (!validateAlertCondition(type, conditions)) {
        throw new Error('Invalid alert conditions');
      }

      // Validate schedule if provided
      if (schedule && !parseCronExpression(schedule)) {
        throw new Error('Invalid schedule format');
      }

      // Create alert
      const alert = new Alert({
        userId,
        botId,
        chatId,
        name,
        description,
        type,
        conditions,
        messageTemplate,
        schedule,
        cooldownMinutes: cooldownMinutes || 5,
        maxTriggers: maxTriggers || 0, // 0 = unlimited
        tags: tags || [],
        status: 'active',
        isPaused: false,
        triggerCount: 0,
        lastTriggered: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await alert.save();

      logger.info(`Alert created: ${alert._id} by user ${userId}`);
      
      return alert;
    } catch (error) {
      logger.error('Failed to create alert:', error);
      throw error;
    }
  }

  /**
   * Update an existing alert
   */
  async updateAlert(alertId, userId, updateData) {
    try {
      const alert = await Alert.findOne({ _id: alertId, userId });
      
      if (!alert) {
        throw new Error('Alert not found');
      }

      // Validate conditions if being updated
      if (updateData.conditions && !validateAlertCondition(updateData.type || alert.type, updateData.conditions)) {
        throw new Error('Invalid alert conditions');
      }

      // Validate schedule if being updated
      if (updateData.schedule && !parseCronExpression(updateData.schedule)) {
        throw new Error('Invalid schedule format');
      }

      // Update allowed fields
      const allowedFields = [
        'name', 'description', 'conditions', 'messageTemplate', 
        'schedule', 'cooldownMinutes', 'maxTriggers', 'tags', 'isPaused'
      ];
      
      const updates = {};
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updates[field] = updateData[field];
        }
      }

      updates.updatedAt = new Date();

      // Update database
      Object.assign(alert, updates);
      await alert.save();

      logger.info(`Alert updated: ${alertId}`);
      
      return alert;
    } catch (error) {
      logger.error('Failed to update alert:', error);
      throw error;
    }
  }

  /**
   * Delete an alert
   */
  async deleteAlert(alertId, userId) {
    try {
      const alert = await Alert.findOne({ _id: alertId, userId });
      
      if (!alert) {
        throw new Error('Alert not found');
      }

      // Remove from active alerts if running
      this.stopAlert(alertId);

      // Delete from database
      await Alert.deleteOne({ _id: alertId });

      logger.info(`Alert deleted: ${alertId}`);
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete alert:', error);
      throw error;
    }
  }

  /**
   * Toggle alert pause status
   */
  async toggleAlert(alertId, userId, isPaused) {
    try {
      const alert = await Alert.findOne({ _id: alertId, userId });
      
      if (!alert) {
        throw new Error('Alert not found');
      }

      alert.isPaused = isPaused;
      alert.updatedAt = new Date();
      await alert.save();

      if (isPaused) {
        this.stopAlert(alertId);
        logger.info(`Alert paused: ${alertId}`);
      } else {
        logger.info(`Alert resumed: ${alertId}`);
      }
      
      return alert;
    } catch (error) {
      logger.error('Failed to toggle alert:', error);
      throw error;
    }
  }

  /**
   * Test an alert by sending a test message
   */
  async testAlert(alertId, userId) {
    try {
      const alert = await Alert.findOne({ _id: alertId, userId });
      
      if (!alert) {
        throw new Error('Alert not found');
      }

      // Create test alert data
      const testData = this.generateTestData(alert.type, alert.conditions);
      
      // Format test message
      const message = this.formatAlertMessage(alert, testData, true);
      
      // Send test message
      await this.telegramService.sendMessage(alert.botId, alert.chatId, {
        text: message,
        parseMode: 'HTML'
      });

      logger.info(`Test alert sent: ${alertId}`);
      
      return { success: true, message: 'Test alert sent successfully' };
    } catch (error) {
      logger.error('Failed to test alert:', error);
      throw error;
    }
  }

  /**
   * Process alert trigger from external service
   */
  async processAlertTrigger(alertData) {
    try {
      const { alertId, triggerData, timestamp } = alertData;
      
      const alert = await Alert.findById(alertId);
      
      if (!alert) {
        logger.warn(`Alert not found for trigger: ${alertId}`);
        return;
      }

      // Check if alert is active and not paused
      if (alert.status !== 'active' || alert.isPaused) {
        logger.debug(`Skipping trigger for inactive/paused alert: ${alertId}`);
        return;
      }

      // Check cooldown period
      if (alert.lastTriggered) {
        const cooldownMs = alert.cooldownMinutes * 60 * 1000;
        const timeSinceLastTrigger = Date.now() - alert.lastTriggered.getTime();
        
        if (timeSinceLastTrigger < cooldownMs) {
          logger.debug(`Alert in cooldown period: ${alertId}`);
          return;
        }
      }

      // Check max triggers limit
      if (alert.maxTriggers > 0 && alert.triggerCount >= alert.maxTriggers) {
        logger.info(`Alert reached max triggers limit: ${alertId}`);
        alert.status = 'completed';
        await alert.save();
        return;
      }

      // Add to processing queue
      this.alertQueue.push({
        alert,
        triggerData,
        timestamp: timestamp || new Date()
      });

      logger.debug(`Alert queued for processing: ${alertId}`);
    } catch (error) {
      logger.error('Failed to process alert trigger:', error);
    }
  }

  /**
   * Start alert processing loop
   */
  startProcessing() {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(async () => {
      if (this.isProcessing || this.alertQueue.length === 0) {
        return;
      }

      this.isProcessing = true;
      
      try {
        while (this.alertQueue.length > 0) {
          const alertItem = this.alertQueue.shift();
          await this.processQueuedAlert(alertItem);
        }
      } catch (error) {
        logger.error('Error processing alert queue:', error);
      } finally {
        this.isProcessing = false;
      }
    }, 1000); // Process every second

    logger.info('Alert processing started');
  }

  /**
   * Stop alert processing
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('Alert processing stopped');
    }
  }

  /**
   * Process a queued alert
   */
  async processQueuedAlert(alertItem) {
    try {
      const { alert, triggerData, timestamp } = alertItem;
      
      // Format alert message
      const message = this.formatAlertMessage(alert, triggerData);
      
      // Send alert message
      await this.telegramService.sendMessage(alert.botId, alert.chatId, {
        text: message,
        parseMode: 'HTML'
      });

      // Update alert statistics
      alert.triggerCount += 1;
      alert.lastTriggered = timestamp;
      alert.updatedAt = new Date();
      await alert.save();

      logger.info(`Alert triggered: ${alert._id} (${alert.triggerCount} times)`);
    } catch (error) {
      logger.error(`Failed to process queued alert ${alertItem.alert._id}:`, error);
    }
  }

  /**
   * Format alert message
   */
  formatAlertMessage(alert, triggerData, isTest = false) {
    try {
      const prefix = isTest ? '🧪 <b>TEST ALERT</b>\n\n' : '🚨 <b>ALERT TRIGGERED</b>\n\n';
      
      let message = prefix;
      
      // Use custom template if provided
      if (alert.messageTemplate) {
        message += formatMessage(alert.messageTemplate, {
          ...triggerData,
          alertName: alert.name,
          alertType: alert.type,
          timestamp: new Date().toISOString()
        });
      } else {
        // Default message format based on alert type
        message += this.getDefaultMessage(alert, triggerData);
      }
      
      // Add footer
      message += `\n\n📊 <i>Alert: ${alert.name}</i>`;
      if (isTest) {
        message += '\n🔧 <i>This is a test message</i>';
      }
      
      return message;
    } catch (error) {
      logger.error('Failed to format alert message:', error);
      return `Alert: ${alert.name}\nError formatting message: ${error.message}`;
    }
  }

  /**
   * Get default message format for alert type
   */
  getDefaultMessage(alert, triggerData) {
    switch (alert.type) {
      case 'price':
        return this.formatPriceAlert(alert, triggerData);
      case 'volume':
        return this.formatVolumeAlert(alert, triggerData);
      case 'technical':
        return this.formatTechnicalAlert(alert, triggerData);
      case 'news':
        return this.formatNewsAlert(alert, triggerData);
      default:
        return this.formatGenericAlert(alert, triggerData);
    }
  }

  /**
   * Format price alert message
   */
  formatPriceAlert(alert, triggerData) {
    const { symbol, price, change, changePercent } = triggerData;
    const { operator, value } = alert.conditions;
    
    return `💰 <b>${symbol}</b> Price Alert\n\n` +
           `Current Price: <b>$${price}</b>\n` +
           `Condition: Price ${operator} $${value}\n` +
           `Change: ${change >= 0 ? '📈' : '📉'} ${change} (${changePercent}%)\n` +
           `Time: ${new Date().toLocaleString()}`;
  }

  /**
   * Format volume alert message
   */
  formatVolumeAlert(alert, triggerData) {
    const { symbol, volume, averageVolume } = triggerData;
    const { operator, value } = alert.conditions;
    
    return `📊 <b>${symbol}</b> Volume Alert\n\n` +
           `Current Volume: <b>${volume}</b>\n` +
           `Condition: Volume ${operator} ${value}\n` +
           `Average Volume: ${averageVolume}\n` +
           `Time: ${new Date().toLocaleString()}`;
  }

  /**
   * Format technical alert message
   */
  formatTechnicalAlert(alert, triggerData) {
    const { symbol, indicator, value } = triggerData;
    const { indicatorType, operator, threshold } = alert.conditions;
    
    return `📈 <b>${symbol}</b> Technical Alert\n\n` +
           `Indicator: <b>${indicatorType}</b>\n` +
           `Current Value: ${value}\n` +
           `Condition: ${indicatorType} ${operator} ${threshold}\n` +
           `Time: ${new Date().toLocaleString()}`;
  }

  /**
   * Format news alert message
   */
  formatNewsAlert(alert, triggerData) {
    const { title, summary, source, url } = triggerData;
    
    return `📰 <b>News Alert</b>\n\n` +
           `<b>${title}</b>\n\n` +
           `${summary}\n\n` +
           `Source: ${source}\n` +
           `<a href="${url}">Read More</a>`;
  }

  /**
   * Format generic alert message
   */
  formatGenericAlert(alert, triggerData) {
    return `⚡ <b>${alert.name}</b>\n\n` +
           `Type: ${alert.type}\n` +
           `Data: ${JSON.stringify(triggerData, null, 2)}\n` +
           `Time: ${new Date().toLocaleString()}`;
  }

  /**
   * Generate test data for alert testing
   */
  generateTestData(alertType, conditions) {
    switch (alertType) {
      case 'price':
        return {
          symbol: conditions.symbol || 'BTCUSDT',
          price: '45000.00',
          change: '1250.00',
          changePercent: '+2.85%'
        };
      case 'volume':
        return {
          symbol: conditions.symbol || 'BTCUSDT',
          volume: '1,250,000',
          averageVolume: '850,000'
        };
      case 'technical':
        return {
          symbol: conditions.symbol || 'BTCUSDT',
          indicator: conditions.indicatorType || 'RSI',
          value: '75.5'
        };
      case 'news':
        return {
          title: 'Test News Alert',
          summary: 'This is a test news alert to verify the alert system is working correctly.',
          source: 'Test Source',
          url: 'https://example.com'
        };
      default:
        return {
          message: 'Test alert data',
          timestamp: new Date().toISOString()
        };
    }
  }

  /**
   * Get user alerts with pagination
   */
  async getUserAlerts(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        type,
        botId,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      const query = { userId };
      
      if (status) query.status = status;
      if (type) query.type = type;
      if (botId) query.botId = botId;

      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
      const skip = (page - 1) * limit;

      const [alerts, total] = await Promise.all([
        Alert.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('botId', 'name username')
          .lean(),
        Alert.countDocuments(query)
      ]);

      return {
        alerts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get user alerts:', error);
      throw error;
    }
  }

  /**
   * Get alert statistics
   */
  async getAlertStats(userId, botId = null) {
    try {
      const query = { userId };
      if (botId) query.botId = botId;

      const [totalAlerts, activeAlerts, pausedAlerts, triggeredToday] = await Promise.all([
        Alert.countDocuments(query),
        Alert.countDocuments({ ...query, status: 'active', isPaused: false }),
        Alert.countDocuments({ ...query, isPaused: true }),
        Alert.countDocuments({
          ...query,
          lastTriggered: {
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        })
      ]);

      return {
        totalAlerts,
        activeAlerts,
        pausedAlerts,
        triggeredToday
      };
    } catch (error) {
      logger.error('Failed to get alert stats:', error);
      throw error;
    }
  }

  /**
   * Stop a specific alert
   */
  stopAlert(alertId) {
    const timer = this.activeAlerts.get(alertId);
    if (timer) {
      clearTimeout(timer);
      this.activeAlerts.delete(alertId);
    }
  }

  /**
   * Bulk operations
   */
  async bulkPauseAlerts(userId, alertIds) {
    try {
      const result = await Alert.updateMany(
        { _id: { $in: alertIds }, userId },
        { isPaused: true, updatedAt: new Date() }
      );

      logger.info(`Bulk paused ${result.modifiedCount} alerts for user ${userId}`);
      return { modifiedCount: result.modifiedCount };
    } catch (error) {
      logger.error('Failed to bulk pause alerts:', error);
      throw error;
    }
  }

  async bulkResumeAlerts(userId, alertIds) {
    try {
      const result = await Alert.updateMany(
        { _id: { $in: alertIds }, userId },
        { isPaused: false, updatedAt: new Date() }
      );

      logger.info(`Bulk resumed ${result.modifiedCount} alerts for user ${userId}`);
      return { modifiedCount: result.modifiedCount };
    } catch (error) {
      logger.error('Failed to bulk resume alerts:', error);
      throw error;
    }
  }

  async bulkDeleteAlerts(userId, alertIds) {
    try {
      // Stop all alerts first
      alertIds.forEach(alertId => this.stopAlert(alertId));
      
      const result = await Alert.deleteMany({
        _id: { $in: alertIds },
        userId
      });

      logger.info(`Bulk deleted ${result.deletedCount} alerts for user ${userId}`);
      return { deletedCount: result.deletedCount };
    } catch (error) {
      logger.error('Failed to bulk delete alerts:', error);
      throw error;
    }
  }

  /**
   * Shutdown service
   */
  async shutdown() {
    try {
      logger.info('Shutting down Alert Service');
      
      // Stop processing
      this.stopProcessing();
      
      // Clear active alerts
      for (const timer of this.activeAlerts.values()) {
        clearTimeout(timer);
      }
      this.activeAlerts.clear();
      
      // Clear queue
      this.alertQueue = [];
      
      logger.info('Alert Service shutdown complete');
    } catch (error) {
      logger.error('Error during Alert Service shutdown:', error);
    }
  }
}

module.exports = AlertService;