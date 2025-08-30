const crypto = require('crypto');
const { validationResult } = require('express-validator');
const Alert = require('../models/Alert');
const Trade = require('../models/Trade');
const User = require('../models/User');
const alertProcessingService = require('../services/alertProcessingService');
const logger = require('../utils/logger');

// Verify TradingView webhook signature (if configured)
const verifyWebhookSignature = (payload, signature, secret) => {
  if (!secret || !signature) {
    return true; // Skip verification if not configured
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  const providedSignature = signature.replace('sha256=', '');
  
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(providedSignature, 'hex')
  );
};

// Process TradingView webhook alert
const processTradingViewWebhook = async (req, res) => {
  try {
    const startTime = Date.now();
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Verify webhook signature if configured
    const webhookSecret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
    const signature = req.headers['x-tradingview-signature'];
    
    if (webhookSecret && !verifyWebhookSignature(JSON.stringify(req.body), signature, webhookSecret)) {
      logger.warn('Invalid TradingView webhook signature', {
        ip: clientIP,
        signature,
        body: req.body
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }
    
    // Validate required fields
    const { symbol, timeframe, strategy, signal, price, timestamp } = req.body;
    
    if (!symbol || !timeframe || !strategy || !signal || !price) {
      logger.warn('Invalid TradingView webhook payload - missing required fields', {
        body: req.body,
        ip: clientIP
      });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: symbol, timeframe, strategy, signal, price'
      });
    }
    
    // Validate signal type
    const validSignals = ['BUY', 'SELL', 'TP_HIT', 'SL_HIT'];
    if (!validSignals.includes(signal.toUpperCase())) {
      logger.warn('Invalid signal type in TradingView webhook', {
        signal,
        body: req.body,
        ip: clientIP
      });
      return res.status(400).json({
        success: false,
        message: `Invalid signal type. Must be one of: ${validSignals.join(', ')}`
      });
    }
    
    // Create alert record
    const alert = new Alert({
      source: 'tradingview',
      webhook: {
        receivedAt: new Date(),
        rawPayload: req.body,
        signature,
        ipAddress: clientIP
      },
      alertData: {
        symbol: symbol.toUpperCase(),
        timeframe,
        strategy,
        signal: signal.toUpperCase(),
        price: parseFloat(price),
        takeProfitPrice: req.body.takeProfitPrice ? parseFloat(req.body.takeProfitPrice) : undefined,
        stopLossPrice: req.body.stopLossPrice ? parseFloat(req.body.stopLossPrice) : undefined,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        additionalData: {
          tradeNumber: req.body.tradeNumber,
          originalEntry: req.body.originalEntry,
          metadata: req.body.metadata
        }
      },
      processing: {
        status: 'received'
      }
    });
    
    await alert.save();
    
    logger.info('TradingView webhook received and saved', {
      alertId: alert._id,
      symbol: alert.alertData.symbol,
      signal: alert.alertData.signal,
      strategy: alert.alertData.strategy,
      price: alert.alertData.price,
      processingTime: Date.now() - startTime
    });
    
    // Process the alert asynchronously using the alert processing service
    alertProcessingService.processAlert(alert._id);
    
    // Return immediate response to TradingView
    res.status(200).json({
      success: true,
      message: 'Alert received and queued for processing',
      alertId: alert._id,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error processing TradingView webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error processing webhook'
    });
  }
};

// Get alert processing statistics
const getProcessingStats = async (req, res) => {
  try {
    const stats = alertProcessingService.getProcessingStats();
    
    // Get additional database stats
    const totalAlerts = await Alert.countDocuments();
    const pendingAlerts = await Alert.countDocuments({ 'processing.status': { $in: ['received', 'processing'] } });
    const processedAlerts = await Alert.countDocuments({ 'processing.status': 'processed' });
    const failedAlerts = await Alert.countDocuments({ 'processing.status': 'failed' });
    
    const recentAlerts = await Alert.find()
      .sort({ 'webhook.receivedAt': -1 })
      .limit(10)
      .select('alertData.symbol alertData.signal alertData.strategy processing.status webhook.receivedAt');
    
    res.json({
      success: true,
      data: {
        processing: stats,
        database: {
          total: totalAlerts,
          pending: pendingAlerts,
          processed: processedAlerts,
          failed: failedAlerts
        },
        recentAlerts
      }
    });
    
  } catch (error) {
    logger.error('Error getting processing stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get processing statistics',
      error: error.message
    });
  }
};

