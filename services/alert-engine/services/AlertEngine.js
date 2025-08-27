const EventEmitter = require('events');
const { Alert, MarketData } = require('../models');
const { cache, pubsub } = require('../config/database');
const { logger, alertLogger, performanceLogger, alertHelpers, utils, dateHelpers } = require('../utils');

class AlertEngine extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.processingQueue = [];
    this.activeWorkers = 0;
    this.maxWorkers = parseInt(process.env.QUEUE_CONCURRENCY) || 5;
    this.batchSize = parseInt(process.env.ALERT_BATCH_SIZE) || 100;
    this.processingInterval = parseInt(process.env.ALERT_PROCESSING_INTERVAL) || 5000;
    this.maxRetries = parseInt(process.env.ALERT_MAX_RETRIES) || 3;
    this.retryDelay = parseInt(process.env.ALERT_RETRY_DELAY) || 1000;
    this.conditionTimeout = parseInt(process.env.CONDITION_EVALUATION_TIMEOUT) || 5000;
    this.cooldownPeriod = parseInt(process.env.ALERT_COOLDOWN_PERIOD) || 300000;
    
    this.stats = {
      totalProcessed: 0,
      successfulTriggers: 0,
      failedTriggers: 0,
      averageProcessingTime: 0,
      lastProcessingTime: null,
      queueSize: 0,
      activeWorkers: 0
    };
    
    this.intervalId = null;
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.on('alert:triggered', this.handleAlertTriggered.bind(this));
    this.on('alert:failed', this.handleAlertFailed.bind(this));
    this.on('market:updated', this.handleMarketUpdate.bind(this));
    this.on('error', this.handleError.bind(this));
  }

  /**
   * Initialize the alert engine
   */
  async initialize() {
    try {
      logger.info('Initializing Alert Engine...');
      
      // Subscribe to market data updates
      await this.subscribeToMarketUpdates();
      
      // Load active alerts into cache
      await this.loadActiveAlerts();
      
      // Start processing loop
      this.start();
      
      logger.info('Alert Engine initialized successfully');
      this.emit('engine:initialized');
    } catch (error) {
      logger.error('Failed to initialize Alert Engine:', error);
      throw error;
    }
  }

  /**
   * Start the alert engine
   */
  start() {
    if (this.isRunning) {
      logger.warn('Alert Engine is already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.processAlerts().catch(error => {
        logger.error('Error in alert processing loop:', error);
      });
    }, this.processingInterval);

    logger.info('Alert Engine started');
    this.emit('engine:started');
  }

  /**
   * Stop the alert engine
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Wait for active workers to finish
    while (this.activeWorkers > 0) {
      await utils.sleep(100);
    }

    logger.info('Alert Engine stopped');
    this.emit('engine:stopped');
  }

  /**
   * Subscribe to market data updates
   */
  async subscribeToMarketUpdates() {
    try {
      await pubsub.subscribe('market:price_update', (data) => {
        this.emit('market:updated', data);
      });
      
      await pubsub.subscribe('market:volume_update', (data) => {
        this.emit('market:updated', data);
      });
      
      logger.info('Subscribed to market data updates');
    } catch (error) {
      logger.error('Failed to subscribe to market updates:', error);
    }
  }

  /**
   * Load active alerts into cache
   */
  async loadActiveAlerts() {
    try {
      const alerts = await Alert.findActiveAlerts(1000);
      
      for (const alert of alerts) {
        await this.cacheAlert(alert);
      }
      
      logger.info(`Loaded ${alerts.length} active alerts into cache`);
    } catch (error) {
      logger.error('Failed to load active alerts:', error);
    }
  }

  /**
   * Cache alert for quick access
   */
  async cacheAlert(alert) {
    const cacheKey = `alert:${alert._id}`;
    const alertData = {
      id: alert._id.toString(),
      userId: alert.userId.toString(),
      symbol: alert.symbol,
      type: alert.type,
      conditions: alert.conditions,
      logicalOperator: alert.logicalOperator,
      priority: alert.priority,
      nextCheck: alert.nextCheck,
      cooldownPeriod: alert.cooldownPeriod,
      lastTriggered: alert.lastTriggered,
      notificationChannels: alert.notificationChannels
    };
    
    await cache.set(cacheKey, alertData, 3600); // Cache for 1 hour
  }

  /**
   * Process alerts in batches
   */
  async processAlerts() {
    if (this.activeWorkers >= this.maxWorkers) {
      return;
    }

    const timer = performanceLogger.start('alert_processing_batch');
    
    try {
      // Get alerts ready for processing
      const alerts = await this.getAlertsToProcess();
      
      if (alerts.length === 0) {
        return;
      }

      logger.debug(`Processing ${alerts.length} alerts`);
      
      // Process alerts in parallel with worker limit
      const workers = [];
      for (let i = 0; i < Math.min(alerts.length, this.maxWorkers - this.activeWorkers); i++) {
        const alert = alerts[i];
        workers.push(this.processAlert(alert));
      }

      await Promise.allSettled(workers);
      
      this.stats.lastProcessingTime = new Date();
      
    } catch (error) {
      logger.error('Error in processAlerts:', error);
    } finally {
      timer.end();
    }
  }

  /**
   * Get alerts that are ready for processing
   */
  async getAlertsToProcess() {
    try {
      const now = new Date();
      const alerts = await Alert.find({
        isActive: true,
        isPaused: false,
        nextCheck: { $lte: now },
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: { $gt: now } }
        ]
      })
      .sort({ priority: -1, nextCheck: 1 })
      .limit(this.batchSize);

      return alerts;
    } catch (error) {
      logger.error('Error getting alerts to process:', error);
      return [];
    }
  }

  /**
   * Process a single alert
   */
  async processAlert(alert) {
    this.activeWorkers++;
    const timer = performanceLogger.start('alert_processing_single', { alertId: alert._id });
    
    try {
      // Check if alert is in cooldown
      if (alertHelpers.isInCooldown(alert, alert.cooldownPeriod)) {
        alertLogger.cooldown(alert._id, alert.userId, 
          new Date(alert.lastTriggered.getTime() + alert.cooldownPeriod));
        return;
      }

      // Get current market data
      const marketData = await this.getMarketData(alert.symbol, alert.exchange);
      if (!marketData) {
        throw new Error(`Market data not available for ${alert.symbol}`);
      }

      // Evaluate alert conditions
      const conditionResult = await this.evaluateConditions(alert, marketData);
      
      if (conditionResult.triggered) {
        await this.triggerAlert(alert, marketData, conditionResult);
      } else {
        // Update next check time
        alert.updateNextCheck();
        await alert.save();
      }

      this.stats.totalProcessed++;
      
    } catch (error) {
      logger.error(`Error processing alert ${alert._id}:`, error);
      await this.handleAlertProcessingError(alert, error);
    } finally {
      this.activeWorkers--;
      const duration = timer.end();
      
      // Update average processing time
      this.stats.averageProcessingTime = 
        (this.stats.averageProcessingTime + duration) / 2;
    }
  }

  /**
   * Get market data for symbol
   */
  async getMarketData(symbol, exchange = 'BINANCE') {
    try {
      // Try cache first
      const cacheKey = `market:${symbol}:${exchange}`;
      let marketData = await cache.get(cacheKey);
      
      if (!marketData) {
        // Get from database
        marketData = await MarketData.findBySymbol(symbol, exchange);
        
        if (marketData) {
          // Cache for 1 minute
          await cache.set(cacheKey, marketData.toObject(), 60);
        }
      }
      
      return marketData;
    } catch (error) {
      logger.error(`Error getting market data for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Evaluate alert conditions
   */
  async evaluateConditions(alert, marketData) {
    const timer = performanceLogger.start('condition_evaluation', { alertId: alert._id });
    
    try {
      const results = [];
      
      for (const condition of alert.conditions) {
        const result = await this.evaluateCondition(condition, marketData, alert);
        results.push(result);
      }
      
      // Apply logical operator
      let triggered = false;
      if (alert.logicalOperator === 'AND') {
        triggered = results.every(result => result.satisfied);
      } else if (alert.logicalOperator === 'OR') {
        triggered = results.some(result => result.satisfied);
      }
      
      return {
        triggered,
        results,
        evaluatedAt: new Date(),
        marketData: {
          price: marketData.currentPrice,
          volume: marketData.volume,
          change: marketData.priceChange,
          changePercent: marketData.priceChangePercent
        }
      };
      
    } catch (error) {
      logger.error(`Error evaluating conditions for alert ${alert._id}:`, error);
      throw error;
    } finally {
      timer.end();
    }
  }

  /**
   * Evaluate a single condition
   */
  async evaluateCondition(condition, marketData, alert) {
    try {
      let currentValue;
      
      // Get current value based on condition field
      switch (condition.field) {
        case 'price':
          currentValue = marketData.currentPrice;
          break;
        case 'volume':
          currentValue = marketData.volume;
          break;
        case 'change':
          currentValue = marketData.priceChange;
          break;
        case 'changePercent':
          currentValue = marketData.priceChangePercent;
          break;
        case 'marketCap':
          currentValue = marketData.marketCap;
          break;
        case 'custom':
          currentValue = await this.evaluateCustomCondition(condition, marketData, alert);
          break;
        default:
          throw new Error(`Unsupported condition field: ${condition.field}`);
      }
      
      // Evaluate condition
      let satisfied = false;
      const targetValue = parseFloat(condition.value);
      
      switch (condition.operator) {
        case '>':
          satisfied = currentValue > targetValue;
          break;
        case '<':
          satisfied = currentValue < targetValue;
          break;
        case '>=':
          satisfied = currentValue >= targetValue;
          break;
        case '<=':
          satisfied = currentValue <= targetValue;
          break;
        case '==':
          satisfied = Math.abs(currentValue - targetValue) < 0.0001;
          break;
        case '!=':
          satisfied = Math.abs(currentValue - targetValue) >= 0.0001;
          break;
        case 'crosses_above':
          satisfied = await this.evaluateCrossCondition(condition, currentValue, targetValue, 'above', alert);
          break;
        case 'crosses_below':
          satisfied = await this.evaluateCrossCondition(condition, currentValue, targetValue, 'below', alert);
          break;
        case 'between':
          const secondValue = parseFloat(condition.secondValue);
          satisfied = currentValue >= Math.min(targetValue, secondValue) && 
                     currentValue <= Math.max(targetValue, secondValue);
          break;
        case 'not_between':
          const secondVal = parseFloat(condition.secondValue);
          satisfied = currentValue < Math.min(targetValue, secondVal) || 
                     currentValue > Math.max(targetValue, secondVal);
          break;
        default:
          throw new Error(`Unsupported condition operator: ${condition.operator}`);
      }
      
      return {
        field: condition.field,
        operator: condition.operator,
        targetValue,
        currentValue,
        satisfied,
        evaluatedAt: new Date()
      };
      
    } catch (error) {
      logger.error('Error evaluating condition:', error);
      throw error;
    }
  }

  /**
   * Evaluate custom condition using technical indicators or custom script
   */
  async evaluateCustomCondition(condition, marketData, alert) {
    try {
      if (alert.technicalIndicator) {
        return await this.evaluateTechnicalIndicator(alert.technicalIndicator, marketData);
      }
      
      if (alert.customScript) {
        return await this.evaluateCustomScript(alert.customScript, marketData);
      }
      
      throw new Error('No custom condition logic defined');
    } catch (error) {
      logger.error('Error evaluating custom condition:', error);
      return 0;
    }
  }

  /**
   * Evaluate technical indicator
   */
  async evaluateTechnicalIndicator(indicator, marketData) {
    try {
      const { type, period, source } = indicator;
      
      if (!marketData.technicalIndicators) {
        throw new Error('Technical indicators not available');
      }
      
      const indicators = marketData.technicalIndicators;
      
      switch (type) {
        case 'sma':
          return indicators.sma?.get(period.toString()) || 0;
        case 'ema':
          return indicators.ema?.get(period.toString()) || 0;
        case 'rsi':
          return indicators.rsi?.get(period.toString()) || 0;
        case 'macd':
          return indicators.macd?.macd || 0;
        case 'bollinger':
          return indicators.bollinger?.middle || 0;
        case 'stochastic':
          return indicators.stochastic?.k || 0;
        case 'williams':
          return indicators.williams || 0;
        case 'atr':
          return indicators.atr || 0;
        case 'adx':
          return indicators.adx?.adx || 0;
        default:
          throw new Error(`Unsupported technical indicator: ${type}`);
      }
    } catch (error) {
      logger.error('Error evaluating technical indicator:', error);
      return 0;
    }
  }

  /**
   * Evaluate custom script (simplified version)
   */
  async evaluateCustomScript(script, marketData) {
    try {
      // This is a simplified implementation
      // In production, you might want to use a sandboxed JavaScript engine
      const context = {
        price: marketData.currentPrice,
        volume: marketData.volume,
        change: marketData.priceChange,
        changePercent: marketData.priceChangePercent,
        marketCap: marketData.marketCap,
        Math: Math
      };
      
      // Simple expression evaluation (be very careful with security)
      const result = Function('context', `with(context) { return ${script}; }`)(context);
      return parseFloat(result) || 0;
    } catch (error) {
      logger.error('Error evaluating custom script:', error);
      return 0;
    }
  }

  /**
   * Evaluate cross condition (crosses above/below)
   */
  async evaluateCrossCondition(condition, currentValue, targetValue, direction, alert) {
    try {
      // Get previous value from cache or database
      const cacheKey = `alert:${alert._id}:previous_value`;
      const previousValue = await cache.get(cacheKey);
      
      // Store current value for next evaluation
      await cache.set(cacheKey, currentValue, 3600);
      
      if (previousValue === null) {
        return false; // Need at least one previous value
      }
      
      if (direction === 'above') {
        return previousValue <= targetValue && currentValue > targetValue;
      } else {
        return previousValue >= targetValue && currentValue < targetValue;
      }
    } catch (error) {
      logger.error('Error evaluating cross condition:', error);
      return false;
    }
  }

  /**
   * Trigger an alert
   */
  async triggerAlert(alert, marketData, conditionResult) {
    const timer = performanceLogger.start('alert_trigger', { alertId: alert._id });
    
    try {
      // Record the trigger
      const execution = alert.trigger(marketData.currentPrice, conditionResult.marketData);
      execution.processingTime = timer.end();
      
      // Save alert with updated trigger information
      await alert.save();
      
      // Send notifications
      await this.sendNotifications(alert, marketData, conditionResult);
      
      // Update cache
      await this.cacheAlert(alert);
      
      // Emit event
      this.emit('alert:triggered', {
        alert,
        marketData,
        conditionResult,
        execution
      });
      
      this.stats.successfulTriggers++;
      
      alertLogger.triggered(alert._id, alert.userId, {
        symbol: alert.symbol,
        currentValue: marketData.currentPrice,
        targetValue: conditionResult.results[0]?.targetValue,
        condition: conditionResult.results[0]?.operator
      });
      
    } catch (error) {
      logger.error(`Error triggering alert ${alert._id}:`, error);
      
      // Record failure
      alert.recordFailure(error, timer.end());
      await alert.save();
      
      this.emit('alert:failed', { alert, error });
      this.stats.failedTriggers++;
      
      throw error;
    }
  }

  /**
   * Send notifications for triggered alert
   */
  async sendNotifications(alert, marketData, conditionResult) {
    try {
      const notifications = [];
      
      // Telegram notification
      if (alert.notificationChannels?.telegram?.enabled) {
        notifications.push(this.sendTelegramNotification(alert, marketData, conditionResult));
      }
      
      // Webhook notification
      if (alert.notificationChannels?.webhook?.enabled) {
        notifications.push(this.sendWebhookNotification(alert, marketData, conditionResult));
      }
      
      // Email notification
      if (alert.notificationChannels?.email?.enabled) {
        notifications.push(this.sendEmailNotification(alert, marketData, conditionResult));
      }
      
      await Promise.allSettled(notifications);
      
    } catch (error) {
      logger.error('Error sending notifications:', error);
    }
  }

  /**
   * Send Telegram notification
   */
  async sendTelegramNotification(alert, marketData, conditionResult) {
    try {
      const message = alertHelpers.generateAlertMessage(alert, marketData.currentPrice, conditionResult.marketData);
      
      // Publish to Telegram service
      await pubsub.publish('telegram:send_message', {
        userId: alert.userId,
        chatId: alert.notificationChannels.telegram.chatId,
        message,
        alertId: alert._id
      });
      
      logger.debug(`Telegram notification sent for alert ${alert._id}`);
    } catch (error) {
      logger.error('Error sending Telegram notification:', error);
    }
  }

  /**
   * Send webhook notification
   */
  async sendWebhookNotification(alert, marketData, conditionResult) {
    try {
      const payload = {
        alertId: alert._id,
        userId: alert.userId,
        symbol: alert.symbol,
        type: alert.type,
        currentValue: marketData.currentPrice,
        conditions: conditionResult.results,
        marketData: conditionResult.marketData,
        triggeredAt: new Date().toISOString(),
        ...alert.notificationChannels.webhook.payload
      };
      
      // Publish to webhook service
      await pubsub.publish('webhook:send', {
        url: alert.notificationChannels.webhook.url,
        headers: alert.notificationChannels.webhook.headers,
        payload
      });
      
      logger.debug(`Webhook notification sent for alert ${alert._id}`);
    } catch (error) {
      logger.error('Error sending webhook notification:', error);
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(alert, marketData, conditionResult) {
    try {
      const subject = alert.notificationChannels.email.subject || 
        `Alert Triggered: ${alert.symbol} - ${alert.name}`;
      
      const message = alertHelpers.generateAlertMessage(alert, marketData.currentPrice, conditionResult.marketData);
      
      // Publish to email service
      await pubsub.publish('email:send', {
        to: alert.notificationChannels.email.address,
        subject,
        message,
        template: alert.notificationChannels.email.template,
        alertId: alert._id
      });
      
      logger.debug(`Email notification sent for alert ${alert._id}`);
    } catch (error) {
      logger.error('Error sending email notification:', error);
    }
  }

  /**
   * Handle alert processing error
   */
  async handleAlertProcessingError(alert, error) {
    try {
      // Record failure
      alert.recordFailure(error);
      
      // Update next check time with exponential backoff
      const baseDelay = this.retryDelay;
      const backoffDelay = baseDelay * Math.pow(2, alert.performance.failedTriggers);
      const nextCheck = new Date(Date.now() + Math.min(backoffDelay, 3600000)); // Max 1 hour
      
      alert.nextCheck = nextCheck;
      await alert.save();
      
      alertLogger.failed(alert._id, alert.userId, error);
      
    } catch (saveError) {
      logger.error('Error saving alert failure:', saveError);
    }
  }

  /**
   * Handle alert triggered event
   */
  handleAlertTriggered(data) {
    logger.info(`Alert triggered: ${data.alert._id}`);
    // Additional handling if needed
  }

  /**
   * Handle alert failed event
   */
  handleAlertFailed(data) {
    logger.error(`Alert failed: ${data.alert._id}`, data.error);
    // Additional handling if needed
  }

  /**
   * Handle market update event
   */
  async handleMarketUpdate(data) {
    try {
      // Trigger immediate check for alerts related to this symbol
      const alerts = await Alert.find({
        symbol: data.symbol,
        isActive: true,
        isPaused: false
      });
      
      for (const alert of alerts) {
        // Add to processing queue for immediate processing
        this.processingQueue.push(alert);
      }
      
    } catch (error) {
      logger.error('Error handling market update:', error);
    }
  }

  /**
   * Handle engine error
   */
  handleError(error) {
    logger.error('Alert Engine error:', error);
  }

  /**
   * Get engine statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      queueSize: this.processingQueue.length,
      activeWorkers: this.activeWorkers,
      uptime: this.stats.lastProcessingTime ? 
        Date.now() - this.stats.lastProcessingTime.getTime() : 0
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      status: this.isRunning ? 'healthy' : 'stopped',
      stats: this.getStats(),
      lastProcessing: this.stats.lastProcessingTime,
      queueSize: this.processingQueue.length,
      activeWorkers: this.activeWorkers
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Shutting down Alert Engine...');
    
    await this.stop();
    
    // Clean up event listeners
    this.removeAllListeners();
    
    logger.info('Alert Engine shutdown complete');
  }
}

module.exports = AlertEngine;