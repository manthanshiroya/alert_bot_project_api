const express = require('express');
const { AuthMiddleware, ValidationMiddleware, ErrorHandler } = require('../../../shared/middleware');
const { Logger } = require('../../../shared/utils/logger');
const UserController = require('../controllers/UserController');
const router = express.Router();

// Initialize dependencies
const logger = new Logger('user-routes');
const authMiddleware = new AuthMiddleware(logger);
const validationMiddleware = new ValidationMiddleware();
const errorHandler = new ErrorHandler(logger);
const userController = new UserController();

/**
 * @route GET /api/v1/users/profile
 * @desc Get current user profile
 * @access Private
 */
router.get('/profile',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  errorHandler.asyncWrapper(async (req, res) => {
    const user = await userController.getUserProfile(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    logger.info('User profile retrieved', {
      userId: req.user.id
    });
    
    res.json({
      success: true,
      data: user
    });
  })
);

/**
 * @route PUT /api/v1/users/profile
 * @desc Update user profile
 * @access Private
 */
router.put('/profile',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.userProfileUpdate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const user = await userController.updateUserProfile(req.user.id, req.body);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    logger.info('User profile updated', {
      userId: req.user.id,
      updatedFields: Object.keys(req.body)
    });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  })
);

/**
 * @route POST /api/v1/users/change-password
 * @desc Change user password
 * @access Private
 */
router.post('/change-password',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.passwordChange
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    const result = await userController.changePassword(
      req.user.id,
      currentPassword,
      newPassword
    );
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Password changed', {
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  })
);

/**
 * @route POST /api/v1/users/upload-avatar
 * @desc Upload user avatar
 * @access Private
 */
router.post('/upload-avatar',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    files: validationMiddleware.schemas.avatarUpload
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    if (!req.files || !req.files.avatar) {
      return res.status(400).json({
        success: false,
        message: 'No avatar file provided'
      });
    }
    
    const result = await userController.uploadAvatar(req.user.id, req.files.avatar);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Avatar uploaded', {
      userId: req.user.id,
      avatarUrl: result.avatarUrl
    });
    
    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatarUrl: result.avatarUrl
      }
    });
  })
);

/**
 * @route DELETE /api/v1/users/avatar
 * @desc Delete user avatar
 * @access Private
 */
router.delete('/avatar',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  errorHandler.asyncWrapper(async (req, res) => {
    const result = await userController.deleteAvatar(req.user.id);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Avatar not found'
      });
    }
    
    logger.info('Avatar deleted', {
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Avatar deleted successfully'
    });
  })
);

/**
 * @route GET /api/v1/users/preferences
 * @desc Get user preferences
 * @access Private
 */
router.get('/preferences',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  errorHandler.asyncWrapper(async (req, res) => {
    const preferences = await userController.getUserPreferences(req.user.id);
    
    logger.info('User preferences retrieved', {
      userId: req.user.id
    });
    
    res.json({
      success: true,
      data: preferences
    });
  })
);

/**
 * @route PUT /api/v1/users/preferences
 * @desc Update user preferences
 * @access Private
 */
router.put('/preferences',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.userPreferencesUpdate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const preferences = await userController.updateUserPreferences(
      req.user.id,
      req.body
    );
    
    logger.info('User preferences updated', {
      userId: req.user.id,
      updatedFields: Object.keys(req.body)
    });
    
    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: preferences
    });
  })
);

/**
 * @route GET /api/v1/users/activity
 * @desc Get user activity log
 * @access Private
 */
router.get('/activity',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.activityQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      type,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = req.query;
    
    const filters = { userId: req.user.id };
    if (type) filters.type = type;
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: '-createdAt'
    };
    
    const result = await userController.getUserActivity(filters, options);
    
    logger.info('User activity retrieved', {
      userId: req.user.id,
      count: result.docs.length
    });
    
    res.json({
      success: true,
      data: result.docs,
      pagination: {
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        totalDocs: result.totalDocs,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage
      }
    });
  })
);

/**
 * @route GET /api/v1/users/sessions
 * @desc Get active user sessions
 * @access Private
 */
router.get('/sessions',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  errorHandler.asyncWrapper(async (req, res) => {
    const sessions = await userController.getUserSessions(req.user.id);
    
    logger.info('User sessions retrieved', {
      userId: req.user.id,
      sessionCount: sessions.length
    });
    
    res.json({
      success: true,
      data: sessions
    });
  })
);

