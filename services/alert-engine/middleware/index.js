const auth = require('./auth');
const rateLimit = require('./rateLimit');
const validation = require('./validation');
const errorHandler = require('./errorHandler');

module.exports = {
  // Authentication and authorization
  auth: auth.auth,
  optionalAuth: auth.optionalAuth,
  requireRole: auth.requireRole,
  requirePermission: auth.requirePermission,
  requireSubscription: auth.requireSubscription,
  apiKeyAuth: auth.apiKeyAuth,
  
  // Rate limiting
  createRateLimiter: rateLimit.createRateLimiter,
  generalLimiter: rateLimit.generalLimiter,
  strictLimiter: rateLimit.strictLimiter,
  alertCreationLimiter: rateLimit.alertCreationLimiter,
  marketDataLimiter: rateLimit.marketDataLimiter,
  authLimiter: rateLimit.authLimiter,
  subscriptionBasedLimiter: rateLimit.subscriptionBasedLimiter,
  dynamicLimiter: rateLimit.dynamicLimiter,
  testLimiter: rateLimit.testLimiter,
  burstLimiter: rateLimit.burstLimiter,
  getRateLimitStatus: rateLimit.getRateLimitStatus,
  resetRateLimit: rateLimit.resetRateLimit,
  
  // Validation
  handleValidationErrors: validation.handleValidationErrors,
  alertValidation: validation.alertValidation,
  marketValidation: validation.marketValidation,
  commonValidation: validation.commonValidation,
  customValidators: validation.customValidators,
  
  // Error handling
  AppError: errorHandler.AppError,
  ValidationError: errorHandler.ValidationError,
  AuthenticationError: errorHandler.AuthenticationError,
  AuthorizationError: errorHandler.AuthorizationError,
  NotFoundError: errorHandler.NotFoundError,
  ConflictError: errorHandler.ConflictError,
  RateLimitError: errorHandler.RateLimitError,
  ExternalServiceError: errorHandler.ExternalServiceError,
  DatabaseError: errorHandler.DatabaseError,
  asyncHandler: errorHandler.asyncHandler,
  globalErrorHandler: errorHandler.globalErrorHandler,
  notFoundHandler: errorHandler.notFoundHandler,
  errorLogger: errorHandler.errorLogger,
  handleUncaughtException: errorHandler.handleUncaughtException,
  handleUnhandledRejection: errorHandler.handleUnhandledRejection,
  handleGracefulShutdown: errorHandler.handleGracefulShutdown,
  createError: errorHandler.createError
};