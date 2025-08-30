const express = require('express');
const { validationResult } = require('express-validator');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { 
  validateTradingViewWebhook, 
  validateWebhookSignature, 
  validateTestWebhook 
} = require('../validators/webhookValidators');
const { handleValidationErrors } = require('../middleware/validation');

/**
 * @swagger
 * components:
 *   schemas:
 *     TradingViewWebhook:
 *       type: object
 *       required:
 *         - symbol
 *         - timeframe
 *         - strategy
 *         - signal
 *         - price
 *       properties:
 *         symbol:
 *           type: string
 *           description: Trading symbol (e.g., BTCUSDT, EURUSD)
 *           example: "BTCUSDT"
 *           pattern: "^[A-Z0-9._-]+$"
 *         timeframe:
 *           type: string
 *           description: Chart timeframe
 *           example: "1h"
 *           enum: ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"]
 *         strategy:
 *           type: string
 *           description: Trading strategy name
 *           example: "RSI Divergence"
 *           maxLength: 100
 *         signal:
 *           type: string
 *           description: Trading signal type
 *           example: "BUY"
 *           enum: ["BUY", "SELL", "TP_HIT", "SL_HIT"]
 *         price:
 *           type: number
 *           description: Current price when signal was generated
 *           example: 45000.50
 *           minimum: 0.000001
 *         takeProfitPrice:
 *           type: number
 *           description: Take profit target price (optional)
 *           example: 46000.00
 *           minimum: 0.000001
 *         stopLossPrice:
 *           type: number
 *           description: Stop loss price (optional)
 *           example: 44000.00
 *           minimum: 0.000001
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: Signal timestamp (ISO 8601)
 *           example: "2024-01-15T10:30:00Z"
 *         tradeNumber:
 *           type: string
 *           description: Trade identifier for exit signals
 *           example: "TRADE_001"
 *           maxLength: 50
 *         originalEntry:
 *           type: number
 *           description: Original entry price for exit signals
 *           example: 45000.00
 *           minimum: 0.000001
 *         metadata:
 *           type: object
 *           description: Additional strategy-specific data
 *           example: { "rsi": 70, "volume": 1500000 }
 *     WebhookResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Alert received and queued for processing"
 *         alertId:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         timestamp:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00Z"
 *
 * @swagger
 * /api/webhooks/tradingview:
 *   post:
 *     summary: Receive TradingView alerts
 *     description: |
 *       Endpoint for receiving trading alerts from TradingView. Supports entry signals (BUY/SELL) and exit signals (TP_HIT/SL_HIT).
 *       
 *       **Signal Types:**
 *       - `BUY`: Long entry signal
 *       - `SELL`: Short entry signal  
 *       - `TP_HIT`: Take profit hit (exit signal)
 *       - `SL_HIT`: Stop loss hit (exit signal)
 *       
 *       **Authentication:**
 *       - Optional webhook signature verification via `X-TradingView-Signature` header
 *       - Configure `TRADINGVIEW_WEBHOOK_SECRET` environment variable for signature verification
 *       
 *       **Rate Limiting:**
 *       - Maximum 1000 requests per hour per IP
 *       - Alerts are processed asynchronously for optimal performance
 *     tags: [Webhooks]
 *     security:
 *       - WebhookSignature: []
 *     parameters:
 *       - in: header
 *         name: X-TradingView-Signature
 *         schema:
 *           type: string
 *           pattern: "^sha256=[a-f0-9]{64}$"
 *         description: HMAC-SHA256 signature for webhook verification (optional)
 *         example: "sha256=a1b2c3d4e5f6..."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TradingViewWebhook'
 *           examples:
 *             buySignal:
 *               summary: BUY Signal Example
 *               value:
 *                 symbol: "BTCUSDT"
 *                 timeframe: "1h"
 *                 strategy: "RSI Divergence"
 *                 signal: "BUY"
 *                 price: 45000.50
 *                 takeProfitPrice: 46000.00
 *                 stopLossPrice: 44000.00
 *                 timestamp: "2024-01-15T10:30:00Z"
 *                 metadata:
 *                   rsi: 30
 *                   volume: 1500000
 *             sellSignal:
 *               summary: SELL Signal Example
 *               value:
 *                 symbol: "EURUSD"
 *                 timeframe: "4h"
 *                 strategy: "Moving Average Crossover"
 *                 signal: "SELL"
 *                 price: 1.0850
 *                 takeProfitPrice: 1.0800
 *                 stopLossPrice: 1.0900
 *                 timestamp: "2024-01-15T10:30:00Z"
 *             tpHitSignal:
 *               summary: Take Profit Hit Example
 *               value:
 *                 symbol: "BTCUSDT"
 *                 timeframe: "1h"
 *                 strategy: "RSI Divergence"
 *                 signal: "TP_HIT"
 *                 price: 46000.00
 *                 tradeNumber: "TRADE_001"
 *                 originalEntry: 45000.50
 *                 timestamp: "2024-01-15T11:45:00Z"
 *             slHitSignal:
 *               summary: Stop Loss Hit Example
 *               value:
 *                 symbol: "BTCUSDT"
 *                 timeframe: "1h"
 *                 strategy: "RSI Divergence"
 *                 signal: "SL_HIT"
 *                 price: 44000.00
 *                 tradeNumber: "TRADE_001"
 *                 originalEntry: 45000.50
 *                 timestamp: "2024-01-15T10:45:00Z"
 *     responses:
 *       200:
 *         description: Alert received and queued for processing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookResponse'
 *             example:
 *               success: true
 *               message: "Alert received and queued for processing"
 *               alertId: "507f1f77bcf86cd799439011"
 *               timestamp: "2024-01-15T10:30:00Z"
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Missing required fields: symbol, timeframe, strategy, signal, price"
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                       message:
 *                         type: string
 *       401:
 *         description: Invalid webhook signature
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid webhook signature"
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Rate limit exceeded. Maximum 1000 requests per hour."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error processing webhook"
 */

