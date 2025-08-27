const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const logger = require('../../../shared/utils/logger');
const helpers = require('../../../shared/utils/helpers');
const { ValidationMiddleware, AuthMiddleware, RateLimiter } = require('../../../shared/middleware');
const environmentConfig = require('../../../shared/config/environment');
const databaseConfig = require('../../../shared/config/database');

class AuthRoutes {
  constructor() {
    this.setupRoutes();
  }

  setupRoutes() {
    // Apply rate limiting to auth routes
    router.use(RateLimiter.createAuthLimiter());

    // User registration
    router.post('/register',
      ValidationMiddleware.validate('userRegistration'),
      this.register.bind(this)
    );

    // User login
    router.post('/login',
      ValidationMiddleware.validate('userLogin'),
      this.login.bind(this)
    );

    // Refresh token
    router.post('/refresh',
      ValidationMiddleware.validate('refreshToken'),
      this.refreshToken.bind(this)
    );

    // Logout
    router.post('/logout',
      AuthMiddleware.authenticate,
      this.logout.bind(this)
    );

    // Logout from all devices
    router.post('/logout-all',
      AuthMiddleware.authenticate,
      this.logoutAll.bind(this)
    );

    // Get current user profile
    router.get('/me',
      AuthMiddleware.authenticate,
      this.getCurrentUser.bind(this)
    );

    // Update user profile
    router.put('/me',
      AuthMiddleware.authenticate,
      ValidationMiddleware.validate('userProfileUpdate'),
      this.updateProfile.bind(this)
    );

    // Change password
    router.put('/change-password',
      AuthMiddleware.authenticate,
      ValidationMiddleware.validate('changePassword'),
      this.changePassword.bind(this)
    );

    // Request password reset
    router.post('/forgot-password',
      ValidationMiddleware.validate('forgotPassword'),
      this.forgotPassword.bind(this)
    );

    // Reset password
    router.post('/reset-password',
      ValidationMiddleware.validate('resetPassword'),
      this.resetPassword.bind(this)
    );

    // Verify email
    router.post('/verify-email',
      ValidationMiddleware.validate('verifyEmail'),
      this.verifyEmail.bind(this)
    );

    // Resend verification email
    router.post('/resend-verification',
      ValidationMiddleware.validate('resendVerification'),
      this.resendVerification.bind(this)
    );

    // Link Telegram account
    router.post('/link-telegram',
      AuthMiddleware.authenticate,
      ValidationMiddleware.validate('linkTelegram'),
      this.linkTelegram.bind(this)
    );

    // Unlink Telegram account
    router.delete('/unlink-telegram',
      AuthMiddleware.authenticate,
      this.unlinkTelegram.bind(this)
    );

    // Generate API key
    router.post('/api-key',
      AuthMiddleware.authenticate,
      ValidationMiddleware.validate('generateApiKey'),
      this.generateApiKey.bind(this)
    );

    // Revoke API key
    router.delete('/api-key/:keyId',
      AuthMiddleware.authenticate,
      this.revokeApiKey.bind(this)
    );

    // List API keys
    router.get('/api-keys',
      AuthMiddleware.authenticate,
      this.listApiKeys.bind(this)
    );
  }

