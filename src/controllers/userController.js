const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const TelegramUser = require('../models/TelegramUser');
const logger = require('../utils/logger');
const redisClient = require('../config/redis');

/**
 * Get user profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId)
      .populate('subscription')
      .select('-password -security.emailVerificationToken -security.passwordResetToken');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get Telegram user info if available
    const telegramUser = await TelegramUser.findOne({ userId: user._id });
    
    res.status(200).json({
      success: true,
      data: {
        user,
        telegramUser: telegramUser ? {
          telegramId: telegramUser.telegramId,
          username: telegramUser.username,
          firstName: telegramUser.firstName,
          lastName: telegramUser.lastName,
          isActive: telegramUser.isActive,
          lastInteraction: telegramUser.lastInteraction
        } : null
      }
    });
    
  } catch (error) {
    logger.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Update user profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const userId = req.user.userId;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updates.password;
    delete updates.email;
    delete updates.telegram;
    delete updates.subscription;
    delete updates.security;
    delete updates.apiKeys;
    delete updates.role;
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;
    
    // Validate profile updates
    const allowedUpdates = {
      username: updates.username,
      'profile.firstName': updates.firstName,
      'profile.lastName': updates.lastName,
      'profile.timezone': updates.timezone,
      'profile.preferences.notifications.email': updates.emailNotifications,
      'profile.preferences.notifications.telegram': updates.telegramNotifications,
      'profile.preferences.alertFormat': updates.alertFormat
    };
    
    // Remove undefined values
    Object.keys(allowedUpdates).forEach(key => {
      if (allowedUpdates[key] === undefined) {
        delete allowedUpdates[key];
      }
    });
    
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    ).select('-password -security.emailVerificationToken -security.passwordResetToken');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    logger.info('User profile updated', {
      userId: user._id,
      email: user.email,
      updatedFields: Object.keys(allowedUpdates)
    });
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user }
    });
    
  } catch (error) {
    logger.error('Error updating user profile:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Change user password
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const userId = req.user.userId;
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match'
      });
    }
    
    // Get user with password
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    // Invalidate all refresh tokens for this user
    try {
      const client = redisClient.getRedisClient();
      await client.del(`refresh_token:${userId}`);
    } catch (redisError) {
      logger.warn('Failed to invalidate refresh tokens:', redisError);
    }
    
    logger.info('User password changed', {
      userId: user._id,
      email: user.email
    });
    
    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    logger.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Delete user account
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { password, confirmDeletion } = req.body;
    
    if (!confirmDeletion || confirmDeletion !== 'DELETE') {
      return res.status(400).json({
        success: false,
        message: 'Account deletion not confirmed. Please type "DELETE" to confirm.'
      });
    }
    
    // Get user with password
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Password is incorrect'
      });
    }
    
    // Soft delete - mark as inactive instead of hard delete
    await User.findByIdAndUpdate(userId, {
      $set: {
        isActive: false,
        'security.deletedAt': new Date(),
        email: `deleted_${Date.now()}_${user.email}` // Prevent email conflicts
      }
    });
    
    // Also deactivate Telegram user
    await TelegramUser.findOneAndUpdate(
      { userId },
      { $set: { isActive: false, isBlocked: true } }
    );
    
    // Invalidate all refresh tokens
    try {
      const client = redisClient.getRedisClient();
      await client.del(`refresh_token:${userId}`);
    } catch (redisError) {
      logger.warn('Failed to invalidate refresh tokens:', redisError);
    }
    
    logger.info('User account deleted', {
      userId: user._id,
      email: user.email
    });
    
    res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });
    
  } catch (error) {
    logger.error('Error deleting account:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get user subscription details
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getSubscription = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId)
      .select('subscription email username')
      .lean();
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Handle case where user has no subscription
    if (!user.subscription || !user.subscription.status || !user.subscription.expiresAt) {
      return res.status(200).json({
        success: true,
        data: {
          subscription: {
            plan: null,
            status: null,
            startDate: null,
            expiresAt: null,
            isActive: false,
            daysRemaining: 0,
            message: 'No subscription active'
          }
        }
      });
    }
    
    // Calculate days remaining
    const now = new Date();
    const expiresAt = new Date(user.subscription.expiresAt);
    const daysRemaining = Math.max(0, Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)));
    
    // Check if subscription is active
    const isActive = user.subscription.status === 'active' && expiresAt > now;
    
    res.status(200).json({
      success: true,
      data: {
        subscription: {
          ...user.subscription,
          isActive,
          daysRemaining,
          expiresAt: user.subscription.expiresAt
        }
      }
    });
    
  } catch (error) {
    logger.error('Error getting subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get user statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getUserStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get user basic info
    const user = await User.findById(userId)
      .select('email username subscription createdAt')
      .lean();
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get Telegram user stats
    const telegramUser = await TelegramUser.findOne({ userId })
      .select('lastInteraction totalMessages totalCommands')
      .lean();
    
    // TODO: Get alert and trade statistics when those models are fully implemented
    // For now, return basic stats
    
    const stats = {
      accountAge: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)),
      subscription: user.subscription,
      telegram: telegramUser ? {
        lastInteraction: telegramUser.lastInteraction,
        totalMessages: telegramUser.totalMessages || 0,
        totalCommands: telegramUser.totalCommands || 0
      } : null,
      alerts: {
        totalReceived: 0, // TODO: Implement when alert system is complete
        totalProcessed: 0
      },
      trades: {
        totalTrades: 0, // TODO: Implement when trade system is complete
        activeTrades: 0
      }
    };
    
    res.status(200).json({
      success: true,
      data: { stats }
    });
    
  } catch (error) {
    logger.error('Error getting user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
  getSubscription,
  getUserStats
};