const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const logger = require('../../../shared/utils/logger');
const helpers = require('../../../shared/utils/helpers');
const { ValidationMiddleware, AuthMiddleware, RateLimiter } = require('../../../shared/middleware');
const environmentConfig = require('../../../shared/config/environment');
const databaseConfig = require('../../../shared/config/database');

class AdminRoutes {
  constructor() {
    this.setupRoutes();
  }

  setupRoutes() {
    // Apply admin authentication to all routes
    router.use(AuthMiddleware.authenticate);
    router.use(AuthMiddleware.requireAdmin);
    router.use(RateLimiter.createAdminLimiter());

    // User management
    router.get('/users',
      ValidationMiddleware.validate('pagination'),
      this.getUsers.bind(this)
    );

    router.get('/users/:userId',
      ValidationMiddleware.validate('objectId'),
      this.getUser.bind(this)
    );

    router.post('/users',
      ValidationMiddleware.validate('adminUserCreation'),
      this.createUser.bind(this)
    );

    router.put('/users/:userId',
      ValidationMiddleware.validate('adminUserUpdate'),
      this.updateUser.bind(this)
    );

    router.delete('/users/:userId',
      ValidationMiddleware.validate('objectId'),
      this.deleteUser.bind(this)
    );

    router.put('/users/:userId/activate',
      ValidationMiddleware.validate('objectId'),
      this.activateUser.bind(this)
    );

    router.put('/users/:userId/deactivate',
      ValidationMiddleware.validate('objectId'),
      this.deactivateUser.bind(this)
    );

    router.put('/users/:userId/reset-password',
      ValidationMiddleware.validate('adminPasswordReset'),
      this.resetUserPassword.bind(this)
    );

    router.put('/users/:userId/unlock',
      ValidationMiddleware.validate('objectId'),
      this.unlockUser.bind(this)
    );

    // Subscription management
    router.get('/subscriptions',
      ValidationMiddleware.validate('pagination'),
      this.getSubscriptions.bind(this)
    );

    router.put('/subscriptions/:userId/plan',
      ValidationMiddleware.validate('adminSubscriptionUpdate'),
      this.updateUserSubscription.bind(this)
    );

    router.get('/subscriptions/stats',
      this.getSubscriptionStats.bind(this)
    );

    // System monitoring
    router.get('/system/health',
      this.getSystemHealth.bind(this)
    );

    router.get('/system/stats',
      this.getSystemStats.bind(this)
    );

    router.get('/system/logs',
      ValidationMiddleware.validate('logQuery'),
      this.getSystemLogs.bind(this)
    );

    router.get('/system/metrics',
      ValidationMiddleware.validate('metricsQuery'),
      this.getSystemMetrics.bind(this)
    );

    // Alert management
    router.get('/alerts',
      ValidationMiddleware.validate('pagination'),
      this.getAllAlerts.bind(this)
    );

    router.get('/alerts/stats',
      this.getAlertStats.bind(this)
    );

    router.delete('/alerts/:alertId',
      ValidationMiddleware.validate('objectId'),
      this.deleteAlert.bind(this)
    );

    router.put('/alerts/:alertId/disable',
      ValidationMiddleware.validate('objectId'),
      this.disableAlert.bind(this)
    );

    // Configuration management
    router.get('/config',
      this.getSystemConfig.bind(this)
    );

    router.put('/config',
      ValidationMiddleware.validate('systemConfigUpdate'),
      this.updateSystemConfig.bind(this)
    );

    // API key management
    router.get('/api-keys',
      ValidationMiddleware.validate('pagination'),
      this.getAllApiKeys.bind(this)
    );

    router.delete('/api-keys/:keyId',
      ValidationMiddleware.validate('objectId'),
      this.revokeApiKey.bind(this)
    );

    // Audit logs
    router.get('/audit-logs',
      ValidationMiddleware.validate('auditLogQuery'),
      this.getAuditLogs.bind(this)
    );

    // Service management
    router.get('/services/status',
      this.getServicesStatus.bind(this)
    );

    router.post('/services/:serviceName/restart',
      ValidationMiddleware.validate('serviceAction'),
      this.restartService.bind(this)
    );

    // Database management
    router.get('/database/stats',
      this.getDatabaseStats.bind(this)
    );

    router.post('/database/cleanup',
      this.cleanupDatabase.bind(this)
    );

    router.post('/database/backup',
      this.backupDatabase.bind(this)
    );
  }

