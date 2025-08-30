const Alert = require('../models/Alert');
const AlertConfiguration = require('../models/AlertConfiguration');
const User = require('../models/User');
const UserSubscription = require('../models/UserSubscription');
const Trade = require('../models/Trade');
const TelegramUser = require('../models/TelegramUser');
const logger = require('../utils/logger');
const telegramBot = require('./telegramBot');

class AlertProcessingService {
  constructor() {
    this.processingQueue = new Map();
    this.maxConcurrentProcessing = 10;
  }

  /**
   * Main entry point for processing alerts
   * @param {string} alertId - The alert ID to process
   */
  async processAlert(alertId) {
    const startTime = Date.now();
    
    try {
      // Prevent duplicate processing
      if (this.processingQueue.has(alertId)) {
        logger.warn('Alert already being processed', { alertId });
        return;
      }

      this.processingQueue.set(alertId, { startTime, status: 'processing' });

      const alert = await Alert.findById(alertId);
      if (!alert) {
        logger.error('Alert not found for processing', { alertId });
        return;
      }

      await alert.markAsProcessing();
      logger.info('Starting alert processing', { 
        alertId: alert._id,
        symbol: alert.alertData.symbol,
        signal: alert.alertData.signal,
        strategy: alert.alertData.strategy
      });

      // Step 1: Find matching alert configurations
      const matchingConfigs = await this.findMatchingConfigurations(alert.alertData);
      if (matchingConfigs.length === 0) {
        logger.warn('No matching alert configurations found', {
          alertId: alert._id,
          symbol: alert.alertData.symbol,
          strategy: alert.alertData.strategy
        });
        await alert.markAsProcessed();
        return;
      }

      // Step 2: Process each matching configuration
      for (const config of matchingConfigs) {
        await this.processAlertForConfiguration(alert, config);
      }

      // Step 3: Mark alert as processed
      await alert.markAsProcessed();
      
      const processingTime = Date.now() - startTime;
      logger.info('Alert processing completed', {
        alertId: alert._id,
        processingTime: `${processingTime}ms`,
        matchedConfigs: matchingConfigs.length
      });

    } catch (error) {
      logger.error('Error processing alert:', error);
      
      try {
        const alert = await Alert.findById(alertId);
        if (alert) {
          await alert.markAsFailed(error);
        }
      } catch (updateError) {
        logger.error('Error updating alert status to failed:', updateError);
      }
    } finally {
      this.processingQueue.delete(alertId);
    }
  }

  /**
   * Find alert configurations that match the incoming alert
   * @param {Object} alertData - The alert data
   * @returns {Array} Array of matching AlertConfiguration documents
   */
  async findMatchingConfigurations(alertData) {
    try {
      const { symbol, timeframe, strategy, signal } = alertData;
      
      const configs = await AlertConfiguration.findMatchingConfigs({
        symbol,
        timeframe,
        strategy
      });

      // Filter configurations that allow this signal type
      const validConfigs = configs.filter(config => {
        return config.checkSignalAllowed(signal);
      });

      // Validate alert data against each configuration
      const matchingConfigs = [];
      for (const config of validConfigs) {
        const validation = config.validateAlert(alertData);
        if (validation.isValid) {
          matchingConfigs.push(config);
        } else {
          logger.warn('Alert validation failed for configuration', {
            configId: config._id,
            configName: config.name,
            errors: validation.errors
          });
        }
      }

      return matchingConfigs;
    } catch (error) {
      logger.error('Error finding matching configurations:', error);
      return [];
    }
  }

  /**
   * Process alert for a specific configuration
   * @param {Object} alert - The alert document
   * @param {Object} config - The alert configuration document
   */
  async processAlertForConfiguration(alert, config) {
    try {
      // Update alert with matched configuration
      alert.processing.alertConfigId = config._id;
      await alert.save();

      // Find users with active subscriptions for this configuration
      const subscribedUsers = await this.findSubscribedUsers(config);
      
      if (subscribedUsers.length === 0) {
        logger.info('No subscribed users found for configuration', {
          configId: config._id,
          configName: config.name
        });
        return;
      }

      // Process alert based on signal type
      const { signal } = alert.alertData;
      
      if (signal === 'BUY' || signal === 'SELL') {
        await this.processEntrySignal(alert, config, subscribedUsers);
      } else if (signal === 'TP_HIT' || signal === 'SL_HIT') {
        await this.processExitSignal(alert, config, subscribedUsers);
      }

      // Update configuration statistics
      await config.incrementAlertCount(true);
      
    } catch (error) {
      logger.error('Error processing alert for configuration:', error);
      await config.incrementAlertCount(false);
      throw error;
    }
  }

