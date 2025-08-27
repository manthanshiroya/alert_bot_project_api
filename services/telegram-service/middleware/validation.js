const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value
    }));

    logger.warn('Validation failed', {
      userId: req.user?.id,
      endpoint: `${req.method} ${req.originalUrl}`,
      errors: errorMessages,
      body: req.body,
      params: req.params,
      query: req.query
    });

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  }
  
  next();
};

/**
 * Bot registration validation
 */
const validateBotRegistration = [
  body('botToken')
    .notEmpty()
    .withMessage('Bot token is required')
    .matches(/^[0-9]{8,10}:[a-zA-Z0-9_-]{35}$/)
    .withMessage('Invalid bot token format'),
  
  body('botName')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Bot name must be between 1 and 100 characters')
    .trim(),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters')
    .trim(),
  
  body('webhookUrl')
    .optional()
    .isURL()
    .withMessage('Invalid webhook URL format'),
  
  body('settings')
    .optional()
    .isObject()
    .withMessage('Settings must be an object'),
  
  body('settings.messageFormat')
    .optional()
    .isIn(['text', 'markdown', 'html'])
    .withMessage('Message format must be text, markdown, or html'),
  
  body('settings.notifications')
    .optional()
    .isBoolean()
    .withMessage('Notifications must be a boolean'),
  
  body('settings.rateLimitPerMinute')
    .optional()
    .isInt({ min: 1, max: 30 })
    .withMessage('Rate limit must be between 1 and 30 messages per minute'),
  
  handleValidationErrors
];

/**
 * Bot update validation
 */
const validateBotUpdate = [
  param('botId')
    .isMongoId()
    .withMessage('Invalid bot ID'),
  
  body('botName')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Bot name must be between 1 and 100 characters')
    .trim(),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters')
    .trim(),
  
  body('active')
    .optional()
    .isBoolean()
    .withMessage('Active must be a boolean'),
  
  body('webhookUrl')
    .optional()
    .isURL()
    .withMessage('Invalid webhook URL format'),
  
  body('settings')
    .optional()
    .isObject()
    .withMessage('Settings must be an object'),
  
  body('settings.messageFormat')
    .optional()
    .isIn(['text', 'markdown', 'html'])
    .withMessage('Message format must be text, markdown, or html'),
  
  body('settings.notifications')
    .optional()
    .isBoolean()
    .withMessage('Notifications must be a boolean'),
  
  body('settings.rateLimitPerMinute')
    .optional()
    .isInt({ min: 1, max: 30 })
    .withMessage('Rate limit must be between 1 and 30 messages per minute'),
  
  handleValidationErrors
];

/**
 * Send message validation
 */
const validateSendMessage = [
  param('botId')
    .isMongoId()
    .withMessage('Invalid bot ID'),
  
  body('chatId')
    .notEmpty()
    .withMessage('Chat ID is required')
    .custom((value) => {
      // Telegram chat IDs can be numbers or strings starting with @
      if (typeof value === 'string' && value.startsWith('@')) {
        return true;
      }
      if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value))) {
        return true;
      }
      throw new Error('Invalid chat ID format');
    }),
  
  body('text')
    .notEmpty()
    .withMessage('Message text is required')
    .isLength({ min: 1, max: 4096 })
    .withMessage('Message text must be between 1 and 4096 characters'),
  
  body('parseMode')
    .optional()
    .isIn(['Markdown', 'MarkdownV2', 'HTML'])
    .withMessage('Parse mode must be Markdown, MarkdownV2, or HTML'),
  
  body('disableWebPagePreview')
    .optional()
    .isBoolean()
    .withMessage('Disable web page preview must be a boolean'),
  
  body('disableNotification')
    .optional()
    .isBoolean()
    .withMessage('Disable notification must be a boolean'),
  
  body('replyToMessageId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Reply to message ID must be a positive integer'),
  
  body('inlineKeyboard')
    .optional()
    .isArray()
    .withMessage('Inline keyboard must be an array'),
  
  body('priority')
    .optional()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('Priority must be low, normal, high, or urgent'),
  
  handleValidationErrors
];

/**
 * Alert creation validation
 */
