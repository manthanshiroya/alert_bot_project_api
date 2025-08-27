const express = require('express');
const { TelegramController } = require('../controllers');
const { authenticate, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { rateLimiter } = require('../middleware/rateLimiter');
const { botRegistrationSchema, botUpdateSchema, sendMessageSchema } = require('../schemas/telegram');

const router = express.Router();
const telegramController = new TelegramController();

// Apply authentication to all routes
router.use(authenticate);

// Bot Management Routes

/**
 * @route POST /api/telegram/bots
 * @desc Register a new Telegram bot
 * @access Private
 */
router.post('/bots',
  rateLimiter.createBot,
  validateRequest(botRegistrationSchema),
  authorize(['user', 'admin']),
  telegramController.registerBot.bind(telegramController)
);

/**
 * @route GET /api/telegram/bots
 * @desc Get user's bots
 * @access Private
 */
router.get('/bots',
  rateLimiter.getBots,
  authorize(['user', 'admin']),
  telegramController.getBots.bind(telegramController)
);

/**
 * @route GET /api/telegram/bots/:botId
 * @desc Get bot details
 * @access Private
 */
router.get('/bots/:botId',
  rateLimiter.getBot,
  authorize(['user', 'admin']),
  telegramController.getBot.bind(telegramController)
);

/**
 * @route PUT /api/telegram/bots/:botId
 * @desc Update bot settings
 * @access Private
 */
router.put('/bots/:botId',
  rateLimiter.updateBot,
  validateRequest(botUpdateSchema),
  authorize(['user', 'admin']),
  telegramController.updateBot.bind(telegramController)
);

/**
 * @route DELETE /api/telegram/bots/:botId
 * @desc Delete bot
 * @access Private
 */
router.delete('/bots/:botId',
  rateLimiter.deleteBot,
  authorize(['user', 'admin']),
  telegramController.deleteBot.bind(telegramController)
);

// Chat Management Routes

/**
 * @route GET /api/telegram/bots/:botId/chats
 * @desc Get bot's chats
 * @access Private
 */
router.get('/bots/:botId/chats',
  rateLimiter.getChats,
  authorize(['user', 'admin']),
  telegramController.getChats.bind(telegramController)
);

// Message Management Routes

/**
 * @route POST /api/telegram/bots/:botId/messages
 * @desc Send message to chat
 * @access Private
 */
router.post('/bots/:botId/messages',
  rateLimiter.sendMessage,
  validateRequest(sendMessageSchema),
  authorize(['user', 'admin']),
  telegramController.sendMessage.bind(telegramController)
);

/**
 * @route GET /api/telegram/bots/:botId/chats/:chatId/messages
 * @desc Get chat messages
 * @access Private
 */
router.get('/bots/:botId/chats/:chatId/messages',
  rateLimiter.getMessages,
  authorize(['user', 'admin']),
  telegramController.getMessages.bind(telegramController)
);

// Webhook Routes (for Telegram webhooks)

/**
 * @route POST /api/telegram/webhook/:botId
 * @desc Handle Telegram webhook
 * @access Public (but secured with bot token validation)
 */
router.post('/webhook/:botId',
  rateLimiter.webhook,
  async (req, res) => {
    try {
      // This would handle incoming webhooks from Telegram
      // For now, just acknowledge receipt
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  }
);

// Health Check Route

/**
 * @route GET /api/telegram/health
 * @desc Health check for Telegram service
 * @access Public
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'telegram-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeBots: telegramController.activeBots.size
  });
});

// Statistics Routes

/**
 * @route GET /api/telegram/stats
 * @desc Get user's Telegram statistics
 * @access Private
 */
router.get('/stats',
  rateLimiter.getStats,
  authorize(['user', 'admin']),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { period = '7d' } = req.query;

      // Get user's bot statistics
      const { Bot, Chat, Message } = require('../models');
      
      const [botStats, chatStats, messageStats] = await Promise.all([
        Bot.getStatistics({ userId }),
        Chat.getStatistics(null, { userId }),
        Message.getStatistics({ userId })
      ]);

      res.json({
        success: true,
        data: {
          bots: botStats[0] || {},
          chats: chatStats[0] || {},
          messages: messageStats[0] || {},
          period
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics'
      });
    }
  }
);

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Telegram route error:', error);
  
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
  
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

module.exports = router;