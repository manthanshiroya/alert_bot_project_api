require('dotenv').config();

const environments = {
  development: {
    NODE_ENV: 'development',
    PORT: process.env.PORT || 3000,
    
    // Database Configuration
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/alertbot_dev',
    REDIS_URI: process.env.REDIS_URI || 'redis://localhost:6379',
    
    // JWT Configuration
    JWT_SECRET: process.env.JWT_SECRET || 'dev-jwt-secret-key-change-in-production',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    
    // API Configuration
    API_VERSION: process.env.API_VERSION || 'v1',
    API_PREFIX: process.env.API_PREFIX || '/api',
    
    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    
    // Telegram Bot Configuration
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL || '',
    
    // TradingView Webhook
    TRADINGVIEW_WEBHOOK_SECRET: process.env.TRADINGVIEW_WEBHOOK_SECRET || 'dev-webhook-secret',
    
    // Service URLs
    API_GATEWAY_URL: process.env.API_GATEWAY_URL || 'http://localhost:3000',
    SUBSCRIPTION_SERVICE_URL: process.env.SUBSCRIPTION_SERVICE_URL || 'http://localhost:3001',
    TELEGRAM_SERVICE_URL: process.env.TELEGRAM_SERVICE_URL || 'http://localhost:3002',
    ALERT_ENGINE_URL: process.env.ALERT_ENGINE_URL || 'http://localhost:3003',
    
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
    LOG_FORMAT: process.env.LOG_FORMAT || 'combined',
    
    // Security
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 10,
    
    // Performance
    CACHE_TTL: parseInt(process.env.CACHE_TTL) || 300, // 5 minutes
    SESSION_TTL: parseInt(process.env.SESSION_TTL) || 86400, // 24 hours
    
    // Alert Processing
    ALERT_QUEUE_CONCURRENCY: parseInt(process.env.ALERT_QUEUE_CONCURRENCY) || 5,
    ALERT_RETRY_ATTEMPTS: parseInt(process.env.ALERT_RETRY_ATTEMPTS) || 3,
    ALERT_RETRY_DELAY: parseInt(process.env.ALERT_RETRY_DELAY) || 1000, // 1 second
  },
  
  staging: {
    NODE_ENV: 'staging',
    PORT: process.env.PORT || 3000,
    
    // Database Configuration
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/alertbot_staging',
    REDIS_URI: process.env.REDIS_URI || 'redis://localhost:6379',
    
    // JWT Configuration
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '12h',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '3d',
    
    // API Configuration
    API_VERSION: process.env.API_VERSION || 'v1',
    API_PREFIX: process.env.API_PREFIX || '/api',
    
    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
    
    // Telegram Bot Configuration
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL,
    
    // TradingView Webhook
    TRADINGVIEW_WEBHOOK_SECRET: process.env.TRADINGVIEW_WEBHOOK_SECRET,
    
    // Service URLs
    API_GATEWAY_URL: process.env.API_GATEWAY_URL || 'http://api-gateway:3000',
    SUBSCRIPTION_SERVICE_URL: process.env.SUBSCRIPTION_SERVICE_URL || 'http://subscription-service:3001',
    TELEGRAM_SERVICE_URL: process.env.TELEGRAM_SERVICE_URL || 'http://telegram-service:3002',
    ALERT_ENGINE_URL: process.env.ALERT_ENGINE_URL || 'http://alert-engine:3003',
    
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_FORMAT: process.env.LOG_FORMAT || 'combined',
    
    // Security
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    
    // Performance
    CACHE_TTL: parseInt(process.env.CACHE_TTL) || 600, // 10 minutes
    SESSION_TTL: parseInt(process.env.SESSION_TTL) || 43200, // 12 hours
    
    // Alert Processing
    ALERT_QUEUE_CONCURRENCY: parseInt(process.env.ALERT_QUEUE_CONCURRENCY) || 10,
    ALERT_RETRY_ATTEMPTS: parseInt(process.env.ALERT_RETRY_ATTEMPTS) || 3,
    ALERT_RETRY_DELAY: parseInt(process.env.ALERT_RETRY_DELAY) || 2000,
  },
  
  production: {
    NODE_ENV: 'production',
    PORT: process.env.PORT || 3000,
    
    // Database Configuration
    MONGODB_URI: process.env.MONGODB_URI,
    REDIS_URI: process.env.REDIS_URI,
    
    // JWT Configuration
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '1d',
    
    // API Configuration
    API_VERSION: process.env.API_VERSION || 'v1',
    API_PREFIX: process.env.API_PREFIX || '/api',
    
    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500,
    
    // Telegram Bot Configuration
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL,
    
    // TradingView Webhook
    TRADINGVIEW_WEBHOOK_SECRET: process.env.TRADINGVIEW_WEBHOOK_SECRET,
    
    // Service URLs
    API_GATEWAY_URL: process.env.API_GATEWAY_URL,
    SUBSCRIPTION_SERVICE_URL: process.env.SUBSCRIPTION_SERVICE_URL,
    TELEGRAM_SERVICE_URL: process.env.TELEGRAM_SERVICE_URL,
    ALERT_ENGINE_URL: process.env.ALERT_ENGINE_URL,
    
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'warn',
    LOG_FORMAT: process.env.LOG_FORMAT || 'combined',
    
    // Security
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 14,
    
    // Performance
    CACHE_TTL: parseInt(process.env.CACHE_TTL) || 1800, // 30 minutes
    SESSION_TTL: parseInt(process.env.SESSION_TTL) || 28800, // 8 hours
    
    // Alert Processing
    ALERT_QUEUE_CONCURRENCY: parseInt(process.env.ALERT_QUEUE_CONCURRENCY) || 20,
    ALERT_RETRY_ATTEMPTS: parseInt(process.env.ALERT_RETRY_ATTEMPTS) || 5,
    ALERT_RETRY_DELAY: parseInt(process.env.ALERT_RETRY_DELAY) || 5000,
  }
};