/**
 * @swagger
 * /api/webhooks/test:
 *   post:
 *     summary: Test webhook endpoint
 *     description: |
 *       Simple test endpoint for webhook testing and debugging.
 *       Accepts any JSON payload and returns it with additional metadata.
 *     tags: [Webhooks]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: Test message
 *                 example: "Hello webhook!"
 *               data:
 *                 type: object
 *                 description: Any test data
 *                 example: { "test": true, "value": 123 }
 *           examples:
 *             simple:
 *               summary: Simple Test
 *               value:
 *                 message: "Hello webhook!"
 *             withData:
 *               summary: Test with Data
 *               value:
 *                 message: "Test message"
 *                 data:
 *                   test: true
 *                   value: 123
 *                   timestamp: "2024-01-15T10:30:00Z"
 *     responses:
 *       200:
 *         description: Test webhook received successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Test webhook received successfully"
 *                 data:
 *                   type: object
 *                   description: Original request body
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-15T10:30:00Z"
 *                 receivedFrom:
 *                   type: string
 *                   description: Client IP address
 *                   example: "192.168.1.100"
 */

/**
 * @swagger
 * /api/webhooks/stats:
 *   get:
 *     summary: Get webhook statistics
 *     description: |
 *       Retrieve statistics about webhook processing including:
 *       - Alert counts by status
 *       - Recent alerts summary
 *       - Processing performance metrics
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Webhook statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 stats:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         description: Status name
 *                         example: "processed"
 *                       count:
 *                         type: number
 *                         description: Number of alerts with this status
 *                         example: 150
 *                 recentAlerts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "507f1f77bcf86cd799439011"
 *                       alertData:
 *                         type: object
 *                         properties:
 *                           symbol:
 *                             type: string
 *                             example: "BTCUSDT"
 *                           signal:
 *                             type: string
 *                             example: "BUY"
 *                           strategy:
 *                             type: string
 *                             example: "RSI Divergence"
 *                       processing:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                             example: "processed"
 *                       webhook:
 *                         type: object
 *                         properties:
 *                           receivedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00Z"
 *       401:
 *         description: Unauthorized - Authentication required
 *       500:
 *         description: Internal server error
 */

// Webhook routes
router.post('/tradingview', 
  validateWebhookSignature,
  validateTradingViewWebhook,
  handleValidationErrors,
  webhookController.processTradingViewWebhook
);

router.post('/tp-sl', (req, res) => {
  res.status(501).json({ 
    success: false,
    message: 'TP/SL webhook not implemented yet',
    timestamp: new Date().toISOString()
  });
});

router.post('/stripe', (req, res) => {
  res.status(501).json({ 
    success: false,
    message: 'Stripe webhook not implemented yet',
    timestamp: new Date().toISOString()
  });
});

router.post('/test', 
  validateTestWebhook,
  handleValidationErrors,
  webhookController.testWebhook
);

router.get('/stats', webhookController.getWebhookStats);

module.exports = router;