  /**
   * Find users with active subscriptions for a configuration
   * @param {Object} config - The alert configuration
   * @returns {Array} Array of user objects with subscription info
   */
  async findSubscribedUsers(config) {
    try {
      // Get subscription plan IDs from configuration
      const planIds = config.subscriptionPlans;
      
      if (!planIds || planIds.length === 0) {
        return [];
      }

      // Find active subscriptions for these plans
      const activeSubscriptions = await UserSubscription.find({
        subscriptionPlanId: { $in: planIds },
        'subscription.status': 'active',
        'subscription.endDate': { $gt: new Date() }
      }).populate('userId subscriptionPlanId');

      // Filter users with valid accounts
      const subscribedUsers = [];
      for (const subscription of activeSubscriptions) {
        if (subscription.userId && subscription.userId.status === 'active') {
          subscribedUsers.push({
            user: subscription.userId,
            subscription: subscription,
            plan: subscription.subscriptionPlanId
          });
        }
      }

      return subscribedUsers;
    } catch (error) {
      logger.error('Error finding subscribed users:', error);
      return [];
    }
  }

  /**
   * Process entry signals (BUY/SELL)
   * @param {Object} alert - The alert document
   * @param {Object} config - The alert configuration
   * @param {Array} subscribedUsers - Array of subscribed users
   */
  async processEntrySignal(alert, config, subscribedUsers) {
    const { symbol, strategy, signal, price, takeProfitPrice, stopLossPrice } = alert.alertData;
    
    for (const userInfo of subscribedUsers) {
      try {
        const { user, subscription } = userInfo;
        
        // Check trade limits for this user and configuration
        const openTrades = await Trade.findOpenTrades(user._id, config._id);
        const maxTrades = config.tradeManagement.maxOpenTrades;
        
        let shouldCreateTrade = true;
        let tradeAction = 'open_trade';
        let replacedTradeId = null;
        
        if (openTrades.length >= maxTrades) {
          if (config.tradeManagement.replaceOnSameSignal) {
            // Find trade with same signal to replace
            const sameSignalTrade = openTrades.find(trade => 
              trade.tradeData.signal === signal
            );
            
            if (sameSignalTrade) {
              // Replace existing trade
              await this.replaceTrade(sameSignalTrade, alert, 'Same signal replacement');
              replacedTradeId = sameSignalTrade._id;
              tradeAction = 'replace_trade';
            } else if (config.tradeManagement.allowOppositeSignals) {
              // Find oldest trade to replace
              const oldestTrade = openTrades.sort((a, b) => 
                a.timestamps.openedAt - b.timestamps.openedAt
              )[0];
              
              await this.replaceTrade(oldestTrade, alert, 'Trade limit reached');
              replacedTradeId = oldestTrade._id;
              tradeAction = 'replace_trade';
            } else {
              shouldCreateTrade = false;
              logger.info('Trade limit reached, skipping trade creation', {
                userId: user._id,
                configId: config._id,
                openTrades: openTrades.length,
                maxTrades
              });
            }
          } else {
            shouldCreateTrade = false;
          }
        }
        
        if (shouldCreateTrade) {
          // Create new trade
          const tradeNumber = await Trade.getNextTradeNumber();
          
          const newTrade = new Trade({
            tradeNumber,
            userId: user._id,
            alertConfigId: config._id,
            subscriptionId: subscription._id,
            tradeData: {
              symbol: symbol.toUpperCase(),
              timeframe: alert.alertData.timeframe,
              strategy,
              signal,
              entryPrice: price,
              takeProfitPrice,
              stopLossPrice
            },
            status: 'open',
            alerts: {
              entryAlertId: alert._id
            }
          });
          
          await newTrade.save();
          
          // Record trade action in alert
          alert.processing.tradeActions.push({
            action: tradeAction,
            tradeId: newTrade._id,
            userId: user._id,
            executed: true,
            executedAt: new Date()
          });
          
          logger.info('Trade created for entry signal', {
            tradeId: newTrade._id,
            tradeNumber,
            userId: user._id,
            symbol,
            signal,
            price,
            replacedTradeId
          });
        }
        
        // Send Telegram notification
        await this.sendTelegramNotification(user, alert, config, {
          action: tradeAction,
          tradeNumber: shouldCreateTrade ? await Trade.getNextTradeNumber() - 1 : null
        });
        
        // Mark user as matched in alert
        await alert.addMatchedUser(user._id, subscription._id);
        
      } catch (error) {
        logger.error('Error processing entry signal for user:', error, {
          userId: userInfo.user._id,
          alertId: alert._id
        });
      }
    }
    
    await alert.save();
  }

