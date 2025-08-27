const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const logger = require('../../../shared/utils/logger');
const helpers = require('../../../shared/utils/helpers');
const { ValidationMiddleware, AuthMiddleware, RateLimiter } = require('../../../shared/middleware');
const environmentConfig = require('../../../shared/config/environment');
const databaseConfig = require('../../../shared/config/database');

class WebhookRoutes {
  constructor() {
    this.setupRoutes();
  }

  setupRoutes() {
    // Apply webhook rate limiting
    router.use(RateLimiter.createWebhookLimiter());

    // TradingView webhook endpoint
    router.post('/tradingview',
      this.validateTradingViewSignature.bind(this),
      ValidationMiddleware.validate('webhookData'),
      this.handleTradingViewWebhook.bind(this)
    );

    // Generic webhook endpoint with API key authentication
    router.post('/generic',
      AuthMiddleware.authenticateApiKey,
      ValidationMiddleware.validate('genericWebhook'),
      this.handleGenericWebhook.bind(this)
    );

    // Test webhook endpoint (for development/testing)
    router.post('/test',
      AuthMiddleware.authenticate,
      ValidationMiddleware.validate('testWebhook'),
      this.handleTestWebhook.bind(this)
    );

    // Webhook status and health check
    router.get('/health',
      this.getWebhookHealth.bind(this)
    );

    // Webhook statistics (admin only)
    router.get('/stats',
      AuthMiddleware.authenticate,
      AuthMiddleware.requireAdmin,
      this.getWebhookStats.bind(this)
    );

    // Webhook logs (admin only)
    router.get('/logs',
      AuthMiddleware.authenticate,
      AuthMiddleware.requireAdmin,
      ValidationMiddleware.validate('webhookLogQuery'),
      this.getWebhookLogs.bind(this)
    );

    // Resend failed webhooks (admin only)
    router.post('/resend/:webhookId',
      AuthMiddleware.authenticate,
      AuthMiddleware.requireAdmin,
      this.resendWebhook.bind(this)
    );
  }