/**
 * @route DELETE /api/v1/users/sessions/:sessionId
 * @desc Revoke specific session
 * @access Private
 */
router.delete('/sessions/:sessionId',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('sessionId')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const result = await userController.revokeSession(
      req.user.id,
      req.params.sessionId
    );
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    logger.info('Session revoked', {
      userId: req.user.id,
      sessionId: req.params.sessionId
    });
    
    res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  })
);

/**
 * @route DELETE /api/v1/users/sessions
 * @desc Revoke all sessions except current
 * @access Private
 */
router.delete('/sessions',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  errorHandler.asyncWrapper(async (req, res) => {
    const result = await userController.revokeAllSessions(
      req.user.id,
      req.sessionId // Current session to keep
    );
    
    logger.info('All sessions revoked', {
      userId: req.user.id,
      revokedCount: result.revokedCount
    });
    
    res.json({
      success: true,
      message: `${result.revokedCount} sessions revoked successfully`
    });
  })
);

/**
 * @route POST /api/v1/users/2fa/enable
 * @desc Enable two-factor authentication
 * @access Private
 */
router.post('/2fa/enable',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  errorHandler.asyncWrapper(async (req, res) => {
    const result = await userController.enable2FA(req.user.id);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('2FA setup initiated', {
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: '2FA setup initiated',
      data: {
        qrCode: result.qrCode,
        secret: result.secret,
        backupCodes: result.backupCodes
      }
    });
  })
);

/**
 * @route POST /api/v1/users/2fa/verify
 * @desc Verify and complete 2FA setup
 * @access Private
 */
router.post('/2fa/verify',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.twoFactorVerify
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { token } = req.body;
    
    const result = await userController.verify2FA(req.user.id, token);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('2FA enabled', {
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: '2FA enabled successfully'
    });
  })
);

/**
 * @route POST /api/v1/users/2fa/disable
 * @desc Disable two-factor authentication
 * @access Private
 */
router.post('/2fa/disable',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.twoFactorDisable
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { token, password } = req.body;
    
    const result = await userController.disable2FA(req.user.id, token, password);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('2FA disabled', {
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: '2FA disabled successfully'
    });
  })
);

/**
 * @route POST /api/v1/users/2fa/backup-codes
 * @desc Generate new backup codes
 * @access Private
 */
router.post('/2fa/backup-codes',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.backupCodesGenerate
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { password } = req.body;
    
    const result = await userController.generateBackupCodes(req.user.id, password);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Backup codes generated', {
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'New backup codes generated',
      data: {
        backupCodes: result.backupCodes
      }
    });
  })
);

/**
 * @route GET /api/v1/users/export
 * @desc Export user data
 * @access Private
 */
router.get('/export',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.dataExport
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { format = 'json', includeSubscriptions = true } = req.query;
    
    const result = await userController.exportUserData(
      req.user.id,
      format,
      includeSubscriptions === 'true'
    );
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('User data exported', {
      userId: req.user.id,
      format
    });
    
    if (format === 'json') {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="user-data-${req.user.id}.csv"`);
      res.send(result.data);
    }
  })
);

/**
 * @route DELETE /api/v1/users/account
 * @desc Delete user account
 * @access Private
 */
router.delete('/account',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.accountDeletion
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { password, reason } = req.body;
    
    const result = await userController.deleteAccount(
      req.user.id,
      password,
      reason
    );
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Account deletion initiated', {
      userId: req.user.id,
      reason
    });
    
    res.json({
      success: true,
      message: 'Account deletion initiated. You will receive a confirmation email.'
    });
  })
);

/**
 * @route POST /api/v1/users/account/restore
 * @desc Restore deleted account
 * @access Public
 */
router.post('/account/restore',
  validationMiddleware.validate({
    body: validationMiddleware.schemas.accountRestore
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const { email, token } = req.body;
    
    const result = await userController.restoreAccount(email, token);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
    logger.info('Account restored', {
      email,
      userId: result.userId
    });
    
    res.json({
      success: true,
      message: 'Account restored successfully'
    });
  })
);

/**
 * @route GET /api/v1/users/stats
 * @desc Get user statistics
 * @access Private
 */
router.get('/stats',
  authMiddleware.authenticate,
  authMiddleware.requireActiveUser,
  errorHandler.asyncWrapper(async (req, res) => {
    const stats = await userController.getUserStats(req.user.id);
    
    logger.info('User stats retrieved', {
      userId: req.user.id
    });
    
    res.json({
      success: true,
      data: stats
    });
  })
);

module.exports = router;