  /**
   * Process exit signals (TP_HIT/SL_HIT)
   * @param {Object} alert - The alert document
   * @param {Object} config - The alert configuration
   * @param {Array} subscribedUsers - Array of subscribed users
   */
  async processExitSignal(alert, config, subscribedUsers) {
    const { symbol, strategy, signal, price } = alert.alertData;
    const { tradeNumber } = alert.alertData.additionalData || {};
    
    for (const userInfo of subscribedUsers) {
      try {
        const { user, subscription } = userInfo;
        
        // Find open trades to close
        let tradesToClose = [];
        
        if (tradeNumber) {
          // Close specific trade by number
          const specificTrade = await Trade.findOne({
            tradeNumber: parseInt(tradeNumber),
            userId: user._id,
            status: 'open'
          });
          
          if (specificTrade) {
            tradesToClose.push(specificTrade);
          }
        } else {
          // Close trades matching symbol and strategy
          tradesToClose = await Trade.find({
            userId: user._id,
            alertConfigId: config._id,
            'tradeData.symbol': symbol.toUpperCase(),
            'tradeData.strategy': strategy,
            status: 'open'
          }).sort({ 'timestamps.openedAt': 1 }); // Close oldest first
        }
        
        for (const trade of tradesToClose) {
          const exitReason = signal === 'TP_HIT' ? 'TP_HIT' : 'SL_HIT';
          await trade.closeTrade(price, exitReason);
          
          // Update trade with exit alert
          trade.alerts.exitAlertId = alert._id;
          await trade.save();
          
          // Record trade action in alert
          alert.processing.tradeActions.push({
            action: 'close_trade',
            tradeId: trade._id,
            userId: user._id,
            executed: true,
            executedAt: new Date()
          });
          
          logger.info('Trade closed for exit signal', {
            tradeId: trade._id,
            tradeNumber: trade.tradeNumber,
            userId: user._id,
            symbol,
            signal,
            exitPrice: price,
            pnl: trade.pnl
          });
        }
        
        // Send Telegram notification
        await this.sendTelegramNotification(user, alert, config, {
          action: 'close_trade',
          closedTrades: tradesToClose.length
        });
        
        // Mark user as matched in alert
        await alert.addMatchedUser(user._id, subscription._id);
        
      } catch (error) {
        logger.error('Error processing exit signal for user:', error, {
          userId: userInfo.user._id,
          alertId: alert._id
        });
      }
    }
    
    await alert.save();
  }

  /**
   * Replace an existing trade
   * @param {Object} existingTrade - The trade to replace
   * @param {Object} alert - The new alert
   * @param {string} reason - Replacement reason
   */
  async replaceTrade(existingTrade, alert, reason) {
    try {
      const tradeNumber = await Trade.getNextTradeNumber();
      
      // Create new trade
      const newTrade = new Trade({
        tradeNumber,
        userId: existingTrade.userId,
        alertConfigId: existingTrade.alertConfigId,
        subscriptionId: existingTrade.subscriptionId,
        tradeData: {
          symbol: alert.alertData.symbol.toUpperCase(),
          timeframe: alert.alertData.timeframe,
          strategy: alert.alertData.strategy,
          signal: alert.alertData.signal,
          entryPrice: alert.alertData.price,
          takeProfitPrice: alert.alertData.takeProfitPrice,
          stopLossPrice: alert.alertData.stopLossPrice
        },
        status: 'open',
        alerts: {
          entryAlertId: alert._id
        }
      });
      
      await newTrade.save();
      
      // Mark existing trade as replaced
      await existingTrade.replaceTrade(newTrade._id, reason);
      
      logger.info('Trade replaced', {
        oldTradeId: existingTrade._id,
        oldTradeNumber: existingTrade.tradeNumber,
        newTradeId: newTrade._id,
        newTradeNumber: newTrade.tradeNumber,
        reason
      });
      
      return newTrade;
    } catch (error) {
      logger.error('Error replacing trade:', error);
      throw error;
    }
  }