class EnvironmentConfig {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.config = environments[this.env] || environments.development;
    
    // Validate required environment variables in production
    if (this.env === 'production') {
      this.validateProductionConfig();
    }
  }
  
  validateProductionConfig() {
    const required = [
      'MONGODB_URI',
      'REDIS_URI',
      'JWT_SECRET',
      'TELEGRAM_BOT_TOKEN',
      'TRADINGVIEW_WEBHOOK_SECRET'
    ];
    
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
  
  get(key) {
    return this.config[key];
  }
  
  getAll() {
    return { ...this.config };
  }
  
  isDevelopment() {
    return this.env === 'development';
  }
  
  isStaging() {
    return this.env === 'staging';
  }
  
  isProduction() {
    return this.env === 'production';
  }
  
  getEnvironment() {
    return this.env;
  }
  
  // Service-specific configurations
  getDatabaseConfig() {
    return {
      mongodb: {
        uri: this.get('MONGODB_URI'),
        options: {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          maxPoolSize: this.isProduction() ? 20 : 10,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        }
      },
      redis: {
        uri: this.get('REDIS_URI'),
        options: {
          retryDelayOnFailover: 100,
          enableReadyCheck: true,
          maxRetriesPerRequest: 3,
        }
      }
    };
  }
  
  getJWTConfig() {
    return {
      secret: this.get('JWT_SECRET'),
      expiresIn: this.get('JWT_EXPIRES_IN'),
      refreshExpiresIn: this.get('JWT_REFRESH_EXPIRES_IN'),
      algorithm: 'HS256',
      issuer: 'alertbot-api',
      audience: 'alertbot-users'
    };
  }
  
  getRateLimitConfig() {
    return {
      windowMs: this.get('RATE_LIMIT_WINDOW_MS'),
      max: this.get('RATE_LIMIT_MAX_REQUESTS'),
      message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(this.get('RATE_LIMIT_WINDOW_MS') / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
    };
  }
  
  getTelegramConfig() {
    return {
      botToken: this.get('TELEGRAM_BOT_TOKEN'),
      webhookUrl: this.get('TELEGRAM_WEBHOOK_URL'),
      polling: this.isDevelopment(),
      webhook: !this.isDevelopment()
    };
  }
  
  getServiceUrls() {
    return {
      apiGateway: this.get('API_GATEWAY_URL'),
      subscriptionService: this.get('SUBSCRIPTION_SERVICE_URL'),
      telegramService: this.get('TELEGRAM_SERVICE_URL'),
      alertEngine: this.get('ALERT_ENGINE_URL')
    };
  }
}

// Singleton instance
const environmentConfig = new EnvironmentConfig();

module.exports = environmentConfig;