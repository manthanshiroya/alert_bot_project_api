const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const AdminUser = require('../models/AdminUser');
const logger = require('../utils/logger');
const redisClient = require('../config/redis');

// JWT token generation
const generateTokens = (userId, role = 'user') => {
  const accessToken = jwt.sign(
    { userId, role, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  
  const refreshToken = jwt.sign(
    { userId, role, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  
  return { accessToken, refreshToken };
};

// Store refresh token in Redis
const storeRefreshToken = async (userId, refreshToken) => {
  const key = `refresh_token:${userId}`;
  const expiresIn = 7 * 24 * 60 * 60; // 7 days in seconds
  
  try {
    const client = redisClient.getRedisClient();
    await client.setEx(key, expiresIn, refreshToken);
  } catch (error) {
    logger.error('Error storing refresh token in Redis:', error);
    throw new Error('Failed to store refresh token');
  }
};

// Remove refresh token from Redis
const removeRefreshToken = async (userId) => {
  const key = `refresh_token:${userId}`;
  
  try {
    const client = redisClient.getRedisClient();
    await client.del(key);
  } catch (error) {
    logger.error('Error removing refresh token from Redis:', error);
  }
};

// Validate refresh token from Redis
const validateRefreshToken = async (userId, refreshToken) => {
  const key = `refresh_token:${userId}`;
  
  try {
    const client = redisClient.getRedisClient();
    const storedToken = await client.get(key);
    return storedToken === refreshToken;
  } catch (error) {
    logger.error('Error validating refresh token from Redis:', error);
    return false;
  }
};

// Register new user
const register = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { email, password, confirmPassword, telegramUserId, username } = req.body;
    
    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Check if Telegram user ID is already registered
    const existingTelegramUser = await User.findByTelegramUserId(telegramUserId);
    if (existingTelegramUser) {
      return res.status(409).json({
        success: false,
        message: 'This Telegram account is already registered'
      });
    }
    
    // Create new user
    const userData = {
      email,
      password,
      telegram: {
        userId: telegramUserId
      }
    };
    
    if (username) {
      userData.username = username;
    }
    
    const user = new User(userData);
    await user.save();
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);
    
    // Store refresh token
    await storeRefreshToken(user._id, refreshToken);
    
    // Log successful registration
    logger.info(`New user registered: ${email}`, {
      userId: user._id,
      email: user.email,
      telegramUserId: user.telegram.userId
    });
    
    // Return success response
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        telegramUserId: user.telegram.userId,
        subscription: user.subscription,
        role: user.role,
        createdAt: user.createdAt
      }
    });
    
  } catch (error) {
    logger.error('Registration error:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        message: `${field} already exists`
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { email, password } = req.body;
    
    // Find user and include password for comparison
    const user = await User.findByEmail(email).select('+password +security.loginAttempts +security.lockUntil');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed login attempts'
      });
    }
    
    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }
    
    // Compare password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      // Increment login attempts
      await user.incLoginAttempts();
      
      logger.warn(`Failed login attempt for user: ${email}`, {
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Reset login attempts on successful login
    await user.resetLoginAttempts();
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);
    
    // Store refresh token
    await storeRefreshToken(user._id, refreshToken);
    
    // Log successful login
    logger.info(`User logged in: ${email}`, {
      userId: user._id,
      email: user.email,
      ip: req.ip
    });
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        telegramUserId: user.telegram.userId,
        subscription: user.subscription,
        role: user.role,
        lastLogin: user.security.lastLogin
      }
    });
    
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
};

// Admin login
const adminLogin = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find admin user and include password for comparison
    const adminUser = await AdminUser.findByEmail(email).select('+password +security.loginAttempts +security.lockUntil');

    if (!adminUser) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is locked
    if (adminUser.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed login attempts'
      });
    }

    // Check if account is active
    if (adminUser.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Compare password
    const isPasswordValid = await adminUser.comparePassword(password);

    if (!isPasswordValid) {
      // Increment login attempts
      await adminUser.incLoginAttempts();

      logger.warn(`Failed admin login attempt: ${email}`, {
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Reset login attempts on successful login
    await adminUser.resetLoginAttempts();

    // Update last login info
    adminUser.security.lastLoginAt = new Date();
    adminUser.security.lastLoginIP = req.ip;
    await adminUser.save();

    // Generate tokens with admin role
    const { accessToken, refreshToken } = generateTokens(adminUser._id, 'admin');

    // Store refresh token
    await storeRefreshToken(adminUser._id, refreshToken);

    // Log successful login
    logger.info(`Admin logged in: ${email}`, {
      userId: adminUser._id,
      email: adminUser.email,
      ip: req.ip
    });

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      token: accessToken,
      refreshToken,
      user: {
        id: adminUser._id,
        email: adminUser.email,
        username: adminUser.username,
        role: 'admin',
        permissions: adminUser.permissions,
        profile: adminUser.profile,
        lastLogin: adminUser.security.lastLoginAt
      }
    });

  } catch (error) {
    logger.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during admin login'
    });
  }
};

// Logout user
const logout = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Remove refresh token from Redis
    await removeRefreshToken(userId);
    
    logger.info(`User logged out: ${userId}`);
    
    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
    
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during logout'
    });
  }
};

// Refresh JWT token
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token is required'
      });
    }
    
    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }
    
    // Check if token type is refresh
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type'
      });
    }
    
    // Validate refresh token in Redis
    const isValidToken = await validateRefreshToken(decoded.userId, token);
    if (!isValidToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
    
    // Check if user still exists and is active
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }
    
    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);
    
    // Store new refresh token
    await storeRefreshToken(user._id, newRefreshToken);
    
    logger.info(`Token refreshed for user: ${user._id}`);
    
    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      token: accessToken,
      refreshToken: newRefreshToken
    });
    
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during token refresh'
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        telegramUserId: user.telegram.userId,
        subscription: user.subscription,
        profile: user.profile,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
    
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Forgot password
const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { email } = req.body;
    
    const user = await User.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists or not
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    // Save reset token to user
    user.security.passwordResetToken = resetToken;
    user.security.passwordResetExpires = resetTokenExpiry;
    await user.save();
    
    // TODO: Send email with reset link
    // For now, just log the token (remove in production)
    logger.info(`Password reset token for ${email}: ${resetToken}`);
    
    res.status(200).json({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });
    
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { token, password } = req.body;
    
    // Find user with valid reset token
    const user = await User.findOne({
      'security.passwordResetToken': token,
      'security.passwordResetExpires': { $gt: Date.now() }
    }).select('+security.passwordResetToken +security.passwordResetExpires');
    
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }
    
    // Update password
    user.password = password;
    user.security.passwordResetToken = undefined;
    user.security.passwordResetExpires = undefined;
    user.security.loginAttempts = 0;
    user.security.lockUntil = undefined;
    
    await user.save();
    
    // Remove all refresh tokens for this user
    await removeRefreshToken(user._id);
    
    logger.info(`Password reset successful for user: ${user.email}`);
    
    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully'
    });
    
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  register,
  login,
  adminLogin,
  logout,
  refreshToken,
  getProfile,
  forgotPassword,
  resetPassword
};