const { User, Subscription, Plan } = require('../models');
const { Logger } = require('../../../shared/utils/logger');
const { ValidationError, NotFoundError, ConflictError, AuthenticationError } = require('../../../shared/utils/errors');
const { FileUploadService } = require('../../../shared/services/upload');
const { NotificationService } = require('../../../shared/services/notification');
const { CacheService } = require('../../../shared/services/cache');
const { EventEmitter } = require('../../../shared/services/events');
const { TwoFactorAuth } = require('../../../shared/services/auth');
const { DataExporter } = require('../../../shared/utils/export');
const bcrypt = require('bcryptjs');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

class UserController {
  constructor() {
    this.logger = new Logger('user-controller');
    this.fileUploadService = new FileUploadService();
    this.notificationService = new NotificationService();
    this.cacheService = new CacheService();
    this.eventEmitter = new EventEmitter();
    this.twoFactorAuth = new TwoFactorAuth();
    this.dataExporter = new DataExporter();
  }

  /**
   * Get user profile
   */
  async getProfile(req, res) {
    try {
      const { userId } = req.user;

      const user = await User.findById(userId)
        .select('-password -security.passwordResetToken -security.emailVerificationToken')
        .populate('subscription.currentSubscriptionId', 'status billing.cycle billing.amount dates')
        .populate('subscription.currentPlanId', 'name slug type category features limits');

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Add computed fields
      const userProfile = user.toObject();
      userProfile.fullName = user.fullName;
      userProfile.isActive = user.isActive;
      userProfile.isVerified = user.isVerified;
      userProfile.isLocked = user.isLocked;
      userProfile.hasActiveSubscription = user.hasActiveSubscription;

      this.logger.info('User profile retrieved', {
        userId,
        email: user.email
      });

      res.json({
        success: true,
        data: userProfile
      });
    } catch (error) {
      this.logger.error('Error retrieving user profile', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req, res) {
    try {
      const { userId } = req.user;
      const updates = req.body;

      // Define allowed update fields
      const allowedUpdates = [
        'profile.firstName', 'profile.lastName', 'profile.displayName',
        'profile.bio', 'profile.timezone', 'profile.language',
        'contact.phone', 'contact.address',
        'preferences.notifications', 'preferences.privacy', 'preferences.ui'
      ];

      // Validate updates
      const updateKeys = Object.keys(updates);
      const isValidUpdate = updateKeys.every(key => 
        allowedUpdates.some(allowed => key.startsWith(allowed.split('.')[0]))
      );

      if (!isValidUpdate) {
        throw new ValidationError('Invalid update fields');
      }

      // Check for email/username conflicts if being updated
      if (updates.email) {
        const existingUser = await User.findOne({ 
          email: updates.email, 
          _id: { $ne: userId } 
        });
        if (existingUser) {
          throw new ConflictError('Email already in use');
        }
      }

      if (updates.username) {
        const existingUser = await User.findOne({ 
          username: updates.username, 
          _id: { $ne: userId } 
        });
        if (existingUser) {
          throw new ConflictError('Username already in use');
        }
      }

      // Apply updates
      const user = await User.findById(userId);
      Object.keys(updates).forEach(key => {
        if (key.includes('.')) {
          const [parent, child] = key.split('.');
          if (!user[parent]) user[parent] = {};
          user[parent][child] = updates[key];
        } else {
          user[key] = updates[key];
        }
      });

      user.updatedAt = new Date();
      await user.save();

      // Clear user cache
      await this.cacheService.delete(`user:${userId}`);

      // Emit event
      this.eventEmitter.emit('user.profile.updated', {
        user,
        updates,
        updatedBy: userId
      });

      this.logger.info('User profile updated', {
        userId,
        updates: updateKeys
      });

      res.json({
        success: true,
        data: user,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      this.logger.error('Error updating user profile', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Change password
   */
  async changePassword(req, res) {
    try {
      const { userId } = req.user;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        throw new ValidationError('Current password and new password are required');
      }

      if (newPassword.length < 8) {
        throw new ValidationError('New password must be at least 8 characters long');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        throw new AuthenticationError('Current password is incorrect');
      }

      // Check if new password is different
      const isSamePassword = await user.comparePassword(newPassword);
      if (isSamePassword) {
        throw new ValidationError('New password must be different from current password');
      }

      // Update password
      user.password = newPassword; // Will be hashed by pre-save middleware
      user.security.passwordChangedAt = new Date();
      user.security.passwordResetToken = null;
      user.security.passwordResetExpires = null;
      await user.save();

      // Revoke all sessions except current
      await this._revokeAllSessions(userId, req.sessionId);

      // Emit event
      this.eventEmitter.emit('user.password.changed', {
        user,
        changedAt: new Date()
      });

      // Send notification
      await this.notificationService.sendPasswordChanged({
        userId,
        email: user.email,
        timestamp: new Date()
      });

      this.logger.info('Password changed', {
        userId,
        email: user.email
      });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      this.logger.error('Error changing password', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Upload avatar
   */
  async uploadAvatar(req, res) {
    try {
      const { userId } = req.user;
      const file = req.file;

      if (!file) {
        throw new ValidationError('No file uploaded');
      }

      // Validate file type and size
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        throw new ValidationError('Invalid file type. Only JPEG, PNG, and WebP are allowed');
      }

      if (file.size > 5 * 1024 * 1024) { // 5MB
        throw new ValidationError('File size too large. Maximum 5MB allowed');
      }

      // Upload file
      const uploadResult = await this.fileUploadService.uploadAvatar({
        file,
        userId,
        folder: 'avatars'
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload avatar');
      }

      // Update user profile
      const user = await User.findById(userId);
      const oldAvatarUrl = user.profile.avatar;
      
      user.profile.avatar = uploadResult.url;
      user.updatedAt = new Date();
      await user.save();

      // Delete old avatar if exists
      if (oldAvatarUrl) {
        await this.fileUploadService.deleteFile(oldAvatarUrl);
      }

      // Clear cache
      await this.cacheService.delete(`user:${userId}`);

      this.logger.info('Avatar uploaded', {
        userId,
        url: uploadResult.url,
        size: file.size
      });

      res.json({
        success: true,
        data: {
          avatar: uploadResult.url,
          thumbnails: uploadResult.thumbnails
        },
        message: 'Avatar uploaded successfully'
      });
    } catch (error) {
      this.logger.error('Error uploading avatar', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Delete avatar
   */
  async deleteAvatar(req, res) {
    try {
      const { userId } = req.user;

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const avatarUrl = user.profile.avatar;
      if (!avatarUrl) {
        throw new ValidationError('No avatar to delete');
      }

      // Delete file
      await this.fileUploadService.deleteFile(avatarUrl);

      // Update user profile
      user.profile.avatar = null;
      user.updatedAt = new Date();
      await user.save();

      // Clear cache
      await this.cacheService.delete(`user:${userId}`);

      this.logger.info('Avatar deleted', {
        userId,
        deletedUrl: avatarUrl
      });

      res.json({
        success: true,
        message: 'Avatar deleted successfully'
      });
    } catch (error) {
      this.logger.error('Error deleting avatar', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Get user preferences
   */
  async getPreferences(req, res) {
    try {
      const { userId } = req.user;

      const user = await User.findById(userId).select('preferences');
      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.json({
        success: true,
        data: user.preferences
      });
    } catch (error) {
      this.logger.error('Error retrieving preferences', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(req, res) {
    try {
      const { userId } = req.user;
      const preferences = req.body;

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Merge preferences
      user.preferences = {
        ...user.preferences,
        ...preferences
      };
      user.updatedAt = new Date();
      await user.save();

      // Clear cache
      await this.cacheService.delete(`user:${userId}`);

      this.logger.info('User preferences updated', {
        userId,
        updates: Object.keys(preferences)
      });

      res.json({
        success: true,
        data: user.preferences,
        message: 'Preferences updated successfully'
      });
    } catch (error) {
      this.logger.error('Error updating preferences', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Get activity logs
   */
  async getActivityLogs(req, res) {
    try {
      const { userId } = req.user;
      const { page = 1, limit = 20, type, startDate, endDate } = req.query;

      // This would typically query an ActivityLog collection
      // For now, we'll return user's login history and basic activities
      const user = await User.findById(userId).select('activity');
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Simulate activity logs
      const activities = this._generateActivityLogs(user, {
        type,
        startDate,
        endDate,
        page: parseInt(page),
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        data: activities.docs,
        pagination: {
          page: activities.page,
          pages: activities.totalPages,
          total: activities.totalDocs,
          limit: activities.limit
        }
      });
    } catch (error) {
      this.logger.error('Error retrieving activity logs', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Get user sessions
   */
  async getSessions(req, res) {
    try {
      const { userId } = req.user;

      const user = await User.findById(userId).select('activity.sessions');
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Filter active sessions
      const activeSessions = user.activity.sessions.filter(session => 
        session.isActive && moment(session.expiresAt).isAfter(moment())
      );

      // Add current session indicator
      const sessions = activeSessions.map(session => ({
        ...session.toObject(),
        isCurrent: session.sessionId === req.sessionId
      }));

      res.json({
        success: true,
        data: sessions
      });
    } catch (error) {
      this.logger.error('Error retrieving sessions', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Revoke specific session
   */
  async revokeSession(req, res) {
    try {
      const { sessionId } = req.params;
      const { userId } = req.user;

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Find and revoke session
      const session = user.activity.sessions.id(sessionId);
      if (!session) {
        throw new NotFoundError('Session not found');
      }

      session.isActive = false;
      session.revokedAt = new Date();
      await user.save();

      this.logger.info('Session revoked', {
        userId,
        sessionId,
        revokedBy: userId
      });

      res.json({
        success: true,
        message: 'Session revoked successfully'
      });
    } catch (error) {
      this.logger.error('Error revoking session', { error: error.message, sessionId: req.params.sessionId });
      throw error;
    }
  }

  /**
   * Revoke all sessions except current
   */
  async revokeAllSessions(req, res) {
    try {
      const { userId } = req.user;
      const currentSessionId = req.sessionId;

      await this._revokeAllSessions(userId, currentSessionId);

      this.logger.info('All sessions revoked', {
        userId,
        exceptSession: currentSessionId
      });

      res.json({
        success: true,
        message: 'All other sessions revoked successfully'
      });
    } catch (error) {
      this.logger.error('Error revoking all sessions', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Enable two-factor authentication
   */
  async enableTwoFactor(req, res) {
    try {
      const { userId } = req.user;

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (user.security.twoFactorEnabled) {
        throw new ConflictError('Two-factor authentication is already enabled');
      }

      // Generate secret and QR code
      const twoFactorData = await this.twoFactorAuth.generateSecret({
        userId,
        email: user.email,
        name: user.profile.displayName || user.username
      });

      // Store secret temporarily (not enabled until verified)
      user.security.twoFactorSecret = twoFactorData.secret;
      await user.save();

      this.logger.info('Two-factor setup initiated', {
        userId,
        email: user.email
      });

      res.json({
        success: true,
        data: {
          secret: twoFactorData.secret,
          qrCode: twoFactorData.qrCode,
          backupCodes: twoFactorData.backupCodes
        },
        message: 'Two-factor authentication setup initiated. Please verify with your authenticator app.'
      });
    } catch (error) {
      this.logger.error('Error enabling two-factor auth', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Verify and complete two-factor setup
   */
  async verifyTwoFactor(req, res) {
    try {
      const { userId } = req.user;
      const { token } = req.body;

      if (!token) {
        throw new ValidationError('Verification token is required');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (!user.security.twoFactorSecret) {
        throw new ValidationError('Two-factor setup not initiated');
      }

      // Verify token
      const isValid = await this.twoFactorAuth.verifyToken({
        secret: user.security.twoFactorSecret,
        token
      });

      if (!isValid) {
        throw new AuthenticationError('Invalid verification token');
      }

      // Enable two-factor authentication
      user.security.twoFactorEnabled = true;
      user.security.twoFactorEnabledAt = new Date();
      await user.save();

      // Generate backup codes
      const backupCodes = await this.twoFactorAuth.generateBackupCodes(userId);

      this.logger.info('Two-factor authentication enabled', {
        userId,
        email: user.email
      });

      res.json({
        success: true,
        data: {
          backupCodes
        },
        message: 'Two-factor authentication enabled successfully'
      });
    } catch (error) {
      this.logger.error('Error verifying two-factor auth', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Disable two-factor authentication
   */
  async disableTwoFactor(req, res) {
    try {
      const { userId } = req.user;
      const { password, token } = req.body;

      if (!password) {
        throw new ValidationError('Password is required to disable two-factor authentication');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (!user.security.twoFactorEnabled) {
        throw new ValidationError('Two-factor authentication is not enabled');
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid password');
      }

      // Verify 2FA token if provided
      if (token) {
        const isTokenValid = await this.twoFactorAuth.verifyToken({
          secret: user.security.twoFactorSecret,
          token
        });
        if (!isTokenValid) {
          throw new AuthenticationError('Invalid two-factor token');
        }
      }

      // Disable two-factor authentication
      user.security.twoFactorEnabled = false;
      user.security.twoFactorSecret = null;
      user.security.twoFactorEnabledAt = null;
      await user.save();

      this.logger.info('Two-factor authentication disabled', {
        userId,
        email: user.email
      });

      res.json({
        success: true,
        message: 'Two-factor authentication disabled successfully'
      });
    } catch (error) {
      this.logger.error('Error disabling two-factor auth', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Generate new backup codes
   */
  async generateBackupCodes(req, res) {
    try {
      const { userId } = req.user;
      const { password } = req.body;

      if (!password) {
        throw new ValidationError('Password is required');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (!user.security.twoFactorEnabled) {
        throw new ValidationError('Two-factor authentication is not enabled');
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid password');
      }

      // Generate new backup codes
      const backupCodes = await this.twoFactorAuth.generateBackupCodes(userId);

      this.logger.info('New backup codes generated', {
        userId,
        email: user.email
      });

      res.json({
        success: true,
        data: {
          backupCodes
        },
        message: 'New backup codes generated successfully'
      });
    } catch (error) {
      this.logger.error('Error generating backup codes', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Export user data
   */
  async exportData(req, res) {
    try {
      const { userId } = req.user;
      const { format = 'json' } = req.query;

      const user = await User.findById(userId)
        .select('-password -security.twoFactorSecret')
        .populate('subscription.currentSubscriptionId')
        .populate('subscription.currentPlanId');

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Get user's subscriptions
      const subscriptions = await Subscription.find({ userId })
        .populate('planId', 'name slug type category');

      // Prepare export data
      const exportData = {
        user: user.toObject(),
        subscriptions: subscriptions.map(sub => sub.toObject()),
        exportedAt: new Date().toISOString(),
        exportFormat: format
      };

      // Generate export file
      const exportResult = await this.dataExporter.exportUserData({
        data: exportData,
        format,
        userId
      });

      this.logger.info('User data exported', {
        userId,
        format,
        size: exportResult.size
      });

      if (format === 'json') {
        res.json({
          success: true,
          data: exportData
        });
      } else {
        res.setHeader('Content-Type', exportResult.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="user-data-${userId}.${format}"`);
        res.send(exportResult.buffer);
      }
    } catch (error) {
      this.logger.error('Error exporting user data', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Request account deletion
   */
  async requestDeletion(req, res) {
    try {
      const { userId } = req.user;
      const { password, reason } = req.body;

      if (!password) {
        throw new ValidationError('Password is required to delete account');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid password');
      }

      // Check for active subscriptions
      const activeSubscription = await Subscription.findOne({
        userId,
        status: { $in: ['active', 'trialing'] }
      });

      if (activeSubscription) {
        throw new ConflictError('Cannot delete account with active subscription. Please cancel your subscription first.');
      }

      // Mark account for deletion (soft delete)
      user.status = 'pending_deletion';
      user.deletion = {
        requestedAt: new Date(),
        reason: reason || 'user_requested',
        scheduledFor: moment().add(30, 'days').toDate() // 30-day grace period
      };
      await user.save();

      // Emit event
      this.eventEmitter.emit('user.deletion.requested', {
        user,
        reason,
        scheduledFor: user.deletion.scheduledFor
      });

      // Send confirmation email
      await this.notificationService.sendAccountDeletionRequested({
        userId,
        email: user.email,
        scheduledFor: user.deletion.scheduledFor
      });

      this.logger.info('Account deletion requested', {
        userId,
        email: user.email,
        reason,
        scheduledFor: user.deletion.scheduledFor
      });

      res.json({
        success: true,
        data: {
          scheduledFor: user.deletion.scheduledFor,
          gracePeriodDays: 30
        },
        message: 'Account deletion requested. You have 30 days to cancel this request.'
      });
    } catch (error) {
      this.logger.error('Error requesting account deletion', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Cancel account deletion
   */
  async cancelDeletion(req, res) {
    try {
      const { userId } = req.user;

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (user.status !== 'pending_deletion') {
        throw new ValidationError('No pending deletion request found');
      }

      // Cancel deletion
      user.status = 'active';
      user.deletion = null;
      await user.save();

      this.logger.info('Account deletion canceled', {
        userId,
        email: user.email
      });

      res.json({
        success: true,
        message: 'Account deletion request canceled successfully'
      });
    } catch (error) {
      this.logger.error('Error canceling account deletion', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getStats(req, res) {
    try {
      const { userId } = req.user;

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Get subscription history
      const subscriptions = await Subscription.find({ userId });
      
      // Calculate statistics
      const stats = {
        account: {
          createdAt: user.createdAt,
          lastLoginAt: user.activity.lastLoginAt,
          loginCount: user.activity.loginCount,
          daysSinceJoined: moment().diff(moment(user.createdAt), 'days')
        },
        subscriptions: {
          total: subscriptions.length,
          active: subscriptions.filter(sub => sub.status === 'active').length,
          canceled: subscriptions.filter(sub => sub.status === 'canceled').length,
          totalSpent: subscriptions.reduce((sum, sub) => sum + (sub.billing.amount || 0), 0)
        },
        usage: {
          currentPeriod: user.subscription.currentSubscriptionId ? 
            (await Subscription.findById(user.subscription.currentSubscriptionId))?.usage.currentPeriod : null
        },
        security: {
          twoFactorEnabled: user.security.twoFactorEnabled,
          lastPasswordChange: user.security.passwordChangedAt,
          activeSessions: user.activity.sessions.filter(s => s.isActive).length
        }
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.logger.error('Error retrieving user stats', { error: error.message, userId: req.user?.userId });
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  async _revokeAllSessions(userId, exceptSessionId) {
    const user = await User.findById(userId);
    if (!user) return;

    user.activity.sessions.forEach(session => {
      if (session.sessionId !== exceptSessionId && session.isActive) {
        session.isActive = false;
        session.revokedAt = new Date();
      }
    });

    await user.save();
  }

  _generateActivityLogs(user, options) {
    // This would typically query an ActivityLog collection
    // For now, generate sample activity data
    const activities = [
      {
        id: uuidv4(),
        type: 'login',
        description: 'User logged in',
        timestamp: user.activity.lastLoginAt,
        ip: user.activity.lastLoginIP,
        userAgent: 'Sample User Agent'
      },
      {
        id: uuidv4(),
        type: 'profile_update',
        description: 'Profile updated',
        timestamp: user.updatedAt,
        ip: user.activity.lastLoginIP
      }
    ];

    // Apply filters
    let filteredActivities = activities;
    if (options.type) {
      filteredActivities = activities.filter(activity => activity.type === options.type);
    }

    if (options.startDate) {
      filteredActivities = filteredActivities.filter(activity => 
        moment(activity.timestamp).isAfter(moment(options.startDate))
      );
    }

    if (options.endDate) {
      filteredActivities = filteredActivities.filter(activity => 
        moment(activity.timestamp).isBefore(moment(options.endDate))
      );
    }

    // Paginate
    const startIndex = (options.page - 1) * options.limit;
    const endIndex = startIndex + options.limit;
    const paginatedActivities = filteredActivities.slice(startIndex, endIndex);

    return {
      docs: paginatedActivities,
      totalDocs: filteredActivities.length,
      page: options.page,
      totalPages: Math.ceil(filteredActivities.length / options.limit),
      limit: options.limit
    };
  }
}

module.exports = UserController;