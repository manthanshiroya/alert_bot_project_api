const TelegramBot = require('node-telegram-bot-api');
const { Bot, Chat, Message } = require('../models');
const { logger } = require('../utils');
const { validateTelegramToken, sanitizeText, formatMessage, sleep, retry } = require('../utils/helpers');

class TelegramService {
  constructor() {
    this.bots = new Map(); // Store active bot instances
    this.webhookSecrets = new Map(); // Store webhook secrets
    this.rateLimits = new Map(); // Track rate limits per bot
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      logger.info('Initializing Telegram Service');
      
      // Load all active bots from database
      const activeBots = await Bot.find({ status: 'active' });
      
      for (const botData of activeBots) {
        await this.initializeBot(botData);
      }
      
      logger.info(`Initialized ${activeBots.length} Telegram bots`);
    } catch (error) {
      logger.error('Failed to initialize Telegram Service:', error);
      throw error;
    }
  }

  /**
   * Initialize a single bot
   */
  async initializeBot(botData) {
    try {
      const { _id, token, name, webhookUrl, webhookSecret } = botData;
      
      // Validate token
      if (!validateTelegramToken(token)) {
        throw new Error(`Invalid Telegram token for bot ${name}`);
      }

      // Create bot instance
      const bot = new TelegramBot(token, {
        polling: false, // We use webhooks
        request: {
          agentOptions: {
            keepAlive: true,
            family: 4
          }
        }
      });

      // Set webhook if configured
      if (webhookUrl) {
        await this.setWebhook(bot, webhookUrl, webhookSecret);
      }

      // Store bot instance
      this.bots.set(_id.toString(), {
        instance: bot,
        data: botData,
        lastActivity: new Date()
      });

      // Store webhook secret
      if (webhookSecret) {
        this.webhookSecrets.set(_id.toString(), webhookSecret);
      }

      // Initialize rate limiting
      this.rateLimits.set(_id.toString(), {
        messages: [],
        lastReset: Date.now()
      });

      logger.info(`Initialized bot: ${name} (${_id})`);
      
      return bot;
    } catch (error) {
      logger.error(`Failed to initialize bot ${botData.name}:`, error);
      throw error;
    }
  }

  /**
   * Set webhook for a bot
   */
  async setWebhook(bot, webhookUrl, secret) {
    try {
      const options = {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query', 'inline_query'],
        drop_pending_updates: true
      };

      if (secret) {
        options.secret_token = secret;
      }

      await bot.setWebHook(webhookUrl, options);
      logger.info(`Webhook set for bot: ${webhookUrl}`);
    } catch (error) {
      logger.error('Failed to set webhook:', error);
      throw error;
    }
  }

  /**
   * Register a new bot
   */
  async registerBot(userId, botData) {
    try {
      const { name, token, description, webhookUrl } = botData;
      
      // Validate token
      if (!validateTelegramToken(token)) {
        throw new Error('Invalid Telegram bot token');
      }

      // Test bot token by getting bot info
      const tempBot = new TelegramBot(token, { polling: false });
      const botInfo = await tempBot.getMe();
      
      if (!botInfo) {
        throw new Error('Failed to verify bot token');
      }

      // Check if bot already exists
      const existingBot = await Bot.findOne({ 
        $or: [
          { token },
          { telegramId: botInfo.id }
        ]
      });

      if (existingBot) {
        throw new Error('Bot already registered');
      }

      // Generate webhook secret
      const webhookSecret = this.generateWebhookSecret();

      // Create bot record
      const bot = new Bot({
        userId,
        name: name || botInfo.first_name,
        token,
        description,
        telegramId: botInfo.id,
        username: botInfo.username,
        firstName: botInfo.first_name,
        canJoinGroups: botInfo.can_join_groups,
        canReadAllGroupMessages: botInfo.can_read_all_group_messages,
        supportsInlineQueries: botInfo.supports_inline_queries,
        webhookUrl,
        webhookSecret,
        status: 'active'
      });

      await bot.save();

      // Initialize the bot
      await this.initializeBot(bot);

      logger.info(`Bot registered: ${name} by user ${userId}`);
      
      return bot;
    } catch (error) {
      logger.error('Failed to register bot:', error);
      throw error;
    }
  }

  /**
   * Update bot configuration
   */
  async updateBot(botId, userId, updateData) {
    try {
      const bot = await Bot.findOne({ _id: botId, userId });
      
      if (!bot) {
        throw new Error('Bot not found');
      }

      // Update allowed fields
      const allowedFields = ['name', 'description', 'webhookUrl', 'status'];
      const updates = {};
      
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updates[field] = updateData[field];
        }
      }

      // If webhook URL changed, update webhook
      if (updates.webhookUrl && updates.webhookUrl !== bot.webhookUrl) {
        const botInstance = this.getBotInstance(botId);
        if (botInstance) {
          await this.setWebhook(botInstance.instance, updates.webhookUrl, bot.webhookSecret);
        }
      }

      // Update database
      Object.assign(bot, updates);
      await bot.save();

      // Update in-memory bot data
      const botInstance = this.bots.get(botId);
      if (botInstance) {
        botInstance.data = bot;
      }

      logger.info(`Bot updated: ${botId}`);
      
      return bot;
    } catch (error) {
      logger.error('Failed to update bot:', error);
      throw error;
    }
  }

  /**
   * Delete a bot
   */
  async deleteBot(botId, userId) {
    try {
      const bot = await Bot.findOne({ _id: botId, userId });
      
      if (!bot) {
        throw new Error('Bot not found');
      }

      // Remove webhook
      const botInstance = this.getBotInstance(botId);
      if (botInstance) {
        try {
          await botInstance.instance.deleteWebHook();
        } catch (error) {
          logger.warn('Failed to delete webhook:', error);
        }
      }

      // Remove from memory
      this.bots.delete(botId);
      this.webhookSecrets.delete(botId);
      this.rateLimits.delete(botId);

      // Delete from database
      await Bot.deleteOne({ _id: botId });

      // Delete related chats and messages
      await Chat.deleteMany({ botId });
      await Message.deleteMany({ botId });

      logger.info(`Bot deleted: ${botId}`);
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete bot:', error);
      throw error;
    }
  }

  /**
   * Send a message
   */
  async sendMessage(botId, chatId, messageData) {
    try {
      const botInstance = this.getBotInstance(botId);
      
      if (!botInstance) {
        throw new Error('Bot not found or not initialized');
      }

      // Check rate limits
      await this.checkRateLimit(botId);

      const { text, parseMode, replyMarkup, disablePreview, disableNotification } = messageData;
      
      // Sanitize text
      const sanitizedText = sanitizeText(text);
      
      if (!sanitizedText || sanitizedText.length === 0) {
        throw new Error('Message text is required');
      }

      // Prepare options
      const options = {
        parse_mode: parseMode || 'HTML',
        disable_web_page_preview: disablePreview || false,
        disable_notification: disableNotification || false
      };

      if (replyMarkup) {
        options.reply_markup = replyMarkup;
      }

      // Send message with retry logic
      const result = await retry(async () => {
        return await botInstance.instance.sendMessage(chatId, sanitizedText, options);
      }, 3, 1000);

      // Save message to database
      const message = new Message({
        botId,
        chatId: chatId.toString(),
        messageId: result.message_id,
        text: sanitizedText,
        parseMode,
        direction: 'outgoing',
        status: 'sent',
        sentAt: new Date(result.date * 1000)
      });

      await message.save();

      // Update bot activity
      botInstance.lastActivity = new Date();

      // Track rate limit
      this.trackRateLimit(botId);

      logger.info(`Message sent: ${botId} -> ${chatId}`);
      
      return {
        messageId: result.message_id,
        chatId: result.chat.id,
        date: result.date,
        text: result.text
      };
    } catch (error) {
      logger.error('Failed to send message:', error);
      
      // Save failed message
      try {
        const message = new Message({
          botId,
          chatId: chatId.toString(),
          text: messageData.text,
          direction: 'outgoing',
          status: 'failed',
          error: error.message
        });
        await message.save();
      } catch (saveError) {
        logger.error('Failed to save failed message:', saveError);
      }
      
      throw error;
    }
  }

  /**
   * Handle incoming webhook
   */
  async handleWebhook(botId, update, signature) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(botId, update, signature)) {
        throw new Error('Invalid webhook signature');
      }

      const botInstance = this.getBotInstance(botId);
      
      if (!botInstance) {
        throw new Error('Bot not found');
      }

      // Process different update types
      if (update.message) {
        await this.handleMessage(botId, update.message);
      } else if (update.callback_query) {
        await this.handleCallbackQuery(botId, update.callback_query);
      } else if (update.inline_query) {
        await this.handleInlineQuery(botId, update.inline_query);
      }

      // Update bot activity
      botInstance.lastActivity = new Date();

      logger.debug(`Webhook processed: ${botId}`);
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to handle webhook:', error);
      throw error;
    }
  }

  /**
   * Handle incoming message
   */
  async handleMessage(botId, message) {
    try {
      const chatId = message.chat.id.toString();
      
      // Save or update chat
      await this.saveChat(botId, message.chat);
      
      // Save message
      const messageDoc = new Message({
        botId,
        chatId,
        messageId: message.message_id,
        text: message.text || '',
        direction: 'incoming',
        status: 'received',
        sentAt: new Date(message.date * 1000),
        from: {
          id: message.from.id,
          firstName: message.from.first_name,
          lastName: message.from.last_name,
          username: message.from.username
        }
      });

      await messageDoc.save();

      logger.debug(`Message received: ${botId} <- ${chatId}`);
    } catch (error) {
      logger.error('Failed to handle message:', error);
    }
  }

  /**
   * Handle callback query
   */
  async handleCallbackQuery(botId, callbackQuery) {
    try {
      const botInstance = this.getBotInstance(botId);
      
      if (botInstance) {
        // Answer callback query
        await botInstance.instance.answerCallbackQuery(callbackQuery.id);
      }

      logger.debug(`Callback query handled: ${botId}`);
    } catch (error) {
      logger.error('Failed to handle callback query:', error);
    }
  }

  /**
   * Handle inline query
   */
  async handleInlineQuery(botId, inlineQuery) {
    try {
      const botInstance = this.getBotInstance(botId);
      
      if (botInstance) {
        // Answer inline query with empty results for now
        await botInstance.instance.answerInlineQuery(inlineQuery.id, []);
      }

      logger.debug(`Inline query handled: ${botId}`);
    } catch (error) {
      logger.error('Failed to handle inline query:', error);
    }
  }

  /**
   * Save or update chat information
   */
  async saveChat(botId, chatData) {
    try {
      const chatId = chatData.id.toString();
      
      const chatDoc = await Chat.findOneAndUpdate(
        { botId, chatId },
        {
          botId,
          chatId,
          type: chatData.type,
          title: chatData.title,
          username: chatData.username,
          firstName: chatData.first_name,
          lastName: chatData.last_name,
          description: chatData.description,
          lastActivity: new Date()
        },
        { upsert: true, new: true }
      );

      return chatDoc;
    } catch (error) {
      logger.error('Failed to save chat:', error);
      throw error;
    }
  }

  /**
   * Get bot instance
   */
  getBotInstance(botId) {
    return this.bots.get(botId.toString());
  }

  /**
   * Get all active bots
   */
  getActiveBots() {
    return Array.from(this.bots.values()).map(bot => ({
      id: bot.data._id,
      name: bot.data.name,
      username: bot.data.username,
      status: bot.data.status,
      lastActivity: bot.lastActivity
    }));
  }

  /**
   * Check rate limits
   */
  async checkRateLimit(botId) {
    const rateLimit = this.rateLimits.get(botId);
    
    if (!rateLimit) {
      return;
    }

    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxMessages = 30; // 30 messages per minute

    // Reset if window expired
    if (now - rateLimit.lastReset > windowMs) {
      rateLimit.messages = [];
      rateLimit.lastReset = now;
    }

    // Remove old messages
    rateLimit.messages = rateLimit.messages.filter(time => now - time < windowMs);

    // Check limit
    if (rateLimit.messages.length >= maxMessages) {
      const waitTime = windowMs - (now - rateLimit.messages[0]);
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds`);
    }
  }

  /**
   * Track rate limit
   */
  trackRateLimit(botId) {
    const rateLimit = this.rateLimits.get(botId);
    
    if (rateLimit) {
      rateLimit.messages.push(Date.now());
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(botId, update, signature) {
    const secret = this.webhookSecrets.get(botId);
    
    if (!secret || !signature) {
      return false;
    }

    // Implement signature verification logic
    // This is a simplified version - implement proper HMAC verification
    return signature === secret;
  }

  /**
   * Generate webhook secret
   */
  generateWebhookSecret() {
    return require('crypto').randomBytes(32).toString('hex');
  }

  /**
   * Get bot statistics
   */
  async getBotStats(botId, userId) {
    try {
      const bot = await Bot.findOne({ _id: botId, userId });
      
      if (!bot) {
        throw new Error('Bot not found');
      }

      const [messageCount, chatCount] = await Promise.all([
        Message.countDocuments({ botId }),
        Chat.countDocuments({ botId })
      ]);

      const botInstance = this.getBotInstance(botId);
      
      return {
        bot: {
          id: bot._id,
          name: bot.name,
          username: bot.username,
          status: bot.status,
          createdAt: bot.createdAt
        },
        stats: {
          totalMessages: messageCount,
          totalChats: chatCount,
          isActive: !!botInstance,
          lastActivity: botInstance?.lastActivity
        }
      };
    } catch (error) {
      logger.error('Failed to get bot stats:', error);
      throw error;
    }
  }

  /**
   * Cleanup inactive bots
   */
  async cleanup() {
    try {
      const inactiveThreshold = 24 * 60 * 60 * 1000; // 24 hours
      const now = Date.now();
      
      for (const [botId, botInstance] of this.bots.entries()) {
        if (now - botInstance.lastActivity.getTime() > inactiveThreshold) {
          logger.info(`Cleaning up inactive bot: ${botId}`);
          this.bots.delete(botId);
          this.webhookSecrets.delete(botId);
          this.rateLimits.delete(botId);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup bots:', error);
    }
  }

  /**
   * Shutdown service
   */
  async shutdown() {
    try {
      logger.info('Shutting down Telegram Service');
      
      // Clear all bot instances
      this.bots.clear();
      this.webhookSecrets.clear();
      this.rateLimits.clear();
      
      logger.info('Telegram Service shutdown complete');
    } catch (error) {
      logger.error('Error during Telegram Service shutdown:', error);
    }
  }
}

module.exports = TelegramService;