// Process entry signals (BUY/SELL)
const processEntrySignal = async (alert) => {
  const { symbol, strategy, signal, price, takeProfitPrice, stopLossPrice } = alert.alertData;
  
  // TODO: Implement user matching based on subscriptions and alert configurations
  // For now, we'll create a basic trade record
  
  const tradeNumber = await Trade.getNextTradeNumber();
  
  // TODO: Replace with actual user matching logic
  // This is a placeholder - in production, we need to:
  // 1. Find users with active subscriptions
  // 2. Match alert configuration
  // 3. Check trade limits
  // 4. Handle trade replacement logic
  
  // Send Telegram notifications to subscribed users
  try {
    const telegramBot = require('../services/telegramBot');
    if (telegramBot.isInitialized()) {
      // For now, send to all active Telegram users
      // TODO: Implement proper subscription matching
      await telegramBot.sendAlertToSubscribers(alert.alertData);
    }
  } catch (telegramError) {
    logger.error('Failed to send Telegram notification for entry signal:', telegramError);
  }
  
  logger.info('Entry signal processed', {
    alertId: alert._id,
    symbol,
    signal,
    price,
    tradeNumber,
    strategy
  });
  
  // Mark alert as having trade actions
  alert.processing.tradeActions.push({
    action: 'open_trade',
    executed: true,
    executedAt: new Date()
  });
  
  await alert.save();
};

// Process exit signals (TP_HIT/SL_HIT)
const processExitSignal = async (alert) => {
  const { symbol, strategy, signal, price } = alert.alertData;
  const { tradeNumber } = alert.alertData.additionalData || {};
  
  // TODO: Implement trade closure logic
  // 1. Find open trades matching the criteria
  // 2. Close the trade with the exit price
  // 3. Calculate P&L
  // 4. Notify users
  
  // Send Telegram notifications to subscribed users
  try {
    const telegramBot = require('../services/telegramBot');
    if (telegramBot.isInitialized()) {
      // For now, send to all active Telegram users
      // TODO: Implement proper subscription matching and P&L calculation
      await telegramBot.sendAlertToSubscribers(alert.alertData);
    }
  } catch (telegramError) {
    logger.error('Failed to send Telegram notification for exit signal:', telegramError);
  }
  
  logger.info('Exit signal processed', {
    alertId: alert._id,
    symbol,
    signal,
    price,
    tradeNumber,
    strategy
  });
  
  // Mark alert as having trade actions
  alert.processing.tradeActions.push({
    action: 'close_trade',
    executed: true,
    executedAt: new Date()
  });
  
  await alert.save();
};

// Test webhook endpoint
const testWebhook = (req, res) => {
  logger.info('Test webhook called', {
    body: req.body,
    headers: req.headers,
    ip: req.ip
  });
  
  res.status(200).json({
    success: true,
    message: 'Test webhook received successfully',
    data: req.body,
    timestamp: new Date().toISOString(),
    receivedFrom: req.ip
  });
};

// Get webhook statistics
const getWebhookStats = async (req, res) => {
  try {
    const stats = await Alert.aggregate([
      {
        $group: {
          _id: '$processing.status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const recentAlerts = await Alert.find()
      .sort({ 'webhook.receivedAt': -1 })
      .limit(10)
      .select('alertData.symbol alertData.signal alertData.strategy processing.status webhook.receivedAt');
    
    res.status(200).json({
      success: true,
      stats,
      recentAlerts
    });
    
  } catch (error) {
    logger.error('Error fetching webhook stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching webhook statistics'
    });
  }
};

module.exports = {
  processTradingViewWebhook,
  testWebhook,
  getWebhookStats,
  getProcessingStats
};