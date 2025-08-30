const { body, header } = require('express-validator');

// Validate TradingView webhook payload
const validateTradingViewWebhook = [
  body('symbol')
    .notEmpty()
    .withMessage('Symbol is required')
    .isString()
    .withMessage('Symbol must be a string')
    .isLength({ min: 1, max: 20 })
    .withMessage('Symbol must be between 1 and 20 characters')
    .matches(/^[A-Z0-9._-]+$/i)
    .withMessage('Symbol contains invalid characters'),
    
  body('timeframe')
    .notEmpty()
    .withMessage('Timeframe is required')
    .isString()
    .withMessage('Timeframe must be a string')
    .isIn(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'])
    .withMessage('Invalid timeframe. Must be one of: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M'),
    
  body('strategy')
    .notEmpty()
    .withMessage('Strategy is required')
    .isString()
    .withMessage('Strategy must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('Strategy name must be between 1 and 100 characters'),
    
  body('signal')
    .notEmpty()
    .withMessage('Signal is required')
    .isString()
    .withMessage('Signal must be a string')
    .isIn(['BUY', 'SELL', 'TP_HIT', 'SL_HIT', 'buy', 'sell', 'tp_hit', 'sl_hit'])
    .withMessage('Invalid signal. Must be one of: BUY, SELL, TP_HIT, SL_HIT'),
    
  body('price')
    .notEmpty()
    .withMessage('Price is required')
    .isNumeric()
    .withMessage('Price must be a number')
    .isFloat({ min: 0.000001 })
    .withMessage('Price must be a positive number'),
    
  body('takeProfitPrice')
    .optional()
    .isNumeric()
    .withMessage('Take profit price must be a number')
    .isFloat({ min: 0.000001 })
    .withMessage('Take profit price must be a positive number'),
    
  body('stopLossPrice')
    .optional()
    .isNumeric()
    .withMessage('Stop loss price must be a number')
    .isFloat({ min: 0.000001 })
    .withMessage('Stop loss price must be a positive number'),
    
  body('timestamp')
    .optional()
    .isISO8601()
    .withMessage('Timestamp must be a valid ISO 8601 date'),
    
  body('tradeNumber')
    .optional()
    .isString()
    .withMessage('Trade number must be a string')
    .isLength({ max: 50 })
    .withMessage('Trade number must not exceed 50 characters'),
    
  body('originalEntry')
    .optional()
    .isNumeric()
    .withMessage('Original entry price must be a number')
    .isFloat({ min: 0.000001 })
    .withMessage('Original entry price must be a positive number'),
    
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
    
  // Custom validation for signal-specific requirements
  body().custom((value, { req }) => {
    const { signal, takeProfitPrice, stopLossPrice } = req.body;
    
    // For entry signals (BUY/SELL), TP and SL are recommended but not required
    if (['BUY', 'buy', 'SELL', 'sell'].includes(signal)) {
      // Optional: Add validation for TP/SL relationship with entry price
      if (takeProfitPrice && stopLossPrice) {
        const price = parseFloat(req.body.price);
        const tp = parseFloat(takeProfitPrice);
        const sl = parseFloat(stopLossPrice);
        
        if (signal.toUpperCase() === 'BUY') {
          if (tp <= price) {
            throw new Error('Take profit price must be higher than entry price for BUY signals');
          }
          if (sl >= price) {
            throw new Error('Stop loss price must be lower than entry price for BUY signals');
          }
        } else if (signal.toUpperCase() === 'SELL') {
          if (tp >= price) {
            throw new Error('Take profit price must be lower than entry price for SELL signals');
          }
          if (sl <= price) {
            throw new Error('Stop loss price must be higher than entry price for SELL signals');
          }
        }
      }
    }
    
    // For exit signals (TP_HIT/SL_HIT), trade number is recommended
    if (['TP_HIT', 'tp_hit', 'SL_HIT', 'sl_hit'].includes(signal)) {
      // This is just a warning - we don't enforce it as required
      // because some strategies might not use trade numbers
    }
    
    return true;
  })
];

// Validate webhook signature header (optional)
const validateWebhookSignature = [
  header('x-tradingview-signature')
    .optional()
    .isString()
    .withMessage('Webhook signature must be a string')
    .matches(/^sha256=[a-f0-9]{64}$/)
    .withMessage('Invalid webhook signature format. Must be sha256=<hex>')
];

// Validate test webhook payload (more lenient)
const validateTestWebhook = [
  body('message')
    .optional()
    .isString()
    .withMessage('Message must be a string')
    .isLength({ max: 500 })
    .withMessage('Message must not exceed 500 characters'),
    
  body('data')
    .optional()
    .isObject()
    .withMessage('Data must be an object')
];

// Validate webhook stats query parameters
const validateWebhookStatsQuery = [
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
    
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
    
  body('symbol')
    .optional()
    .isString()
    .withMessage('Symbol must be a string')
    .isLength({ max: 20 })
    .withMessage('Symbol must not exceed 20 characters'),
    
  body('strategy')
    .optional()
    .isString()
    .withMessage('Strategy must be a string')
    .isLength({ max: 100 })
    .withMessage('Strategy must not exceed 100 characters'),
    
  body('status')
    .optional()
    .isString()
    .withMessage('Status must be a string')
    .isIn(['received', 'processing', 'processed', 'failed'])
    .withMessage('Invalid status. Must be one of: received, processing, processed, failed')
];

module.exports = {
  validateTradingViewWebhook,
  validateWebhookSignature,
  validateTestWebhook,
  validateWebhookStatsQuery
};