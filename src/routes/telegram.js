const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegramController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');

/**
 * @swagger
 * components:
 *   schemas:
 *     TelegramUser:
 *       type: object
 *       properties:
 *         telegramId:
 *           type: string
 *           description: Telegram user ID
 *         username:
 *           type: string
 *           description: Telegram username
 *         firstName:
 *           type: string
 *           description: First name
 *         lastName:
 *           type: string
 *           description: Last name
 *         languageCode:
 *           type: string
 *           description: User's language code
 *         userId:
 *           type: string
 *           description: Linked web account user ID
 *         isActive:
 *           type: boolean
 *           description: Whether user is active
 *         isBlocked:
 *           type: boolean
 *           description: Whether user is blocked
 *         preferences:
 *           type: object
 *           properties:
 *             receiveAlerts:
 *               type: boolean
 *             receiveTradeUpdates:
 *               type: boolean
 *             receivePnLUpdates:
 *               type: boolean
 *             alertFormat:
 *               type: string
 *               enum: [simple, detailed, custom]
 *             timezone:
 *               type: string
 *         stats:
 *           type: object
 *           properties:
 *             alertsReceived:
 *               type: number
 *             tradesExecuted:
 *               type: number
 *             totalPnL:
 *               type: number
 *             joinedAt:
 *               type: string
 *               format: date-time
 *         lastInteraction:
 *           type: string
 *           format: date-time
 *         messageCount:
 *           type: number
 *       example:
 *         telegramId: "123456789"
 *         username: "trader123"
 *         firstName: "John"
 *         lastName: "Doe"
 *         languageCode: "en"
 *         userId: "60f7b3b3b3b3b3b3b3b3b3b3"
 *         isActive: true
 *         isBlocked: false
 *         preferences:
 *           receiveAlerts: true
 *           receiveTradeUpdates: true
 *           receivePnLUpdates: true
 *           alertFormat: "detailed"
 *           timezone: "UTC"
 *         stats:
 *           alertsReceived: 150
 *           tradesExecuted: 45
 *           totalPnL: 1250.50
 *           joinedAt: "2024-01-15T10:30:00Z"
 *         lastInteraction: "2024-01-20T14:25:00Z"
 *         messageCount: 89
 * 
 *     BotStats:
       type: object
       properties:
         totalUsers:
           type: number
           description: Total number of Telegram users
         activeUsers:
           type: number
           description: Number of active users
         blockedUsers:
           type: number
           description: Number of blocked users
         linkedUsers:
           type: number
           description: Number of users linked to web accounts
         messagesSent:
           type: number
           description: Total messages sent by bot
         messagesReceived:
           type: number
           description: Total messages received by bot
         uptime:
           type: string
           description: Bot uptime
         status:
           type: string
           enum: [running, stopped, error]
           description: Bot status
         lastActivity:
           type: string
           format: date-time
           description: Last bot activity
       example:
         totalUsers: 1250
         activeUsers: 980
         blockedUsers: 15
         linkedUsers: 800
         messagesSent: 15000
         messagesReceived: 4500
         uptime: "5 days, 12 hours"
         status: "running"
         lastActivity: "2024-01-20T14:25:00Z"
 * 
 *     SendMessageRequest:
 *       type: object
 *       required:
 *         - message
 *       properties:
 *         message:
 *           type: string
 *           description: Message content to send
 *         parseMode:
 *           type: string
 *           enum: [Markdown, HTML]
 *           default: Markdown
 *           description: Message parsing mode
 *       example:
 *         message: "🚀 *Important Update*\n\nNew features are now available!"
 *         parseMode: "Markdown"
 * 
 *     BroadcastRequest:
 *       type: object
 *       required:
 *         - message
 *       properties:
 *         message:
 *           type: string
 *           description: Message content to broadcast
 *         parseMode:
 *           type: string
 *           enum: [Markdown, HTML]
 *           default: Markdown
 *         targetGroup:
 *           type: string
 *           enum: [all, subscribers, linked]
 *           default: all
 *           description: Target user group for broadcast
 *       example:
 *         message: "📊 System maintenance scheduled for tonight at 2 AM UTC"
 *         parseMode: "Markdown"
 *         targetGroup: "subscribers"
 * 
 *     LinkAccountRequest:
 *       type: object
 *       required:
 *         - telegramId
 *         - userId
 *       properties:
 *         telegramId:
 *           type: string
 *           description: Telegram user ID
 *         userId:
 *           type: string
 *           description: Web account user ID
 *       example:
 *         telegramId: "123456789"
 *         userId: "60f7b3b3b3b3b3b3b3b3b3b3"
 */