  // Validate TradingView webhook signature
  validateTradingViewSignature(req, res, next) {
    try {
      const signature = req.headers['x-tradingview-signature'];
      const webhookSecret = environmentConfig.get('TRADINGVIEW_WEBHOOK_SECRET');

      if (!signature || !webhookSecret) {
        logger.logSecurityEvent({
          event: 'webhook_signature_missing',
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          headers: this.sanitizeHeaders(req.headers)
        });

        return res.status(401).json({
          success: false,
          error: 'Webhook signature required',
          code: 'SIGNATURE_REQUIRED'
        });
      }

      // Verify signature
      const body = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');

      const providedSignature = signature.replace('sha256=', '');

      if (!crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      )) {
        logger.logSecurityEvent({
          event: 'webhook_signature_invalid',
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          providedSignature,
          expectedSignature
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid webhook signature',
          code: 'INVALID_SIGNATURE'
        });
      }

      // Log successful signature validation
      logger.logSecurityEvent({
        event: 'webhook_signature_valid',
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      next();
    } catch (error) {
      logger.logError(error, {
        context: 'webhook_signature_validation',
        ip: req.ip,
        headers: this.sanitizeHeaders(req.headers)
      });

      res.status(500).json({
        success: false,
        error: 'Signature validation failed',
        code: 'SIGNATURE_VALIDATION_ERROR'
      });
    }
  }

  // Handle TradingView webhook
  async handleTradingViewWebhook(req, res) {
    const webhookId = helpers.generateUUID();
    const startTime = Date.now();

    try {
      const webhookData = req.body;
      
      // Log incoming webhook
      logger.info('TradingView webhook received', {
        webhookId,
        symbol: webhookData.symbol,
        action: webhookData.action,
        price: webhookData.price,
        time: webhookData.time,
        ip: req.ip
      });

      // Validate required fields
      const requiredFields = ['symbol', 'action', 'price', 'time'];
      const missingFields = requiredFields.filter(field => !webhookData[field]);
      
      if (missingFields.length > 0) {
        await this.logWebhookEvent(webhookId, 'tradingview', 'failed', {
          error: 'Missing required fields',
          missingFields,
          data: webhookData
        });

        return res.status(400).json({
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
          code: 'MISSING_FIELDS',
          webhookId
        });
      }

      // Process webhook data
      const processedData = {
        webhookId,
        source: 'tradingview',
        symbol: webhookData.symbol.toUpperCase(),
        action: webhookData.action.toLowerCase(),
        price: parseFloat(webhookData.price),
        time: new Date(webhookData.time),
        timeframe: webhookData.timeframe || '1h',
        exchange: webhookData.exchange || 'unknown',
        strategy: webhookData.strategy || 'unknown',
        message: webhookData.message || '',
        metadata: {
          volume: webhookData.volume,
          high: webhookData.high,
          low: webhookData.low,
          open: webhookData.open,
          close: webhookData.close,
          rsi: webhookData.rsi,
          macd: webhookData.macd,
          customFields: webhookData.custom || {}
        },
        receivedAt: new Date(),
        processedAt: null,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Store webhook data
      await this.storeWebhookData(processedData);

      // Forward to Alert Engine for processing
      const alertEngineResponse = await this.forwardToAlertEngine(processedData);
      
      if (!alertEngineResponse.success) {
        await this.logWebhookEvent(webhookId, 'tradingview', 'processing_failed', {
          error: alertEngineResponse.error,
          data: processedData
        });

        return res.status(500).json({
          success: false,
          error: 'Failed to process webhook',
          code: 'PROCESSING_FAILED',
          webhookId
        });
      }

      // Log successful processing
      await this.logWebhookEvent(webhookId, 'tradingview', 'success', {
        alertsTriggered: alertEngineResponse.alertsTriggered,
        processingTime: Date.now() - startTime,
        data: processedData
      });

      res.json({
        success: true,
        data: {
          webhookId,
          alertsTriggered: alertEngineResponse.alertsTriggered,
          processingTime: Date.now() - startTime
        },
        message: 'Webhook processed successfully'
      });
    } catch (error) {
      logger.logError(error, {
        context: 'tradingview_webhook',
        webhookId,
        data: req.body,
        ip: req.ip
      });

      await this.logWebhookEvent(webhookId, 'tradingview', 'error', {
        error: error.message,
        stack: error.stack,
        data: req.body
      });

      res.status(500).json({
        success: false,
        error: 'Webhook processing failed',
        code: 'WEBHOOK_ERROR',
        webhookId
      });
    }
  }

  // Handle generic webhook
  async handleGenericWebhook(req, res) {
    const webhookId = helpers.generateUUID();
    const startTime = Date.now();

    try {
      const webhookData = req.body;
      const apiKey = req.apiKey;

      // Log incoming webhook
      logger.info('Generic webhook received', {
        webhookId,
        apiKeyId: apiKey.id,
        userId: apiKey.userId,
        source: webhookData.source || 'generic',
        ip: req.ip
      });

      // Process webhook data
      const processedData = {
        webhookId,
        source: webhookData.source || 'generic',
        userId: apiKey.userId,
        apiKeyId: apiKey.id,
        data: webhookData,
        receivedAt: new Date(),
        ip: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Store webhook data
      await this.storeWebhookData(processedData);

      // Forward to appropriate service based on webhook type
      let serviceResponse;
      switch (webhookData.type) {
        case 'alert':
          serviceResponse = await this.forwardToAlertEngine(processedData);
          break;
        case 'notification':
          serviceResponse = await this.forwardToTelegramService(processedData);
          break;
        default:
          serviceResponse = { success: true, message: 'Webhook received and stored' };
      }

      // Log processing result
      await this.logWebhookEvent(webhookId, 'generic', 
        serviceResponse.success ? 'success' : 'processing_failed', {
        userId: apiKey.userId,
        processingTime: Date.now() - startTime,
        serviceResponse,
        data: processedData
      });

      res.json({
        success: true,
        data: {
          webhookId,
          processingTime: Date.now() - startTime,
          serviceResponse
        },
        message: 'Webhook processed successfully'
      });
    } catch (error) {
      logger.logError(error, {
        context: 'generic_webhook',
        webhookId,
        userId: req.apiKey?.userId,
        data: req.body,
        ip: req.ip
      });

      await this.logWebhookEvent(webhookId, 'generic', 'error', {
        error: error.message,
        userId: req.apiKey?.userId,
        data: req.body
      });

      res.status(500).json({
        success: false,
        error: 'Webhook processing failed',
        code: 'WEBHOOK_ERROR',
        webhookId
      });
    }
  }

  // Handle test webhook
  async handleTestWebhook(req, res) {
    const webhookId = helpers.generateUUID();

    try {
      const testData = {
        webhookId,
        source: 'test',
        userId: req.user.id,
        data: req.body,
        receivedAt: new Date(),
        ip: req.ip,
        userAgent: req.get('User-Agent')
      };

      // Log test webhook
      logger.info('Test webhook received', {
        webhookId,
        userId: req.user.id,
        data: req.body,
        ip: req.ip
      });

      // Store test webhook data
      await this.storeWebhookData(testData);

      res.json({
        success: true,
        data: {
          webhookId,
          echo: req.body,
          timestamp: new Date().toISOString()
        },
        message: 'Test webhook received successfully'
      });
    } catch (error) {
      logger.logError(error, {
        context: 'test_webhook',
        webhookId,
        userId: req.user?.id,
        data: req.body,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Test webhook failed',
        code: 'TEST_WEBHOOK_ERROR',
        webhookId
      });
    }
  }

  // Get webhook health
  async getWebhookHealth(req, res) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          alertEngine: 'healthy',
          telegramService: 'healthy',
          database: 'healthy'
        },
        statistics: {
          totalWebhooks: 0,
          successfulWebhooks: 0,
          failedWebhooks: 0,
          averageProcessingTime: 0
        }
      };

      // Get recent webhook statistics
      const db = databaseConfig.getDatabase();
      const recentWebhooks = await db.collection('webhook_logs')
        .find({
          timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        })
        .toArray();

      health.statistics.totalWebhooks = recentWebhooks.length;
      health.statistics.successfulWebhooks = recentWebhooks.filter(w => w.status === 'success').length;
      health.statistics.failedWebhooks = recentWebhooks.filter(w => w.status === 'failed' || w.status === 'error').length;

      if (recentWebhooks.length > 0) {
        const totalProcessingTime = recentWebhooks
          .filter(w => w.processingTime)
          .reduce((sum, w) => sum + w.processingTime, 0);
        health.statistics.averageProcessingTime = Math.round(totalProcessingTime / recentWebhooks.length);
      }

      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      logger.logError(error, {
        context: 'webhook_health',
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get webhook health',
        code: 'WEBHOOK_HEALTH_ERROR'
      });
    }
  }

  // Helper methods
  async storeWebhookData(data) {
    try {
      const db = databaseConfig.getDatabase();
      await db.collection('webhooks').insertOne(data);
    } catch (error) {
      logger.logError(error, {
        context: 'store_webhook_data',
        webhookId: data.webhookId
      });
      throw error;
    }
  }

  async logWebhookEvent(webhookId, source, status, details) {
    try {
      const db = databaseConfig.getDatabase();
      await db.collection('webhook_logs').insertOne({
        webhookId,
        source,
        status,
        details,
        timestamp: new Date()
      });
    } catch (error) {
      logger.logError(error, {
        context: 'log_webhook_event',
        webhookId,
        source,
        status
      });
    }
  }

  async forwardToAlertEngine(data) {
    try {
      const axios = require('axios');
      const alertEngineUrl = environmentConfig.get('ALERT_ENGINE_URL');
      
      const response = await axios.post(`${alertEngineUrl}/api/process-webhook`, data, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Service': 'alert-bot-api-gateway',
          'X-Request-ID': data.webhookId
        }
      });

      return response.data;
    } catch (error) {
      logger.logError(error, {
        context: 'forward_to_alert_engine',
        webhookId: data.webhookId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async forwardToTelegramService(data) {
    try {
      const axios = require('axios');
      const telegramServiceUrl = environmentConfig.get('TELEGRAM_SERVICE_URL');
      
      const response = await axios.post(`${telegramServiceUrl}/api/process-webhook`, data, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Service': 'alert-bot-api-gateway',
          'X-Request-ID': data.webhookId
        }
      });

      return response.data;
    } catch (error) {
      logger.logError(error, {
        context: 'forward_to_telegram_service',
        webhookId: data.webhookId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    delete sanitized.authorization;
    delete sanitized['x-api-key'];
    delete sanitized['x-tradingview-signature'];
    return sanitized;
  }

  // Additional methods would be implemented here...
  // getWebhookStats, getWebhookLogs, resendWebhook
}

// Create and export router
const webhookRoutes = new WebhookRoutes();
module.exports = router;