const validateAlertCreation = [
  body('name')
    .notEmpty()
    .withMessage('Alert name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Alert name must be between 1 and 100 characters')
    .trim(),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters')
    .trim(),
  
  body('type')
    .notEmpty()
    .withMessage('Alert type is required')
    .isIn(['price', 'volume', 'technical', 'news', 'custom'])
    .withMessage('Invalid alert type'),
  
  body('category')
    .optional()
    .isIn(['crypto', 'stock', 'forex', 'commodity', 'general'])
    .withMessage('Invalid alert category'),
  
  body('botId')
    .notEmpty()
    .withMessage('Bot ID is required')
    .isMongoId()
    .withMessage('Invalid bot ID'),
  
  body('chatIds')
    .notEmpty()
    .withMessage('At least one chat ID is required')
    .isArray({ min: 1 })
    .withMessage('Chat IDs must be a non-empty array'),
  
  body('conditions')
    .notEmpty()
    .withMessage('Alert conditions are required')
    .isObject()
    .withMessage('Conditions must be an object'),
  
  body('triggers')
    .optional()
    .isObject()
    .withMessage('Triggers must be an object'),
  
  body('triggers.checkInterval')
    .optional()
    .isInt({ min: 60, max: 86400 })
    .withMessage('Check interval must be between 60 and 86400 seconds'),
  
  body('triggers.cooldownMinutes')
    .optional()
    .isInt({ min: 1, max: 1440 })
    .withMessage('Cooldown must be between 1 and 1440 minutes'),
  
  body('triggers.maxAlertsPerDay')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Max alerts per day must be between 1 and 100'),
  
  body('messageTemplate')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Message template must not exceed 2000 characters'),
  
  handleValidationErrors
];

/**
 * Alert update validation
 */
const validateAlertUpdate = [
  param('alertId')
    .isMongoId()
    .withMessage('Invalid alert ID'),
  
  body('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Alert name must be between 1 and 100 characters')
    .trim(),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters')
    .trim(),
  
  body('active')
    .optional()
    .isBoolean()
    .withMessage('Active must be a boolean'),
  
  body('paused')
    .optional()
    .isBoolean()
    .withMessage('Paused must be a boolean'),
  
  body('chatIds')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Chat IDs must be a non-empty array'),
  
  body('conditions')
    .optional()
    .isObject()
    .withMessage('Conditions must be an object'),
  
  body('triggers')
    .optional()
    .isObject()
    .withMessage('Triggers must be an object'),
  
  body('triggers.checkInterval')
    .optional()
    .isInt({ min: 60, max: 86400 })
    .withMessage('Check interval must be between 60 and 86400 seconds'),
  
  body('triggers.cooldownMinutes')
    .optional()
    .isInt({ min: 1, max: 1440 })
    .withMessage('Cooldown must be between 1 and 1440 minutes'),
  
  body('triggers.maxAlertsPerDay')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Max alerts per day must be between 1 and 100'),
  
  body('messageTemplate')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Message template must not exceed 2000 characters'),
  
  handleValidationErrors
];

/**
 * Bulk operations validation
 */
const validateBulkOperation = [
  body('alertIds')
    .notEmpty()
    .withMessage('Alert IDs are required')
    .isArray({ min: 1, max: 50 })
    .withMessage('Alert IDs must be an array with 1-50 items'),
  
  body('alertIds.*')
    .isMongoId()
    .withMessage('Each alert ID must be valid'),
  
  handleValidationErrors
];

/**
 * Pagination validation
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'updatedAt', 'name', 'type', 'status'])
    .withMessage('Invalid sort field'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
  
  handleValidationErrors
];

/**
 * MongoDB ObjectId validation
 */
const validateObjectId = (paramName) => [
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName}`),
  
  handleValidationErrors
];

/**
 * Date range validation
 */
const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
    .custom((endDate, { req }) => {
      if (req.query.startDate && endDate) {
        const start = new Date(req.query.startDate);
        const end = new Date(endDate);
        if (end <= start) {
          throw new Error('End date must be after start date');
        }
      }
      return true;
    }),
  
  handleValidationErrors
];

/**
 * Webhook validation
 */
const validateWebhook = [
  param('botId')
    .notEmpty()
    .withMessage('Bot ID is required'),
  
  body('update_id')
    .optional()
    .isInt()
    .withMessage('Update ID must be an integer'),
  
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateBotRegistration,
  validateBotUpdate,
  validateSendMessage,
  validateAlertCreation,
  validateAlertUpdate,
  validateBulkOperation,
  validatePagination,
  validateObjectId,
  validateDateRange,
  validateWebhook
};