  // User management methods
  async getUsers(req, res) {
    try {
      const { page = 1, limit = 20, search, role, subscriptionPlan, isActive } = req.query;
      const skip = (page - 1) * limit;

      // Build query
      const query = {};
      if (search) {
        query.$or = [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ];
      }
      if (role) query.role = role;
      if (subscriptionPlan) query.subscriptionPlan = subscriptionPlan;
      if (isActive !== undefined) query.isActive = isActive === 'true';

      const db = databaseConfig.getDatabase();
      const users = await db.collection('users')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('users').countDocuments(query);

      // Sanitize user data
      const sanitizedUsers = users.map(user => this.sanitizeUser(user));

      res.json({
        success: true,
        data: {
          users: sanitizedUsers,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      logger.logError(error, {
        context: 'admin_get_users',
        adminId: req.user.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get users',
        code: 'GET_USERS_ERROR'
      });
    }
  }

  async getUser(req, res) {
    try {
      const { userId } = req.params;

      const db = databaseConfig.getDatabase();
      const user = await db.collection('users').findOne({ id: userId });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Get user's alerts and subscription details
      const alerts = await db.collection('alerts')
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();

      const subscription = await db.collection('subscriptions')
        .findOne({ userId });

      res.json({
        success: true,
        data: {
          user: this.sanitizeUser(user),
          alerts: alerts.length,
          recentAlerts: alerts,
          subscription
        }
      });
    } catch (error) {
      logger.logError(error, {
        context: 'admin_get_user',
        adminId: req.user.id,
        targetUserId: req.params.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get user',
        code: 'GET_USER_ERROR'
      });
    }
  }

  async createUser(req, res) {
    try {
      const { email, password, firstName, lastName, role, subscriptionPlan, telegramId } = req.body;

      // Check if user already exists
      const db = databaseConfig.getDatabase();
      const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'User already exists with this email',
          code: 'USER_EXISTS'
        });
      }

      // Hash password
      const hashedPassword = await helpers.hashPassword(password);

      // Create user
      const user = {
        id: uuidv4(),
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        telegramId: telegramId || null,
        role: role || 'user',
        subscriptionPlan: subscriptionPlan || 'free',
        isActive: true,
        isEmailVerified: true, // Admin created users are pre-verified
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: req.user.id,
        lastLoginAt: null,
        loginAttempts: 0,
        refreshTokens: [],
        apiKeys: []
      };

      await db.collection('users').insertOne(user);

      // Log admin action
      logger.logUserAction({
        action: 'admin_user_created',
        adminId: req.user.id,
        targetUserId: user.id,
        details: {
          email: user.email,
          role: user.role,
          subscriptionPlan: user.subscriptionPlan
        },
        ip: req.ip
      });

      res.status(201).json({
        success: true,
        data: {
          user: this.sanitizeUser(user)
        },
        message: 'User created successfully'
      });
    } catch (error) {
      logger.logError(error, {
        context: 'admin_create_user',
        adminId: req.user.id,
        email: req.body?.email
      });

      res.status(500).json({
        success: false,
        error: 'Failed to create user',
        code: 'CREATE_USER_ERROR'
      });
    }
  }

  async updateUser(req, res) {
    try {
      const { userId } = req.params;
      const updates = req.body;

      // Remove sensitive fields that shouldn't be updated this way
      delete updates.password;
      delete updates.refreshTokens;
      delete updates.apiKeys;
      delete updates.id;
      delete updates.createdAt;

      updates.updatedAt = new Date();
      updates.updatedBy = req.user.id;

      const db = databaseConfig.getDatabase();
      const result = await db.collection('users').updateOne(
        { id: userId },
        { $set: updates }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Get updated user
      const updatedUser = await db.collection('users').findOne({ id: userId });

      // Log admin action
      logger.logUserAction({
        action: 'admin_user_updated',
        adminId: req.user.id,
        targetUserId: userId,
        details: updates,
        ip: req.ip
      });

      res.json({
        success: true,
        data: {
          user: this.sanitizeUser(updatedUser)
        },
        message: 'User updated successfully'
      });
    } catch (error) {
      logger.logError(error, {
        context: 'admin_update_user',
        adminId: req.user.id,
        targetUserId: req.params.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update user',
        code: 'UPDATE_USER_ERROR'
      });
    }
  }

  async deleteUser(req, res) {
    try {
      const { userId } = req.params;

      // Prevent admin from deleting themselves
      if (userId === req.user.id) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete your own account',
          code: 'CANNOT_DELETE_SELF'
        });
      }

