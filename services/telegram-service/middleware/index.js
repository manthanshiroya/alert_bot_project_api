const auth = require('./auth');
const validation = require('./validation');
const rateLimiter = require('./rateLimiter');

module.exports = {
  // Authentication middleware
  authenticate: auth.authenticate,
  authorize: auth.authorize,
  optionalAuth: auth.optionalAuth,
  authenticateApiKey: auth.authenticateApiKey,
  authenticateWebhook: auth.authenticateWebhook,
  adminOnly: auth.adminOnly,
  userOrAdmin: auth.userOrAdmin,

  // Validation middleware
  handleValidationErrors: validation.handleValidationErrors,
  validateBotRegistration: validation.validateBotRegistration,
  validateBotUpdate: validation.validateBotUpdate,
  validateSendMessage: validation.validateSendMessage,
  validateAlertCreation: validation.validateAlertCreation,
  validateAlertUpdate: validation.validateAlertUpdate,
  validateBulkOperation: validation.validateBulkOperation,
  validatePagination: validation.validatePagination,
  validateObjectId: validation.validateObjectId,
  validateDateRange: validation.validateDateRange,
  validateWebhook: validation.validateWebhook,

  // Rate limiting middleware
  generalRateLimit: rateLimiter.generalRateLimit,
  botRegistrationRateLimit: rateLimiter.botRegistrationRateLimit,
  messageSendingRateLimit: rateLimiter.messageSendingRateLimit,
  alertCreationRateLimit: rateLimiter.alertCreationRateLimit,
  alertTestingRateLimit: rateLimiter.alertTestingRateLimit,
  webhookRateLimit: rateLimiter.webhookRateLimit,
  strictRateLimit: rateLimiter.strictRateLimit,
  bulkOperationRateLimit: rateLimiter.bulkOperationRateLimit,
  dynamicRateLimit: rateLimiter.dynamicRateLimit,
  perMinuteRateLimit: rateLimiter.perMinuteRateLimit,
  createCustomRateLimit: rateLimiter.createCustomRateLimit,
  rateLimitInfo: rateLimiter.rateLimitInfo
};