  /**
   * Send Telegram notification to user
   * @param {Object} user - The user document
   * @param {Object} alert - The alert document
   * @param {Object} config - The alert configuration
   * @param {Object} metadata - Additional metadata
   */
  async sendTelegramNotification(user, alert, config, metadata = {}) {
    try {
      // Find user's Telegram info
      const telegramUser = await TelegramUser.findOne({ userId: user._id });
      
      if (!telegramUser || !telegramUser.chatId) {
        logger.warn('No Telegram chat ID found for user', { userId: user._id });
        return;
      }
      
      // Check if Telegram bot is initialized
      if (!telegramBot.isInitialized()) {
        logger.error('Telegram bot not initialized');
        return;
      }
      
      // Format alert message
      const message = this.formatAlertMessage(alert, config, metadata);
      
      // Send message
      await telegramBot.sendMessage(telegramUser.chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
      
      // Mark as delivered in alert
      await alert.markUserDelivered(user._id);
      
      logger.info('Telegram notification sent', {
        userId: user._id,
        chatId: telegramUser.chatId,
        alertId: alert._id
      });
      
    } catch (error) {
      logger.error('Error sending Telegram notification:', error, {
        userId: user._id,
        alertId: alert._id
      });
    }
  }

  /**
   * Format alert message for Telegram
   * @param {Object} alert - The alert document
   * @param {Object} config - The alert configuration
   * @param {Object} metadata - Additional metadata
   * @returns {string} Formatted message
   */
  formatAlertMessage(alert, config, metadata = {}) {
    const { symbol, timeframe, strategy, signal, price, takeProfitPrice, stopLossPrice } = alert.alertData;
    const { action, tradeNumber, closedTrades } = metadata;
    
    let message = `🚨 <b>Trading Alert</b>\n\n`;
    
    // Alert details
    message += `📊 <b>Symbol:</b> ${symbol}\n`;
    message += `⏰ <b>Timeframe:</b> ${timeframe}\n`;
    message += `🎯 <b>Strategy:</b> ${strategy}\n`;
    message += `📈 <b>Signal:</b> ${signal}\n`;
    message += `💰 <b>Price:</b> $${price.toFixed(2)}\n`;
    
    if (takeProfitPrice) {
      message += `🎯 <b>Take Profit:</b> $${takeProfitPrice.toFixed(2)}\n`;
    }
    
    if (stopLossPrice) {
      message += `🛑 <b>Stop Loss:</b> $${stopLossPrice.toFixed(2)}\n`;
    }
    
    // Trade information
    if (tradeNumber) {
      message += `\n🔢 <b>Trade #:</b> ${tradeNumber}\n`;
    }
    
    if (action === 'replace_trade') {
      message += `\n🔄 <b>Action:</b> Trade Replaced\n`;
    } else if (action === 'close_trade' && closedTrades) {
      message += `\n✅ <b>Action:</b> ${closedTrades} Trade(s) Closed\n`;
    }
    
    // Configuration info
    message += `\n📋 <b>Config:</b> ${config.name}\n`;
    message += `⏱️ <b>Time:</b> ${new Date().toLocaleString()}\n`;
    
    return message;
  }

  /**
   * Get processing statistics
   * @returns {Object} Processing statistics
   */
  getProcessingStats() {
    return {
      currentlyProcessing: this.processingQueue.size,
      maxConcurrent: this.maxConcurrentProcessing,
      queuedAlerts: Array.from(this.processingQueue.entries()).map(([id, info]) => ({
        alertId: id,
        startTime: info.startTime,
        duration: Date.now() - info.startTime
      }))
    };
  }
}

module.exports = new AlertProcessingService();