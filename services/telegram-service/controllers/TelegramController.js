const { Bot, Chat, Message } = require('../models');
const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const { validateTelegramToken, sanitizeInput } = require('../utils/validation');
const { generateId } = require('../utils/helpers');
const EventEmitter = require('events');

/**
 * TelegramController
 * Handles Telegram bot operations, chat management, and message sending
 */
class TelegramController extends EventEmitter {
  constructor() {
    super();
    this.activeBots = new Map(); // Store active bot instances
    this.botTokens = new Map(); // Store bot tokens securely
  }

  /**
   * Register a new Telegram bot
   */
  async registerBot(req, res) {
    try {
      const { botToken, botName, settings = {} } = req.body;
      const userId = req.user.id;

      // Validate bot token
      if (!validateTelegramToken(botToken)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Telegram bot token format'
        });
      }

      // Test bot token by getting bot info
      const tempBot = new TelegramBot(botToken);
      let botInfo;
      
      try {
        botInfo = await tempBot.getMe();
      } catch (error) {
        logger.error('Failed to validate bot token:', error);
        return res.status(400).json({
          success: false,
          message: 'Invalid bot token or bot is not accessible'
        });
      }

      // Check if bot already exists
      const existingBot = await Bot.findOne({
        $or: [
          { botToken },
          { telegramBotId: botInfo.id.toString() }
        ]
      });

      if (existingBot) {
        return res.status(409).json({
          success: false,
          message: 'Bot is already registered'
        });
      }

      // Create new bot record
      const bot = new Bot({
        userId,
        botToken,
        telegramBotId: botInfo.id.toString(),
        username: botInfo.username,
        name: botName || botInfo.first_name,
        isActive: true,
        isVerified: true,
        settings: {
          messageFormat: settings.messageFormat || 'markdown',
          enableNotifications: settings.enableNotifications !== false,
          rateLimitPerMinute: settings.rateLimitPerMinute || 30,
          customCommands: settings.customCommands || [],
          ...settings
        },
        telegramInfo: {
          id: botInfo.id,
          firstName: botInfo.first_name,
          username: botInfo.username,
          canJoinGroups: botInfo.can_join_groups,
          canReadAllGroupMessages: botInfo.can_read_all_group_messages,
          supportsInlineQueries: botInfo.supports_inline_queries
        }
      });

      await bot.save();

      // Initialize bot instance
      await this.initializeBot(bot._id, botToken);

      logger.info(`Bot registered successfully: ${botInfo.username}`, {
        userId,
        botId: bot._id,
        username: botInfo.username
      });

      // Emit event
      this.emit('botRegistered', {
        botId: bot._id,
        userId,
        username: botInfo.username
      });

