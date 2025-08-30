const TelegramUser = require('../models/TelegramUser');
const User = require('../models/User');
const Alert = require('../models/Alert');
const Trade = require('../models/Trade');
const telegramBot = require('../services/telegramBot');
const logger = require('../utils/logger');
const { formatUserStatsMessage, formatSubscriptionMessage } = require('../utils/telegramFormatter');

/**
 * Initialize Telegram bot
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const initializeBot = async (req, res) => {
  try {
    if (telegramBot.isInitialized) {
      return res.status(200).json({
        success: true,
        message: 'Telegram bot is already initialized'
      });
    }

    await telegramBot.initialize();
    
    res.status(200).json({
      success: true,
      message: 'Telegram bot initialized successfully'
    });
  } catch (error) {
    logger.error('Error initializing Telegram bot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize Telegram bot',
      error: error.message
    });
  }
};

/**
 * Stop Telegram bot
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const stopBot = async (req, res) => {
  try {
    await telegramBot.stop();
    
    res.status(200).json({
      success: true,
      message: 'Telegram bot stopped successfully'
    });
  } catch (error) {
    logger.error('Error stopping Telegram bot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop Telegram bot',
      error: error.message
    });
  }
};

/**
 * Get bot status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getBotStatus = async (req, res) => {
  try {
    const stats = await telegramBot.getBotStats();
    
    res.status(200).json({
      success: true,
      data: {
        isInitialized: telegramBot.isInitialized,
        stats
      }
    });
  } catch (error) {
    logger.error('Error getting bot status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bot status',
      error: error.message
    });
  }
};

/**
 * Get all Telegram users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getTelegramUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'all' } = req.query;
    const skip = (page - 1) * limit;
    
    let filter = {};
    if (status === 'active') {
      filter = { isActive: true, isBlocked: false };
    } else if (status === 'blocked') {
      filter = { isBlocked: true };
    } else if (status === 'inactive') {
      filter = { isActive: false };
    }
    
    const users = await TelegramUser.find(filter)
      .populate('userId', 'email username')
      .sort({ lastInteraction: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await TelegramUser.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error getting Telegram users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Telegram users',
      error: error.message
    });
  }
};

/**
 * Get specific Telegram user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getTelegramUser = async (req, res) => {
  try {
    const { telegramId } = req.params;
    
    const user = await TelegramUser.findByTelegramId(telegramId)
      .populate('userId', 'email username')
      .populate('subscriptions.alertConfigId');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Telegram user not found'
      });
    }
    
    // Get recent trades for this user
    const recentTrades = await Trade.find({ userId: user.userId })
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.status(200).json({
      success: true,
      data: {
        user,
        recentTrades
      }
    });
  } catch (error) {
    logger.error('Error getting Telegram user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Telegram user',
      error: error.message
    });
  }
};

/**
 * Update Telegram user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateTelegramUser = async (req, res) => {
  try {
    const { telegramId } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updates.telegramId;
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;
    
    const user = await TelegramUser.findOneAndUpdate(
      { telegramId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Telegram user not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: user,
      message: 'Telegram user updated successfully'
    });
  } catch (error) {
    logger.error('Error updating Telegram user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Telegram user',
      error: error.message
    });
  }
};

/**
 * Block/unblock Telegram user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const toggleUserBlock = async (req, res) => {
  try {
    const { telegramId } = req.params;
    const { isBlocked } = req.body;
    
    const user = await TelegramUser.findOneAndUpdate(
      { telegramId },
      { $set: { isBlocked: Boolean(isBlocked) } },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Telegram user not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: user,
      message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`
    });
  } catch (error) {
    logger.error('Error toggling user block:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user block status',
      error: error.message
    });
  }
};

/**
 * Send message to specific user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const sendMessageToUser = async (req, res) => {
  try {
    const { telegramId } = req.params;
    const { message, parseMode = 'Markdown' } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }
    
    const user = await TelegramUser.findByTelegramId(telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Telegram user not found'
      });
    }
    
    if (user.isBlocked) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send message to blocked user'
      });
    }
    
    await telegramBot.sendMessage(telegramId, message, {
      parse_mode: parseMode
    });
    
    res.status(200).json({
      success: true,
      message: 'Message sent successfully'
    });
  } catch (error) {
    logger.error('Error sending message to user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

/**
 * Broadcast message to all active users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const broadcastMessage = async (req, res) => {
  try {
    const { message, parseMode = 'Markdown', targetGroup = 'all' } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }
    
    let filter = { isActive: true, isBlocked: false };
    
    // Apply additional filters based on target group
    if (targetGroup === 'subscribers') {
      filter['preferences.receiveAlerts'] = true;
    } else if (targetGroup === 'linked') {
      filter.userId = { $ne: null };
    }
    
    const users = await TelegramUser.find(filter);
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const user of users) {
      try {
        await telegramBot.sendMessage(user.telegramId, message, {
          parse_mode: parseMode
        });
        successCount++;
      } catch (error) {
        logger.error(`Failed to send broadcast to user ${user.telegramId}:`, error);
        failureCount++;
        
        // Mark user as blocked if bot was blocked
        if (error.response && error.response.body && error.response.body.error_code === 403) {
          user.isBlocked = true;
          await user.save();
        }
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Broadcast completed',
      data: {
        totalUsers: users.length,
        successCount,
        failureCount
      }
    });
  } catch (error) {
    logger.error('Error broadcasting message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to broadcast message',
      error: error.message
    });
  }
};

/**
 * Link Telegram account to web account
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const linkAccount = async (req, res) => {
  try {
    const { telegramId, userId } = req.body;
    
    if (!telegramId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Telegram ID and User ID are required'
      });
    }
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if Telegram user exists
    const telegramUser = await TelegramUser.findByTelegramId(telegramId);
    if (!telegramUser) {
      return res.status(404).json({
        success: false,
        message: 'Telegram user not found'
      });
    }
    
    // Check if already linked to another account
    if (telegramUser.userId && telegramUser.userId.toString() !== userId) {
      return res.status(400).json({
        success: false,
        message: 'Telegram account is already linked to another user'
      });
    }
    
    // Link accounts
    telegramUser.userId = userId;
    await telegramUser.save();
    
    // Send confirmation message to Telegram user
    try {
      await telegramBot.sendMessage(telegramId, 
        `✅ *Account Linked Successfully*\n\n` +
        `Your Telegram account has been linked to: ${user.email}\n\n` +
        `You can now access all premium features and receive personalized alerts.`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Failed to send link confirmation message:', error);
    }
    
    res.status(200).json({
      success: true,
      message: 'Accounts linked successfully',
      data: {
        telegramUser: {
          telegramId: telegramUser.telegramId,
          name: telegramUser.getFullName(),
          userId: telegramUser.userId
        }
      }
    });
  } catch (error) {
    logger.error('Error linking accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to link accounts',
      error: error.message
    });
  }
};

/**
 * Unlink Telegram account from web account
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const unlinkAccount = async (req, res) => {
  try {
    const { telegramId } = req.params;
    
    const telegramUser = await TelegramUser.findByTelegramId(telegramId);
    if (!telegramUser) {
      return res.status(404).json({
        success: false,
        message: 'Telegram user not found'
      });
    }
    
    if (!telegramUser.userId) {
      return res.status(400).json({
        success: false,
        message: 'Telegram account is not linked to any user'
      });
    }
    
    // Unlink account
    telegramUser.userId = null;
    await telegramUser.save();
    
    // Send confirmation message
    try {
      await telegramBot.sendMessage(telegramId, 
        `🔗 *Account Unlinked*\n\n` +
        `Your Telegram account has been unlinked from the web account.\n\n` +
        `You can still receive basic alerts, but premium features are no longer available.`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Failed to send unlink confirmation message:', error);
    }
    
    res.status(200).json({
      success: true,
      message: 'Account unlinked successfully'
    });
  } catch (error) {
    logger.error('Error unlinking account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlink account',
      error: error.message
    });
  }
};

/**
 * Get Telegram bot statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getBotStatistics = async (req, res) => {
  try {
    const stats = await telegramBot.getBotStats();
    
    // Additional statistics
    const totalUsers = await TelegramUser.countDocuments();
    const activeUsers = await TelegramUser.countDocuments({ isActive: true, isBlocked: false });
    const blockedUsers = await TelegramUser.countDocuments({ isBlocked: true });
    const linkedUsers = await TelegramUser.countDocuments({ userId: { $ne: null } });
    
    // Recent activity
    const recentUsers = await TelegramUser.find()
      .sort({ lastInteraction: -1 })
      .limit(10)
      .select('telegramId firstName lastName username lastInteraction messageCount');
    
    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalUsers,
          activeUsers,
          blockedUsers,
          linkedUsers,
          isInitialized: telegramBot.isInitialized
        },
        performance: stats,
        recentActivity: recentUsers
      }
    });
  } catch (error) {
    logger.error('Error getting bot statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bot statistics',
      error: error.message
    });
  }
};

module.exports = {
  initializeBot,
  stopBot,
  getBotStatus,
  getTelegramUsers,
  getTelegramUser,
  updateTelegramUser,
  toggleUserBlock,
  sendMessageToUser,
  broadcastMessage,
  linkAccount,
  unlinkAccount,
  getBotStatistics
};