/**
 * @swagger
 * /api/telegram/bot/initialize:
 *   post:
 *     summary: Initialize Telegram bot
 *     description: Initialize and start the Telegram bot service
 *     tags: [Telegram Bot Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bot initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Telegram bot initialized successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     botInfo:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: number
 *                         username:
 *                           type: string
 *                         first_name:
 *                           type: string
 *       400:
 *         description: Bot already running or initialization failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized access
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to initialize bot
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/bot/initialize', 
  authenticateToken, 
  requireAdmin, 
  telegramController.initializeBot
);

/**
 * @swagger
 * /api/telegram/bot/stop:
 *   post:
 *     summary: Stop Telegram bot
 *     description: Stop the Telegram bot service and cease polling
 *     tags: [Telegram Bot Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bot stopped successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Telegram bot stopped successfully
 *       400:
 *         description: Bot not running or stop failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized access
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to stop bot
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/bot/stop', 
  authenticateToken, 
  requireAdmin, 
  telegramController.stopBot
);

/**
 * @swagger
 * /api/telegram/bot/status:
 *   get:
 *     summary: Get bot status
 *     description: Get current status and statistics of the Telegram bot
 *     tags: [Telegram Bot Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bot status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     isInitialized:
 *                       type: boolean
 *                     stats:
 *                       $ref: '#/components/schemas/BotStats'
 *             example:
 *               success: true
 *               data:
 *                 isInitialized: true
 *                 stats:
 *                   totalUsers: 1250
 *                   activeUsers: 980
 *                   totalAlerts: 15000
 *                   totalTrades: 4500
 *                   totalPnL: 125000.75
 */