      res.status(201).json({
        success: true,
        message: 'Bot registered successfully',
        data: {
          botId: bot._id,
          username: botInfo.username,
          name: bot.name,
          isActive: bot.isActive
        }
      });

    } catch (error) {
      logger.error('Error registering bot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to register bot',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get user's bots
   */
  async getBots(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10, status, search } = req.query;

      const query = { userId, deletedAt: null };

      if (status) {
        if (status === 'active') {
          query.isActive = true;
        } else if (status === 'inactive') {
          query.isActive = false;
        }
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * limit;
      const bots = await Bot.find(query)
        .select('-botToken -webhookSecret') // Exclude sensitive data
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Bot.countDocuments(query);

      res.json({
        success: true,
        data: {
          bots,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching bots:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bots'
      });
    }
  }

  /**
   * Get bot details
   */
  async getBot(req, res) {
    try {
      const { botId } = req.params;
      const userId = req.user.id;

      const bot = await Bot.findOne({
        _id: botId,
        userId,
        deletedAt: null
      }).select('-botToken -webhookSecret');

      if (!bot) {
        return res.status(404).json({
          success: false,
          message: 'Bot not found'
        });
      }

      // Get bot statistics
      const stats = await this.getBotStatistics(botId);

      res.json({
        success: true,
        data: {
          bot,
          stats
        }
      });

    } catch (error) {
      logger.error('Error fetching bot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bot'
      });
    }
  }

  /**
   * Update bot settings
   */
  async updateBot(req, res) {
    try {
      const { botId } = req.params;
      const userId = req.user.id;
      const updates = sanitizeInput(req.body);

      const bot = await Bot.findOne({
        _id: botId,
        userId,
        deletedAt: null
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          message: 'Bot not found'
        });
      }

      // Update allowed fields
      const allowedUpdates = ['name', 'settings', 'isActive'];
      const updateData = {};

      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          if (field === 'settings') {
            updateData.settings = { ...bot.settings, ...updates.settings };
          } else {
            updateData[field] = updates[field];
          }
        }
      });

      Object.assign(bot, updateData);
      await bot.save();

      // Restart bot if settings changed
      if (updates.settings && this.activeBots.has(botId)) {
        await this.restartBot(botId);
      }

      logger.info(`Bot updated: ${bot.username}`, {
        userId,
        botId,
        updates: Object.keys(updateData)
      });

      res.json({
        success: true,
        message: 'Bot updated successfully',
        data: {
          bot: await Bot.findById(botId).select('-botToken -webhookSecret')
        }
      });

    } catch (error) {
      logger.error('Error updating bot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update bot'
      });
    }
  }

  /**
   * Delete bot
   */
  async deleteBot(req, res) {
    try {
      const { botId } = req.params;
      const userId = req.user.id;

      const bot = await Bot.findOne({
        _id: botId,
        userId,
        deletedAt: null
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          message: 'Bot not found'
        });
      }

      // Stop bot instance
      await this.stopBot(botId);

      // Soft delete bot
      await bot.softDelete();

      // Soft delete associated chats
      await Chat.updateMany(
        { botId, deletedAt: null },
        { deletedAt: new Date(), isActive: false }
      );

      logger.info(`Bot deleted: ${bot.username}`, {
        userId,
        botId
      });

      // Emit event
      this.emit('botDeleted', {
        botId,
        userId,
        username: bot.username
      });

      res.json({
        success: true,
        message: 'Bot deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting bot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete bot'
      });
    }
  }

  /**
   * Send message to chat
   */
  async sendMessage(req, res) {
    try {
      const { botId } = req.params;
      const userId = req.user.id;
      const {
        chatId,
        text,
        parseMode = 'Markdown',
        disableWebPagePreview = false,
        disableNotification = false,
        replyToMessageId,
        inlineKeyboard
      } = req.body;

      // Validate required fields
      if (!chatId || !text) {
        return res.status(400).json({
          success: false,
          message: 'Chat ID and text are required'
        });
      }

      // Get bot
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

      // Get chat
      const chat = await Chat.findOne({
        _id: chatId,
        botId,
        userId,
        deletedAt: null
      });

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat not found'
        });
      }

      // Check if chat can receive messages
      if (!chat.canSendMessage()) {
        return res.status(400).json({
          success: false,
          message: 'Cannot send message to this chat at this time'
        });
      }

      // Create message record
      const message = new Message({
        messageId: generateId(),
        botId,
        chatId,
        userId,
        telegramChatId: chat.chatId,
        direction: 'outbound',
        messageType: 'text',
        content: {
          text: text.substring(0, 4096), // Telegram limit
          entities: []
        },
        parseMode,
        options: {
          disableWebPagePreview,
          disableNotification,
          replyToMessageId
        },
        inlineKeyboard: inlineKeyboard || [],
        status: 'pending',
        analytics: {
          source: 'manual'
        }
      });

      await message.save();

      // Send message via Telegram
      const result = await this.sendTelegramMessage(botId, message);

      if (result.success) {
        await message.markAsSent(result.telegramResponse);
        await chat.incrementMessageCount('sent');
        await bot.incrementMessageCount('sent');

        res.status(201).json({
          success: true,
          message: 'Message sent successfully',
          data: {
            messageId: message._id,
            telegramMessageId: result.telegramResponse.message_id,
            status: 'sent'
          }
        });
      } else {
        await message.markAsFailed(result.error);
        await bot.incrementErrorCount();

        res.status(400).json({
          success: false,
          message: 'Failed to send message',
          error: result.error.message
        });
      }

    } catch (error) {
      logger.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send message'
      });
    }
  }

  /**
   * Get chat messages
   */
  async getMessages(req, res) {
    try {
      const { botId, chatId } = req.params;
      const userId = req.user.id;
      const { page = 1, limit = 50, direction, messageType } = req.query;

      // Verify bot ownership
      const bot = await Bot.findOne({
        _id: botId,
        userId,
        deletedAt: null
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          message: 'Bot not found'
        });
      }

      // Verify chat ownership
      const chat = await Chat.findOne({
        _id: chatId,
        botId,
        userId,
        deletedAt: null
      });

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat not found'
        });
      }

      const options = {
        limit: parseInt(limit),
        skip: (page - 1) * limit,
        direction,
        messageType,
        excludeDeleted: true
      };

      const messages = await Message.findByChatId(chatId, options);
      const total = await Message.countDocuments({
        chatId,
        deletedAt: null,
        ...(direction && { direction }),
        ...(messageType && { messageType })
      });

      res.json({
        success: true,
        data: {
          messages,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch messages'
      });
    }
  }

  /**
   * Get bot chats
   */
  async getChats(req, res) {
    try {
      const { botId } = req.params;
      const userId = req.user.id;
      const { page = 1, limit = 20, type, status, search } = req.query;

      // Verify bot ownership
      const bot = await Bot.findOne({
        _id: botId,
        userId,
        deletedAt: null
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          message: 'Bot not found'
        });
      }

      const options = {
        limit: parseInt(limit),
        skip: (page - 1) * limit,
        type,
        activeOnly: status === 'active'
      };

      let chats = await Chat.findByBotId(botId, options);

      // Apply search filter
      if (search) {
        chats = chats.filter(chat => {
          const searchLower = search.toLowerCase();
          return (
            (chat.title && chat.title.toLowerCase().includes(searchLower)) ||
            (chat.username && chat.username.toLowerCase().includes(searchLower)) ||
            (chat.firstName && chat.firstName.toLowerCase().includes(searchLower)) ||
            (chat.lastName && chat.lastName.toLowerCase().includes(searchLower))
          );
        });
      }

      const total = await Chat.countDocuments({
        botId,
        userId,
        deletedAt: null,
        ...(type && { type }),
        ...(status === 'active' && { isActive: true })
      });

      res.json({
        success: true,
        data: {
          chats,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching chats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch chats'
      });
    }
  }

  /**
   * Initialize bot instance
   */
  async initializeBot(botId, botToken) {
    try {
      if (this.activeBots.has(botId)) {
        await this.stopBot(botId);
      }

      const telegramBot = new TelegramBot(botToken, { polling: true });
      
      // Store bot instance and token
      this.activeBots.set(botId, telegramBot);
      this.botTokens.set(botId, botToken);

      // Set up event handlers
      this.setupBotEventHandlers(botId, telegramBot);

      logger.info(`Bot initialized: ${botId}`);
      return true;

    } catch (error) {
      logger.error(`Failed to initialize bot ${botId}:`, error);
      return false;
    }
  }

  /**
   * Stop bot instance
   */
  async stopBot(botId) {
    try {
      const telegramBot = this.activeBots.get(botId);
      if (telegramBot) {
        await telegramBot.stopPolling();
        this.activeBots.delete(botId);
        this.botTokens.delete(botId);
        logger.info(`Bot stopped: ${botId}`);
      }
    } catch (error) {
      logger.error(`Failed to stop bot ${botId}:`, error);
    }
  }

  /**
   * Restart bot instance
   */
  async restartBot(botId) {
    try {
      const botToken = this.botTokens.get(botId);
      if (botToken) {
        await this.stopBot(botId);
        await this.initializeBot(botId, botToken);
        logger.info(`Bot restarted: ${botId}`);
      }
    } catch (error) {
      logger.error(`Failed to restart bot ${botId}:`, error);
    }
  }

  /**
   * Setup bot event handlers
   */
  setupBotEventHandlers(botId, telegramBot) {
    // Handle incoming messages
    telegramBot.on('message', async (msg) => {
      try {
        await this.handleIncomingMessage(botId, msg);
      } catch (error) {
        logger.error(`Error handling message for bot ${botId}:`, error);
      }
    });

    // Handle callback queries
    telegramBot.on('callback_query', async (query) => {
      try {
        await this.handleCallbackQuery(botId, query);
      } catch (error) {
        logger.error(`Error handling callback query for bot ${botId}:`, error);
      }
    });

    // Handle errors
    telegramBot.on('error', async (error) => {
      logger.error(`Telegram bot error for ${botId}:`, error);
      await this.handleBotError(botId, error);
    });

    // Handle polling errors
    telegramBot.on('polling_error', async (error) => {
      logger.error(`Telegram bot polling error for ${botId}:`, error);
      await this.handleBotError(botId, error);
    });
  }

  /**
   * Handle incoming message
   */
  async handleIncomingMessage(botId, telegramMessage) {
    try {
      // Find or create chat
      let chat = await Chat.findByChatId(telegramMessage.chat.id.toString(), botId);
      
      if (!chat) {
        // Get bot info to find userId
        const bot = await Bot.findById(botId);
        if (!bot) return;

        // Create new chat
        chat = new Chat({
          chatId: telegramMessage.chat.id.toString(),
          botId,
          userId: bot.userId,
          type: telegramMessage.chat.type,
          title: telegramMessage.chat.title,
          username: telegramMessage.chat.username,
          firstName: telegramMessage.chat.first_name,
          lastName: telegramMessage.chat.last_name,
          isActive: true
        });
        
        await chat.save();
      }

      // Create message record
      const message = new Message({
        messageId: generateId(),
        botId,
        chatId: chat._id,
        userId: chat.userId,
        telegramMessageId: telegramMessage.message_id,
        telegramChatId: telegramMessage.chat.id.toString(),
        telegramUserId: telegramMessage.from?.id?.toString(),
        direction: 'inbound',
        messageType: this.getMessageType(telegramMessage),
        content: this.extractMessageContent(telegramMessage),
        status: 'delivered',
        delivery: {
          deliveredAt: new Date()
        },
        analytics: {
          source: 'telegram'
        }
      });

      await message.save();
      await chat.incrementMessageCount('received');

      // Emit event for message processing
      this.emit('messageReceived', {
        botId,
        chatId: chat._id,
        messageId: message._id,
        telegramMessage
      });

    } catch (error) {
      logger.error('Error handling incoming message:', error);
    }
  }

  /**
   * Handle callback query
   */
  async handleCallbackQuery(botId, query) {
    try {
      // Acknowledge the callback query
      const telegramBot = this.activeBots.get(botId);
      if (telegramBot) {
        await telegramBot.answerCallbackQuery(query.id);
      }

      // Emit event for callback processing
      this.emit('callbackQuery', {
        botId,
        queryId: query.id,
        data: query.data,
        messageId: query.message?.message_id,
        chatId: query.message?.chat?.id,
        userId: query.from?.id
      });

    } catch (error) {
      logger.error('Error handling callback query:', error);
    }
  }

  /**
   * Handle bot error
   */
  async handleBotError(botId, error) {
    try {
      const bot = await Bot.findById(botId);
      if (bot) {
        await bot.incrementErrorCount();
        
        // If too many errors, deactivate bot
        if (bot.stats.totalErrors > 100) {
          bot.isActive = false;
          await bot.save();
          await this.stopBot(botId);
          
          logger.warn(`Bot deactivated due to too many errors: ${botId}`);
        }
      }
    } catch (err) {
      logger.error('Error handling bot error:', err);
    }
  }

  /**
   * Send message via Telegram
   */
  async sendTelegramMessage(botId, message) {
    try {
      const telegramBot = this.activeBots.get(botId);
      if (!telegramBot) {
        throw new Error('Bot not active');
      }

      const options = {
        parse_mode: message.parseMode,
        disable_web_page_preview: message.options.disableWebPagePreview,
        disable_notification: message.options.disableNotification
      };

      if (message.options.replyToMessageId) {
        options.reply_to_message_id = message.options.replyToMessageId;
      }

      if (message.inlineKeyboard && message.inlineKeyboard.length > 0) {
        options.reply_markup = {
          inline_keyboard: message.inlineKeyboard
        };
      }

      const response = await telegramBot.sendMessage(
        message.telegramChatId,
        message.content.text,
        options
      );

      return {
        success: true,
        telegramResponse: response
      };

    } catch (error) {
      return {
        success: false,
        error: {
          code: error.code || 'TELEGRAM_ERROR',
          message: error.message,
          description: error.description,
          parameters: error.parameters
        }
      };
    }
  }

  /**
   * Get message type from Telegram message
   */
  getMessageType(telegramMessage) {
    if (telegramMessage.text) return 'text';
    if (telegramMessage.photo) return 'photo';
    if (telegramMessage.video) return 'video';
    if (telegramMessage.audio) return 'audio';
    if (telegramMessage.voice) return 'voice';
    if (telegramMessage.document) return 'document';
    if (telegramMessage.sticker) return 'sticker';
    if (telegramMessage.animation) return 'animation';
    if (telegramMessage.location) return 'location';
    if (telegramMessage.contact) return 'contact';
    if (telegramMessage.poll) return 'poll';
    if (telegramMessage.venue) return 'venue';
    if (telegramMessage.dice) return 'dice';
    if (telegramMessage.video_note) return 'video_note';
    return 'text';
  }

  /**
   * Extract content from Telegram message
   */
  extractMessageContent(telegramMessage) {
    const content = {};

    if (telegramMessage.text) {
      content.text = telegramMessage.text;
      content.entities = telegramMessage.entities || [];
    }

    if (telegramMessage.caption) {
      content.caption = telegramMessage.caption;
      content.entities = telegramMessage.caption_entities || [];
    }

    // Extract media information
    const mediaFields = ['photo', 'video', 'audio', 'voice', 'document', 'sticker', 'animation', 'video_note'];
    for (const field of mediaFields) {
      if (telegramMessage[field]) {
        const media = Array.isArray(telegramMessage[field]) ? 
          telegramMessage[field][telegramMessage[field].length - 1] : 
          telegramMessage[field];
        
        content.media = {
          fileId: media.file_id,
          fileUniqueId: media.file_unique_id,
          fileName: media.file_name,
          mimeType: media.mime_type,
          fileSize: media.file_size,
          width: media.width,
          height: media.height,
          duration: media.duration,
          thumbnail: media.thumb || media.thumbnail
        };
        break;
      }
    }

    // Extract location
    if (telegramMessage.location) {
      content.location = {
        latitude: telegramMessage.location.latitude,
        longitude: telegramMessage.location.longitude,
        horizontalAccuracy: telegramMessage.location.horizontal_accuracy,
        livePeriod: telegramMessage.location.live_period,
        heading: telegramMessage.location.heading,
        proximityAlertRadius: telegramMessage.location.proximity_alert_radius
      };
    }

    // Extract contact
    if (telegramMessage.contact) {
      content.contact = {
        phoneNumber: telegramMessage.contact.phone_number,
        firstName: telegramMessage.contact.first_name,
        lastName: telegramMessage.contact.last_name,
        userId: telegramMessage.contact.user_id?.toString(),
        vcard: telegramMessage.contact.vcard
      };
    }

    // Extract poll
    if (telegramMessage.poll) {
      content.poll = {
        id: telegramMessage.poll.id,
        question: telegramMessage.poll.question,
        options: telegramMessage.poll.options,
        totalVoterCount: telegramMessage.poll.total_voter_count,
        isClosed: telegramMessage.poll.is_closed,
        isAnonymous: telegramMessage.poll.is_anonymous,
        type: telegramMessage.poll.type,
        allowsMultipleAnswers: telegramMessage.poll.allows_multiple_answers,
        correctOptionId: telegramMessage.poll.correct_option_id,
        explanation: telegramMessage.poll.explanation,
        openPeriod: telegramMessage.poll.open_period,
        closeDate: telegramMessage.poll.close_date ? new Date(telegramMessage.poll.close_date * 1000) : null
      };
    }

    return content;
  }

  /**
   * Get bot statistics
   */
  async getBotStatistics(botId) {
    try {
      const [messageStats, chatStats] = await Promise.all([
        Message.getStatistics({ botId }),
        Chat.getStatistics(botId)
      ]);

      return {
        messages: messageStats[0] || {},
        chats: chatStats[0] || {}
      };
    } catch (error) {
      logger.error('Error getting bot statistics:', error);
      return { messages: {}, chats: {} };
    }
  }

  /**
   * Initialize all active bots on startup
   */
  async initializeAllBots() {
    try {
      const activeBots = await Bot.find({
        isActive: true,
        deletedAt: null
      });

      logger.info(`Initializing ${activeBots.length} active bots...`);

      for (const bot of activeBots) {
        await this.initializeBot(bot._id, bot.botToken);
      }

      logger.info('All active bots initialized');
    } catch (error) {
      logger.error('Error initializing bots:', error);
    }
  }

  /**
   * Stop all bots on shutdown
   */
  async stopAllBots() {
    try {
      logger.info('Stopping all bots...');
      
      const stopPromises = Array.from(this.activeBots.keys()).map(botId => 
        this.stopBot(botId)
      );
      
      await Promise.all(stopPromises);
      
      logger.info('All bots stopped');
    } catch (error) {
      logger.error('Error stopping bots:', error);
    }
  }
}

module.exports = TelegramController;