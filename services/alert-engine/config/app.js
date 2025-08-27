const path = require('path');
const { logger } = require('../utils');

/**
 * Application configuration for Alert Engine
 */
class AppConfig {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.loadConfiguration();
  }

  /**
   * Load configuration based on environment
   */
  loadConfiguration() {
    // Server configuration
    this.server = {
      port: parseInt(process.env.ALERT_ENGINE_PORT) || 3003,
      host: process.env.ALERT_ENGINE_HOST || '0.0.0.0',
      name: 'Alert Engine Service',
      version: process.env.npm_package_version || '1.0.0',
      timeout: parseInt(process.env.SERVER_TIMEOUT) || 30000,
      keepAliveTimeout: parseInt(process.env.KEEP_ALIVE_TIMEOUT) || 5000,
      headersTimeout: parseInt(process.env.HEADERS_TIMEOUT) || 60000,
      maxHeaderSize: parseInt(process.env.MAX_HEADER_SIZE) || 8192,
      bodyLimit: process.env.BODY_LIMIT || '10mb'
    };

    // Security configuration
    this.security = {
      jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
      jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
      corsOrigins: this.parseCorsOrigins(),
      apiKeys: this.parseApiKeys(),
      rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
      rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
      encryptionKey: process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key'
    };

    // Alert Engine specific configuration
    this.alertEngine = {
      checkInterval: parseInt(process.env.ALERT_CHECK_INTERVAL) || 30000, // 30 seconds
      batchSize: parseInt(process.env.ALERT_BATCH_SIZE) || 100,
      maxConcurrentChecks: parseInt(process.env.MAX_CONCURRENT_CHECKS) || 10,
      defaultCooldown: parseInt(process.env.DEFAULT_ALERT_COOLDOWN) || 300000, // 5 minutes
      maxAlertsPerUser: {
        free: parseInt(process.env.MAX_ALERTS_FREE) || 5,
        basic: parseInt(process.env.MAX_ALERTS_BASIC) || 25,
        pro: parseInt(process.env.MAX_ALERTS_PRO) || 100,
        premium: parseInt(process.env.MAX_ALERTS_PREMIUM) || 500
      },
      retryAttempts: parseInt(process.env.ALERT_RETRY_ATTEMPTS) || 3,
      retryDelay: parseInt(process.env.ALERT_RETRY_DELAY) || 5000,
      enableMetrics: process.env.ENABLE_ALERT_METRICS !== 'false',
      metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 60000 // 1 minute
    };

    // Market data configuration
    this.marketData = {
      updateInterval: parseInt(process.env.MARKET_DATA_UPDATE_INTERVAL) || 60000, // 1 minute
      cacheTimeout: parseInt(process.env.MARKET_DATA_CACHE_TIMEOUT) || 300000, // 5 minutes
      maxSymbols: parseInt(process.env.MAX_SYMBOLS) || 1000,
      enableTechnicalAnalysis: process.env.ENABLE_TECHNICAL_ANALYSIS !== 'false',
      technicalAnalysisInterval: parseInt(process.env.TECHNICAL_ANALYSIS_INTERVAL) || 300000, // 5 minutes
      historicalDataDays: parseInt(process.env.HISTORICAL_DATA_DAYS) || 30,
      supportedExchanges: this.parseSupportedExchanges(),
      defaultExchange: process.env.DEFAULT_EXCHANGE || 'binance'
    };

    // External services configuration
    this.externalServices = {
      binance: {
        baseUrl: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET,
        timeout: parseInt(process.env.BINANCE_TIMEOUT) || 10000,
        rateLimit: parseInt(process.env.BINANCE_RATE_LIMIT) || 1200 // requests per minute
      },
      coinGecko: {
        baseUrl: process.env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3',
        apiKey: process.env.COINGECKO_API_KEY,
        timeout: parseInt(process.env.COINGECKO_TIMEOUT) || 10000,
        rateLimit: parseInt(process.env.COINGECKO_RATE_LIMIT) || 50 // requests per minute
      },
      alphaVantage: {
        baseUrl: process.env.ALPHAVANTAGE_BASE_URL || 'https://www.alphavantage.co',
        apiKey: process.env.ALPHAVANTAGE_API_KEY,
        timeout: parseInt(process.env.ALPHAVANTAGE_TIMEOUT) || 10000,
        rateLimit: parseInt(process.env.ALPHAVANTAGE_RATE_LIMIT) || 5 // requests per minute
      }
    };

    // Notification configuration
    this.notifications = {
      telegram: {
        enabled: process.env.TELEGRAM_NOTIFICATIONS_ENABLED !== 'false',
        serviceUrl: process.env.TELEGRAM_SERVICE_URL || 'http://localhost:3005',
        timeout: parseInt(process.env.TELEGRAM_TIMEOUT) || 5000
      },
      email: {
        enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
        serviceUrl: process.env.EMAIL_SERVICE_URL,
        timeout: parseInt(process.env.EMAIL_TIMEOUT) || 10000
      },
      webhook: {
        enabled: process.env.WEBHOOK_NOTIFICATIONS_ENABLED === 'true',
        timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 5000,
        retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS) || 3
      }
    };

    // Logging configuration
    this.logging = {
      level: process.env.LOG_LEVEL || (this.environment === 'production' ? 'info' : 'debug'),
      format: process.env.LOG_FORMAT || 'json',
      enableConsole: process.env.ENABLE_CONSOLE_LOGGING !== 'false',
      enableFile: process.env.ENABLE_FILE_LOGGING === 'true',
      logDir: process.env.LOG_DIR || path.join(__dirname, '..', 'logs'),
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      enableErrorTracking: process.env.ENABLE_ERROR_TRACKING === 'true',
      sentryDsn: process.env.SENTRY_DSN
    };

    // Performance and monitoring
    this.monitoring = {
      enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
      healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
      enableMetrics: process.env.ENABLE_METRICS !== 'false',
      metricsPort: parseInt(process.env.METRICS_PORT) || 9090,
      enableTracing: process.env.ENABLE_TRACING === 'true',
      tracingEndpoint: process.env.TRACING_ENDPOINT,
      enableProfiling: process.env.ENABLE_PROFILING === 'true' && this.environment !== 'production'
    };

    // Cache configuration
    this.cache = {
      defaultTtl: parseInt(process.env.CACHE_DEFAULT_TTL) || 300, // 5 minutes
      maxKeys: parseInt(process.env.CACHE_MAX_KEYS) || 10000,
      checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD) || 600, // 10 minutes
      enableCompression: process.env.CACHE_ENABLE_COMPRESSION !== 'false',
      keyPrefix: process.env.CACHE_KEY_PREFIX || 'alert_engine:'
    };

    // Development specific settings
    if (this.environment === 'development') {
      this.development = {
        enableHotReload: process.env.ENABLE_HOT_RELOAD === 'true',
        enableDebugRoutes: process.env.ENABLE_DEBUG_ROUTES !== 'false',
        mockExternalServices: process.env.MOCK_EXTERNAL_SERVICES === 'true',
        enableDetailedErrors: true
      };
    }

    // Production specific settings
    if (this.environment === 'production') {
      this.production = {
        enableCompression: true,
        enableCaching: true,
        enableMinification: true,
        hideErrorDetails: true,
        enableSecurityHeaders: true
      };
    }

    // Validate critical configuration
    this.validateConfiguration();
  }

  /**
   * Parse CORS origins from environment variable
   */
  parseCorsOrigins() {
    const origins = process.env.CORS_ORIGINS;
    if (!origins) {
      return this.environment === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : [];
    }
    return origins.split(',').map(origin => origin.trim());
  }

  /**
   * Parse API keys from environment variables
   */
  parseApiKeys() {
    const keys = {};
    
    // Service-to-service API keys
    if (process.env.API_GATEWAY_KEY) keys.apiGateway = process.env.API_GATEWAY_KEY;
    if (process.env.SUBSCRIPTION_SERVICE_KEY) keys.subscriptionService = process.env.SUBSCRIPTION_SERVICE_KEY;
    if (process.env.TELEGRAM_SERVICE_KEY) keys.telegramService = process.env.TELEGRAM_SERVICE_KEY;
    if (process.env.NOTIFICATION_SERVICE_KEY) keys.notificationService = process.env.NOTIFICATION_SERVICE_KEY;
    
    return keys;
  }

  /**
   * Parse supported exchanges from environment variable
   */
  parseSupportedExchanges() {
    const exchanges = process.env.SUPPORTED_EXCHANGES;
    if (!exchanges) {
      return ['binance', 'coinbase', 'kraken', 'huobi', 'okx'];
    }
    return exchanges.split(',').map(exchange => exchange.trim().toLowerCase());
  }

  /**
   * Validate critical configuration
   */
  validateConfiguration() {
    const errors = [];

    // Validate JWT secret
    if (!this.security.jwtSecret || this.security.jwtSecret === 'your-super-secret-jwt-key') {
      if (this.environment === 'production') {
        errors.push('JWT_SECRET must be set in production environment');
      } else {
        logger.warn('Using default JWT secret - not suitable for production');
      }
    }

    // Validate encryption key
    if (!this.security.encryptionKey || this.security.encryptionKey === 'your-32-character-encryption-key') {
      if (this.environment === 'production') {
        errors.push('ENCRYPTION_KEY must be set in production environment');
      }
    }

    // Validate encryption key length
    if (this.security.encryptionKey && this.security.encryptionKey.length !== 32) {
      errors.push('ENCRYPTION_KEY must be exactly 32 characters long');
    }

    // Validate external service API keys for production
    if (this.environment === 'production') {
      if (!this.externalServices.binance.apiKey) {
        logger.warn('BINANCE_API_KEY not set - Binance data source will be limited');
      }
      
      if (!this.externalServices.coinGecko.apiKey) {
        logger.warn('COINGECKO_API_KEY not set - CoinGecko data source will be rate limited');
      }
    }

    // Validate port ranges
    if (this.server.port < 1024 || this.server.port > 65535) {
      errors.push('Server port must be between 1024 and 65535');
    }

    if (this.monitoring.metricsPort < 1024 || this.monitoring.metricsPort > 65535) {
      errors.push('Metrics port must be between 1024 and 65535');
    }

    // Validate intervals
    if (this.alertEngine.checkInterval < 1000) {
      errors.push('Alert check interval must be at least 1000ms');
    }

    if (this.marketData.updateInterval < 1000) {
      errors.push('Market data update interval must be at least 1000ms');
    }

    if (errors.length > 0) {
      logger.error('Configuration validation failed:', errors);
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }

    logger.info('Configuration validation passed');
  }

  /**
   * Get configuration for specific component
   */
  get(component) {
    return this[component] || null;
  }

  /**
   * Get all configuration
   */
  getAll() {
    return {
      environment: this.environment,
      server: this.server,
      security: {
        ...this.security,
        jwtSecret: '[HIDDEN]',
        apiKeys: Object.keys(this.security.apiKeys),
        encryptionKey: '[HIDDEN]'
      },
      alertEngine: this.alertEngine,
      marketData: this.marketData,
      externalServices: {
        binance: {
          ...this.externalServices.binance,
          apiKey: this.externalServices.binance.apiKey ? '[HIDDEN]' : undefined,
          apiSecret: '[HIDDEN]'
        },
        coinGecko: {
          ...this.externalServices.coinGecko,
          apiKey: this.externalServices.coinGecko.apiKey ? '[HIDDEN]' : undefined
        },
        alphaVantage: {
          ...this.externalServices.alphaVantage,
          apiKey: this.externalServices.alphaVantage.apiKey ? '[HIDDEN]' : undefined
        }
      },
      notifications: this.notifications,
      logging: this.logging,
      monitoring: this.monitoring,
      cache: this.cache,
      ...(this.development && { development: this.development }),
      ...(this.production && { production: this.production })
    };
  }

  /**
   * Check if feature is enabled
   */
  isFeatureEnabled(feature) {
    const featureMap = {
      'technical-analysis': this.marketData.enableTechnicalAnalysis,
      'metrics': this.alertEngine.enableMetrics,
      'health-checks': this.monitoring.enableHealthChecks,
      'tracing': this.monitoring.enableTracing,
      'profiling': this.monitoring.enableProfiling,
      'telegram-notifications': this.notifications.telegram.enabled,
      'email-notifications': this.notifications.email.enabled,
      'webhook-notifications': this.notifications.webhook.enabled,
      'hot-reload': this.development?.enableHotReload,
      'debug-routes': this.development?.enableDebugRoutes,
      'mock-services': this.development?.mockExternalServices
    };

    return featureMap[feature] || false;
  }

  /**
   * Get environment-specific configuration
   */
  getEnvironmentConfig() {
    return {
      isDevelopment: this.environment === 'development',
      isProduction: this.environment === 'production',
      isTest: this.environment === 'test',
      environment: this.environment
    };
  }
}

// Create singleton instance
const appConfig = new AppConfig();

module.exports = appConfig;