  // User registration
  async register(req, res) {
    try {
      const { email, password, telegramId, firstName, lastName } = req.body;

      // Check if user already exists
      const existingUser = await this.findUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'User already exists with this email',
          code: 'USER_EXISTS'
        });
      }

      // Check if Telegram ID is already linked
      if (telegramId) {
        const existingTelegramUser = await this.findUserByTelegramId(telegramId);
        if (existingTelegramUser) {
          return res.status(409).json({
            success: false,
            error: 'Telegram account is already linked to another user',
            code: 'TELEGRAM_LINKED'
          });
        }
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
        role: 'user',
        subscriptionPlan: 'free',
        isActive: true,
        isEmailVerified: false,
        emailVerificationToken: helpers.generateRandomString(32),
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
        loginAttempts: 0,
        lockUntil: null,
        refreshTokens: [],
        apiKeys: []
      };

      // Save user to database
      await this.saveUser(user);

      // Generate tokens
      const { accessToken, refreshToken } = this.generateTokens(user);

      // Save refresh token
      await this.saveRefreshToken(user.id, refreshToken);

      // Send verification email (async)
      this.sendVerificationEmail(user).catch(error => {
        logger.logError(error, {
          context: 'send_verification_email',
          userId: user.id,
          email: user.email
        });
      });

      // Log user registration
      logger.logUserAction({
        action: 'user_registered',
        userId: user.id,
        email: user.email,
        telegramId: user.telegramId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(201).json({
        success: true,
        data: {
          user: this.sanitizeUser(user),
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: environmentConfig.get('JWT_ACCESS_EXPIRES_IN')
          }
        },
        message: 'User registered successfully. Please check your email for verification.'
      });
    } catch (error) {
      logger.logError(error, {
        context: 'user_registration',
        email: req.body?.email,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR'
      });
    }
  }

  // User login
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await this.findUserByEmail(email.toLowerCase());
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Check if account is locked
      if (user.lockUntil && user.lockUntil > new Date()) {
        return res.status(423).json({
          success: false,
          error: 'Account is temporarily locked due to too many failed login attempts',
          code: 'ACCOUNT_LOCKED',
          lockUntil: user.lockUntil
        });
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Account is deactivated',
          code: 'ACCOUNT_DEACTIVATED'
        });
      }

      // Verify password
      const isPasswordValid = await helpers.comparePassword(password, user.password);
      if (!isPasswordValid) {
        // Increment login attempts
        await this.incrementLoginAttempts(user.id);
        
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Reset login attempts on successful login
      await this.resetLoginAttempts(user.id);

      // Generate tokens
      const { accessToken, refreshToken } = this.generateTokens(user);

      // Save refresh token
      await this.saveRefreshToken(user.id, refreshToken);

      // Update last login
      await this.updateLastLogin(user.id);

      // Log successful login
      logger.logUserAction({
        action: 'user_login',
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        success: true,
        data: {
          user: this.sanitizeUser(user),
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: environmentConfig.get('JWT_ACCESS_EXPIRES_IN')
          }
        },
        message: 'Login successful'
      });
    } catch (error) {
      logger.logError(error, {
        context: 'user_login',
        email: req.body?.email,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Login failed',
        code: 'LOGIN_ERROR'
      });
    }
  }

  // Refresh token
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      // Verify refresh token
      const decoded = helpers.verifyJWT(refreshToken, environmentConfig.get('JWT_REFRESH_SECRET'));
      if (!decoded) {
        return res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }

      // Find user and validate refresh token
      const user = await this.findUserById(decoded.userId);
      if (!user || !user.refreshTokens.includes(refreshToken)) {
        return res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }

      // Check if user is still active
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Account is deactivated',
          code: 'ACCOUNT_DEACTIVATED'
        });
      }

      // Generate new tokens
      const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(user);

      // Replace old refresh token with new one
      await this.replaceRefreshToken(user.id, refreshToken, newRefreshToken);

      res.json({
        success: true,
        data: {
          tokens: {
            accessToken,
            refreshToken: newRefreshToken,
            expiresIn: environmentConfig.get('JWT_ACCESS_EXPIRES_IN')
          }
        },
        message: 'Token refreshed successfully'
      });
    } catch (error) {
      logger.logError(error, {
        context: 'refresh_token',
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Token refresh failed',
        code: 'REFRESH_ERROR'
      });
    }
  }

  // Logout
  async logout(req, res) {
    try {
      const { refreshToken } = req.body;
      const userId = req.user.id;

      // Remove refresh token
      if (refreshToken) {
        await this.removeRefreshToken(userId, refreshToken);
      }

      // Log logout
      logger.logUserAction({
        action: 'user_logout',
        userId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      logger.logError(error, {
        context: 'user_logout',
        userId: req.user?.id,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Logout failed',
        code: 'LOGOUT_ERROR'
      });
    }
  }

  // Logout from all devices
  async logoutAll(req, res) {
    try {
      const userId = req.user.id;

      // Remove all refresh tokens
      await this.removeAllRefreshTokens(userId);

      // Log logout all
      logger.logUserAction({
        action: 'user_logout_all',
        userId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        success: true,
        message: 'Logged out from all devices successfully'
      });
    } catch (error) {
      logger.logError(error, {
        context: 'user_logout_all',
        userId: req.user?.id,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Logout from all devices failed',
        code: 'LOGOUT_ALL_ERROR'
      });
    }
  }

  // Get current user
  async getCurrentUser(req, res) {
    try {
      const user = await this.findUserById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      res.json({
        success: true,
        data: {
          user: this.sanitizeUser(user)
        }
      });
    } catch (error) {
      logger.logError(error, {
        context: 'get_current_user',
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get user profile',
        code: 'GET_USER_ERROR'
      });
    }
  }

  // Helper methods for database operations
  async findUserByEmail(email) {
    const db = databaseConfig.getDatabase();
    return await db.collection('users').findOne({ email });
  }

  async findUserById(id) {
    const db = databaseConfig.getDatabase();
    return await db.collection('users').findOne({ id });
  }

  async findUserByTelegramId(telegramId) {
    const db = databaseConfig.getDatabase();
    return await db.collection('users').findOne({ telegramId });
  }

  async saveUser(user) {
    const db = databaseConfig.getDatabase();
    return await db.collection('users').insertOne(user);
  }

  async saveRefreshToken(userId, refreshToken) {
    const db = databaseConfig.getDatabase();
    return await db.collection('users').updateOne(
      { id: userId },
      { $push: { refreshTokens: refreshToken } }
    );
  }

  async removeRefreshToken(userId, refreshToken) {
    const db = databaseConfig.getDatabase();
    return await db.collection('users').updateOne(
      { id: userId },
      { $pull: { refreshTokens: refreshToken } }
    );
  }

  async removeAllRefreshTokens(userId) {
    const db = databaseConfig.getDatabase();
    return await db.collection('users').updateOne(
      { id: userId },
      { $set: { refreshTokens: [] } }
    );
  }

  async replaceRefreshToken(userId, oldToken, newToken) {
    const db = databaseConfig.getDatabase();
    await this.removeRefreshToken(userId, oldToken);
    await this.saveRefreshToken(userId, newToken);
  }

  async incrementLoginAttempts(userId) {
    const db = databaseConfig.getDatabase();
    const user = await this.findUserById(userId);
    const attempts = (user.loginAttempts || 0) + 1;
    const maxAttempts = 5;
    const lockDuration = 30 * 60 * 1000; // 30 minutes

    const updateData = {
      loginAttempts: attempts,
      updatedAt: new Date()
    };

    if (attempts >= maxAttempts) {
      updateData.lockUntil = new Date(Date.now() + lockDuration);
    }

    return await db.collection('users').updateOne(
      { id: userId },
      { $set: updateData }
    );
  }

  async resetLoginAttempts(userId) {
    const db = databaseConfig.getDatabase();
    return await db.collection('users').updateOne(
      { id: userId },
      { 
        $unset: { loginAttempts: 1, lockUntil: 1 },
        $set: { updatedAt: new Date() }
      }
    );
  }

  async updateLastLogin(userId) {
    const db = databaseConfig.getDatabase();
    return await db.collection('users').updateOne(
      { id: userId },
      { $set: { lastLoginAt: new Date(), updatedAt: new Date() } }
    );
  }

  // Generate JWT tokens
  generateTokens(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      subscriptionPlan: user.subscriptionPlan,
      telegramId: user.telegramId
    };

    const accessToken = helpers.generateJWT(
      payload,
      environmentConfig.get('JWT_ACCESS_SECRET'),
      environmentConfig.get('JWT_ACCESS_EXPIRES_IN')
    );

    const refreshToken = helpers.generateJWT(
      { userId: user.id },
      environmentConfig.get('JWT_REFRESH_SECRET'),
      environmentConfig.get('JWT_REFRESH_EXPIRES_IN')
    );

    return { accessToken, refreshToken };
  }

  // Sanitize user data for response
  sanitizeUser(user) {
    const sanitized = { ...user };
    delete sanitized.password;
    delete sanitized.refreshTokens;
    delete sanitized.emailVerificationToken;
    delete sanitized.passwordResetToken;
    delete sanitized.passwordResetExpires;
    delete sanitized.loginAttempts;
    delete sanitized.lockUntil;
    return sanitized;
  }

  // Send verification email (placeholder)
  async sendVerificationEmail(user) {
    // This would integrate with email service
    logger.info('Verification email would be sent', {
      userId: user.id,
      email: user.email,
      token: user.emailVerificationToken
    });
  }

  // Additional methods would be implemented here...
  // updateProfile, changePassword, forgotPassword, resetPassword,
  // verifyEmail, resendVerification, linkTelegram, unlinkTelegram,
  // generateApiKey, revokeApiKey, listApiKeys
}

// Create and export router
const authRoutes = new AuthRoutes();
module.exports = router;