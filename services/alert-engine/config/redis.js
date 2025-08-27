const Redis = require('ioredis');
const { logger } = require('../utils');

/**
 * Redis configuration for Alert Engine
 */
class RedisConfig {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = parseInt(process.env.REDIS_MAX_RETRIES) || 5;
    this.retryDelay = parseInt(process.env.REDIS_RETRY_DELAY) || 2000;
    
    this.config = this.getRedisConfig();
  }

  /**
   * Get Redis configuration based on environment
   */
  getRedisConfig() {
    const environment = process.env.NODE_ENV || 'development';
    
    const baseConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'alert_engine:',
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
      family: 4
    };

    // Environment-specific configurations
    switch (environment) {
      case 'production':
        return {
          ...baseConfig,
          host: process.env.REDIS_HOST_PROD || baseConfig.host,
          port: parseInt(process.env.REDIS_PORT_PROD) || baseConfig.port,
          password: process.env.REDIS_PASSWORD_PROD || baseConfig.password,
          db: parseInt(process.env.REDIS_DB_PROD) || 0,
          retryDelayOnFailover: 500,
          maxRetriesPerRequest: 5,
          enableOfflineQueue: false
        };
      
      case 'test':
        return {
          ...baseConfig,
          host: process.env.REDIS_HOST_TEST || baseConfig.host,
          port: parseInt(process.env.REDIS_PORT_TEST) || baseConfig.port,
          db: parseInt(process.env.REDIS_DB_TEST) || 15, // Use different DB for tests
          keyPrefix: 'test_alert_engine:',
          retryDelayOnFailover: 50,
          maxRetriesPerRequest: 1
        };
      
      case 'development':
      default:
        return {
          ...baseConfig,
          db: parseInt(process.env.REDIS_DB_DEV) || 1
        };
    }
  }

  /**
   * Connect to Redis
   */
  async connect() {
    try {
      logger.info('Attempting to connect to Redis...', {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db,
        attempt: this.connectionAttempts + 1
      });

      // Create main Redis client
      this.client = new Redis(this.config);
      
      // Create subscriber and publisher for pub/sub
      this.subscriber = new Redis(this.config);
      this.publisher = new Redis(this.config);

      // Setup event handlers
      this.setupEventHandlers();

      // Test connection
      await this.client.ping();
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      
      logger.info('Successfully connected to Redis', {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db
      });

      return this.client;
      
    } catch (error) {
      this.connectionAttempts++;
      
      logger.error('Failed to connect to Redis', {
        error: error.message,
        attempt: this.connectionAttempts,
        maxRetries: this.maxRetries
      });

      if (this.connectionAttempts < this.maxRetries) {
        logger.info(`Retrying Redis connection in ${this.retryDelay}ms...`);
        await this.delay(this.retryDelay);
        return this.connect();
      } else {
        throw new Error(`Failed to connect to Redis after ${this.maxRetries} attempts: ${error.message}`);
      }
    }
  }

  /**
   * Setup Redis event handlers
   */
  setupEventHandlers() {
    // Main client events
    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error:', error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.warn('Redis client connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', (delay) => {
      logger.info(`Redis client reconnecting in ${delay}ms`);
    });

    this.client.on('end', () => {
      logger.info('Redis client connection ended');
      this.isConnected = false;
    });

    // Subscriber events
    this.subscriber.on('error', (error) => {
      logger.error('Redis subscriber error:', error);
    });

    this.subscriber.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });

    // Publisher events
    this.publisher.on('error', (error) => {
      logger.error('Redis publisher error:', error);
    });

    // Handle process termination
    process.on('SIGINT', () => {
      this.disconnect('SIGINT');
    });

    process.on('SIGTERM', () => {
      this.disconnect('SIGTERM');
    });
  }

  /**
   * Handle Redis pub/sub messages
   */
  handleMessage(channel, message) {
    try {
      const data = JSON.parse(message);
      
      logger.debug('Received Redis message', {
        channel,
        type: data.type,
        timestamp: data.timestamp
      });

      // Emit event for other parts of the application to handle
      process.emit('redis:message', { channel, data });
      
    } catch (error) {
      logger.error('Failed to parse Redis message', {
        channel,
        message,
        error: error.message
      });
    }
  }

  /**
   * Subscribe to Redis channels
   */
  async subscribe(channels) {
    try {
      if (!this.isConnected || !this.subscriber) {
        throw new Error('Redis not connected');
      }

      const channelArray = Array.isArray(channels) ? channels : [channels];
      await this.subscriber.subscribe(...channelArray);
      
      logger.info('Subscribed to Redis channels', { channels: channelArray });
    } catch (error) {
      logger.error('Failed to subscribe to Redis channels', {
        channels,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Publish message to Redis channel
   */
  async publish(channel, data) {
    try {
      if (!this.isConnected || !this.publisher) {
        throw new Error('Redis not connected');
      }

      const message = JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
        source: 'alert-engine'
      });

      await this.publisher.publish(channel, message);
      
      logger.debug('Published message to Redis channel', {
        channel,
        type: data.type
      });
    } catch (error) {
      logger.error('Failed to publish Redis message', {
        channel,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get Redis client
   */
  getClient() {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis client not available');
    }
    return this.client;
  }

  /**
   * Get Redis subscriber
   */
  getSubscriber() {
    if (!this.isConnected || !this.subscriber) {
      throw new Error('Redis subscriber not available');
    }
    return this.subscriber;
  }

  /**
   * Get Redis publisher
   */
  getPublisher() {
    if (!this.isConnected || !this.publisher) {
      throw new Error('Redis publisher not available');
    }
    return this.publisher;
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(signal = null) {
    try {
      if (signal) {
        logger.info(`Received ${signal}. Closing Redis connections...`);
      } else {
        logger.info('Closing Redis connections...');
      }

      const promises = [];
      
      if (this.client) {
        promises.push(this.client.quit());
      }
      
      if (this.subscriber) {
        promises.push(this.subscriber.quit());
      }
      
      if (this.publisher) {
        promises.push(this.publisher.quit());
      }

      await Promise.all(promises);
      
      this.isConnected = false;
      this.client = null;
      this.subscriber = null;
      this.publisher = null;
      
      logger.info('Redis connections closed successfully');
      
      if (signal) {
        process.exit(0);
      }
    } catch (error) {
      logger.error('Error closing Redis connections:', error);
      
      if (signal) {
        process.exit(1);
      }
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      client: this.client ? this.client.status : 'disconnected',
      subscriber: this.subscriber ? this.subscriber.status : 'disconnected',
      publisher: this.publisher ? this.publisher.status : 'disconnected',
      config: {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db,
        keyPrefix: this.config.keyPrefix
      },
      connectionAttempts: this.connectionAttempts
    };
  }

  /**
   * Health check for Redis
   */
  async healthCheck() {
    try {
      if (!this.isConnected || !this.client) {
        return {
          status: 'unhealthy',
          message: 'Not connected to Redis'
        };
      }

      const startTime = Date.now();
      const result = await this.client.ping();
      const responseTime = Date.now() - startTime;

      if (result === 'PONG') {
        return {
          status: 'healthy',
          responseTime,
          connection: this.getStatus()
        };
      } else {
        return {
          status: 'unhealthy',
          message: 'Unexpected ping response',
          response: result
        };
      }
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Get Redis info and statistics
   */
  async getInfo() {
    try {
      if (!this.isConnected || !this.client) {
        return null;
      }

      const info = await this.client.info();
      const memory = await this.client.info('memory');
      const stats = await this.client.info('stats');
      
      return {
        server: this.parseRedisInfo(info),
        memory: this.parseRedisInfo(memory),
        stats: this.parseRedisInfo(stats)
      };
    } catch (error) {
      logger.error('Failed to get Redis info:', error);
      return null;
    }
  }

  /**
   * Parse Redis INFO command output
   */
  parseRedisInfo(infoString) {
    const result = {};
    const lines = infoString.split('\r\n');
    
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value !== undefined) {
          result[key] = isNaN(value) ? value : Number(value);
        }
      }
    }
    
    return result;
  }

  /**
   * Clear all keys with the configured prefix
   */
  async clearCache() {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Redis not connected');
      }

      const pattern = `${this.config.keyPrefix}*`;
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.info(`Cleared ${keys.length} cache keys`);
      }
      
      return keys.length;
    } catch (error) {
      logger.error('Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Utility function for delays
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
const redisConfig = new RedisConfig();

module.exports = redisConfig;