      const db = databaseConfig.getDatabase();
      
      // Check if user exists
      const user = await db.collection('users').findOne({ id: userId });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Delete user and related data
      await Promise.all([
        db.collection('users').deleteOne({ id: userId }),
        db.collection('alerts').deleteMany({ userId }),
        db.collection('subscriptions').deleteOne({ userId }),
        db.collection('charts').deleteMany({ userId })
      ]);

      // Log admin action
      logger.logUserAction({
        action: 'admin_user_deleted',
        adminId: req.user.id,
        targetUserId: userId,
        details: {
          email: user.email,
          role: user.role
        },
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      logger.logError(error, {
        context: 'admin_delete_user',
        adminId: req.user.id,
        targetUserId: req.params.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to delete user',
        code: 'DELETE_USER_ERROR'
      });
    }
  }

  // System monitoring methods
  async getSystemHealth(req, res) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {},
        database: {},
        memory: process.memoryUsage(),
        uptime: process.uptime()
      };

      // Check MongoDB
      try {
        await databaseConfig.checkMongoHealth();
        health.database.mongodb = { status: 'healthy', responseTime: 'fast' };
      } catch (error) {
        health.database.mongodb = { status: 'unhealthy', error: error.message };
        health.status = 'degraded';
      }

      // Check Redis
      try {
        await databaseConfig.checkRedisHealth();
        health.database.redis = { status: 'healthy', responseTime: 'fast' };
      } catch (error) {
        health.database.redis = { status: 'unhealthy', error: error.message };
        health.status = 'degraded';
      }

      // Check microservices (placeholder)
      const services = ['subscription-service', 'telegram-service', 'alert-engine'];
      for (const service of services) {
        health.services[service] = { status: 'healthy', responseTime: 'fast' };
      }

      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      logger.logError(error, {
        context: 'admin_system_health',
        adminId: req.user.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get system health',
        code: 'SYSTEM_HEALTH_ERROR'
      });
    }
  }

  async getSystemStats(req, res) {
    try {
      const db = databaseConfig.getDatabase();
      
      const stats = {
        users: {
          total: await db.collection('users').countDocuments(),
          active: await db.collection('users').countDocuments({ isActive: true }),
          verified: await db.collection('users').countDocuments({ isEmailVerified: true }),
          byRole: {
            admin: await db.collection('users').countDocuments({ role: 'admin' }),
            user: await db.collection('users').countDocuments({ role: 'user' })
          },
          bySubscription: {
            free: await db.collection('users').countDocuments({ subscriptionPlan: 'free' }),
            basic: await db.collection('users').countDocuments({ subscriptionPlan: 'basic' }),
            premium: await db.collection('users').countDocuments({ subscriptionPlan: 'premium' })
          }
        },
        alerts: {
          total: await db.collection('alerts').countDocuments(),
          active: await db.collection('alerts').countDocuments({ isActive: true }),
          triggered: await db.collection('alerts').countDocuments({ 
            lastTriggered: { $exists: true }
          })
        },
        charts: {
          total: await db.collection('charts').countDocuments()
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform
        }
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.logError(error, {
        context: 'admin_system_stats',
        adminId: req.user.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get system stats',
        code: 'SYSTEM_STATS_ERROR'
      });
    }
  }

  // Helper methods
  sanitizeUser(user) {
    const sanitized = { ...user };
    delete sanitized.password;
    delete sanitized.refreshTokens;
    delete sanitized.emailVerificationToken;
    delete sanitized.passwordResetToken;
    delete sanitized.passwordResetExpires;
    return sanitized;
  }

  // Additional methods would be implemented here...
  // activateUser, deactivateUser, resetUserPassword, unlockUser,
  // getSubscriptions, updateUserSubscription, getSubscriptionStats,
  // getSystemLogs, getSystemMetrics, getAllAlerts, getAlertStats,
  // deleteAlert, disableAlert, getSystemConfig, updateSystemConfig,
  // getAllApiKeys, revokeApiKey, getAuditLogs, getServicesStatus,
  // restartService, getDatabaseStats, cleanupDatabase, backupDatabase
}

// Create and export router
const adminRoutes = new AdminRoutes();
module.exports = router;