/**
 * @swagger
 * /api/admin/telegram/bot/status:
 *   get:
 *     summary: Get Telegram bot status
 *     description: Retrieve current status and information about the Telegram bot
 *     tags: [Telegram Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bot status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [running, stopped, error]
 *                       example: running
 *                     botInfo:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: number
 *                         username:
 *                           type: string
 *                         first_name:
 *                           type: string
 *                     uptime:
 *                       type: string
 *                       example: "2 days, 5 hours"
 *                     lastActivity:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/bot/status', 
  authenticateToken, 
  requireAdmin, 
  telegramController.getBotStatus
);

/**
 * @swagger
 * /api/admin/telegram/users:
 *   get:
 *     summary: Get Telegram users
 *     description: Retrieve a paginated list of Telegram users with optional filtering
 *     tags: [Telegram Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of users per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, active, blocked, inactive]
 *           default: all
 *         description: Filter users by status
 *     responses:
 *       200:
 *         description: Telegram users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/TelegramUser'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/users', 
  authenticateToken, 
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['all', 'active', 'blocked', 'inactive'])
  ],
  handleValidationErrors,
  telegramController.getTelegramUsers
);

/**
 * @swagger
 * /api/admin/telegram/users/{telegramId}:
 *   get:
 *     summary: Get specific Telegram user
 *     description: Retrieve detailed information about a specific Telegram user
 *     tags: [Telegram Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: telegramId
 *         required: true
 *         schema:
 *           type: string
 *         description: Telegram user ID
 *     responses:
 *       200:
 *         description: Telegram user retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/TelegramUser'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Telegram user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/users/:telegramId', 
  authenticateToken, 
  requireAdmin,
  [
    param('telegramId').notEmpty().withMessage('Telegram ID is required')
  ],
  handleValidationErrors,
  telegramController.getTelegramUser
);

/**
 * @swagger
 * /api/admin/telegram/users/{telegramId}:
 *   put:
 *     summary: Update Telegram user
 *     description: Update Telegram user preferences and settings
 *     tags: [Telegram Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: telegramId
 *         required: true
 *         schema:
 *           type: string
 *         description: Telegram user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *               isBlocked:
 *                 type: boolean
 *               preferences:
 *                 type: object
 *                 properties:
 *                   receiveAlerts:
 *                     type: boolean
 *                   receiveTradeUpdates:
 *                     type: boolean
 *                   receivePnLUpdates:
 *                     type: boolean
 *                   alertFormat:
 *                     type: string
 *                     enum: [simple, detailed, custom]
 *                   timezone:
 *                     type: string
 *             example:
 *               isActive: true
 *               preferences:
 *                 receiveAlerts: true
 *                 alertFormat: "detailed"
 *                 timezone: "America/New_York"
 *     responses:
 *       200:
 *         description: Telegram user updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Telegram user updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/TelegramUser'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Telegram user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put('/users/:telegramId', 
  authenticateToken, 
  requireAdmin,
  [
    param('telegramId').notEmpty().withMessage('Telegram ID is required'),
    body('isActive').optional().isBoolean(),
    body('isBlocked').optional().isBoolean(),
    body('preferences.receiveAlerts').optional().isBoolean(),
    body('preferences.receiveTradeUpdates').optional().isBoolean(),
    body('preferences.receivePnLUpdates').optional().isBoolean(),
    body('preferences.alertFormat').optional().isIn(['simple', 'detailed', 'custom']),
    body('preferences.timezone').optional().isString()
  ],
  handleValidationErrors,
  telegramController.updateTelegramUser
);

/**
 * @swagger
 * /api/admin/telegram/users/{telegramId}/block:
 *   post:
 *     summary: Block/unblock Telegram user
 *     description: Block or unblock a Telegram user from receiving messages
 *     tags: [Telegram Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: telegramId
 *         required: true
 *         schema:
 *           type: string
 *         description: Telegram user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isBlocked
 *             properties:
 *               isBlocked:
 *                 type: boolean
 *                 description: Whether to block the user
 *             example:
 *               isBlocked: true
 *     responses:
 *       200:
 *         description: User block status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User block status updated successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Telegram user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/users/:telegramId/block', 
  authenticateToken, 
  requireAdmin,
  [
    param('telegramId').notEmpty().withMessage('Telegram ID is required'),
    body('isBlocked').isBoolean().withMessage('isBlocked must be a boolean')
  ],
  handleValidationErrors,
  telegramController.toggleUserBlock
);

/**
 * @swagger
 * /api/admin/telegram/users/{telegramId}/message:
 *   post:
 *     summary: Send message to user
 *     description: Send a direct message to a specific Telegram user
 *     tags: [Telegram Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: telegramId
 *         required: true
 *         schema:
 *           type: string
 *         description: Telegram user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendMessageRequest'
 *     responses:
 *       200:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Message sent successfully
 *       400:
 *         description: Invalid request or user is blocked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Telegram user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/users/:telegramId/message', 
  authenticateToken, 
  requireAdmin,
  [
    param('telegramId').notEmpty().withMessage('Telegram ID is required'),
    body('message').notEmpty().withMessage('Message content is required'),
    body('parseMode').optional().isIn(['Markdown', 'HTML'])
  ],
  handleValidationErrors,
  telegramController.sendMessageToUser
);

/**
 * @swagger
 * /api/admin/telegram/broadcast:
 *   post:
 *     summary: Broadcast message
 *     description: Send a message to multiple users based on target group
 *     tags: [Telegram Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BroadcastRequest'
 *     responses:
 *       200:
 *         description: Broadcast completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Broadcast completed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalUsers:
 *                       type: number
 *                       example: 1000
 *                     successCount:
 *                       type: number
 *                       example: 985
 *                     failureCount:
 *                       type: number
 *                       example: 15
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/broadcast', 
  authenticateToken, 
  requireAdmin,
  [
    body('message').notEmpty().withMessage('Message content is required'),
    body('parseMode').optional().isIn(['Markdown', 'HTML']),
    body('targetGroup').optional().isIn(['all', 'subscribers', 'linked'])
  ],
  handleValidationErrors,
  telegramController.broadcastMessage
);

/**
 * @swagger
 * /api/admin/telegram/link:
 *   post:
 *     summary: Link Telegram account
 *     description: Link a Telegram account to a web account
 *     tags: [Telegram Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LinkAccountRequest'
 *     responses:
 *       200:
 *         description: Accounts linked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Accounts linked successfully
 *       400:
 *         description: Invalid request or account already linked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User or Telegram user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/link', 
  authenticateToken, 
  requireAdmin,
  [
    body('telegramId').notEmpty().withMessage('Telegram ID is required'),
    body('userId').isMongoId().withMessage('Valid User ID is required')
  ],
  handleValidationErrors,
  telegramController.linkAccount
);

/**
 * @swagger
 * /api/admin/telegram/users/{telegramId}/unlink:
 *   post:
 *     summary: Unlink Telegram account
 *     description: Unlink a Telegram account from its web account
 *     tags: [Telegram Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: telegramId
 *         required: true
 *         schema:
 *           type: string
 *         description: Telegram user ID
 *     responses:
 *       200:
 *         description: Account unlinked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Account unlinked successfully
 *       400:
 *         description: Account is not linked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Telegram user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/users/:telegramId/unlink', 
  authenticateToken, 
  requireAdmin,
  [
    param('telegramId').notEmpty().withMessage('Telegram ID is required')
  ],
  handleValidationErrors,
  telegramController.unlinkAccount
);

/**
 * @swagger
 * /api/admin/telegram/statistics:
 *   get:
 *     summary: Get bot statistics
 *     description: Get comprehensive statistics about the Telegram bot usage
 *     tags: [Telegram Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     overview:
 *                       type: object
 *                       properties:
 *                         totalUsers:
 *                           type: number
 *                           example: 1250
 *                         activeUsers:
 *                           type: number
 *                           example: 980
 *                         blockedUsers:
 *                           type: number
 *                           example: 15
 *                         linkedUsers:
 *                           type: number
 *                           example: 800
 *                         isInitialized:
 *                           type: boolean
 *                           example: true
 *                     performance:
 *                       $ref: '#/components/schemas/BotStats'
 *                     recentActivity:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           telegramId:
 *                             type: string
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           username:
 *                             type: string
 *                           lastInteraction:
 *                             type: string
 *                             format: date-time
 *                           messageCount:
 *                             type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/statistics', 
  authenticateToken, 
  requireAdmin, 
  telegramController.getBotStatistics
);

module.exports = router;