const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
  try {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
    };

    // Create Redis client
    redisClient = redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
        connectTimeout: redisConfig.connectTimeout,
        commandTimeout: redisConfig.commandTimeout,
        keepAlive: redisConfig.keepAlive,
      },
      password: redisConfig.password,
      database: redisConfig.db,
    });

    // Error handling
    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis Client Connected');
    });

    redisClient.on('ready', () => {
      logger.info('🔄 Redis Client Ready');
    });

    redisClient.on('end', () => {
      logger.warn('❌ Redis Client Disconnected');
    });

    redisClient.on('reconnecting', () => {
      logger.info('🔄 Redis Client Reconnecting...');
    });

    // Connect to Redis
    await redisClient.connect();

    logger.info(`📊 Redis Connected: ${redisConfig.host}:${redisConfig.port}`);
    logger.info(`🗄️ Redis Database: ${redisConfig.db}`);

    // Test connection
    await redisClient.ping();
    logger.info('🏓 Redis Ping Successful');

    return redisClient;
  } catch (error) {
    logger.error('❌ Redis connection failed:', error.message);
    logger.warn('⚠️  Server will continue without Redis connection');
    
    // In development, continue without Redis
    if (process.env.NODE_ENV === 'development') {
      return null;
    }
    
    // In production, throw error
    throw error;
  }
};

// Function to get Redis client
const getRedisClient = () => {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis client is not connected');
  }
  return redisClient;
};

// Function to check Redis health
const checkRedisHealth = async () => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return {
        status: 'disconnected',
        error: 'Redis client not connected'
      };
    }

    const start = Date.now();
    await redisClient.ping();
    const responseTime = Date.now() - start;

    const info = await redisClient.info();
    const lines = info.split('\r\n');
    const serverInfo = {};
    
    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        serverInfo[key] = value;
      }
    });

    return {
      status: 'connected',
      responseTime: `${responseTime}ms`,
      version: serverInfo.redis_version,
      uptime: serverInfo.uptime_in_seconds,
      connectedClients: serverInfo.connected_clients,
      usedMemory: serverInfo.used_memory_human,
      totalCommandsProcessed: serverInfo.total_commands_processed
    };
  } catch (error) {
    logger.error('Error checking Redis health:', error);
    return {
      status: 'error',
      error: error.message
    };
  }
};

// Cache utility functions
const cacheUtils = {
  // Set cache with expiration
  async set(key, value, expireInSeconds = 3600) {
    try {
      const client = getRedisClient();
      const serializedValue = JSON.stringify(value);
      await client.setEx(key, expireInSeconds, serializedValue);
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  },

  // Get cache
  async get(key) {
    try {
      const client = getRedisClient();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  },

  // Delete cache
  async del(key) {
    try {
      const client = getRedisClient();
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  },

  // Check if key exists
  async exists(key) {
    try {
      const client = getRedisClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  },

  // Set expiration for existing key
  async expire(key, seconds) {
    try {
      const client = getRedisClient();
      await client.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Cache expire error:', error);
      return false;
    }
  },

  // Get keys by pattern
  async keys(pattern) {
    try {
      const client = getRedisClient();
      return await client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error:', error);
      return [];
    }
  },

  // Increment counter
  async incr(key, expireInSeconds = 3600) {
    try {
      const client = getRedisClient();
      const result = await client.incr(key);
      if (result === 1) {
        await client.expire(key, expireInSeconds);
      }
      return result;
    } catch (error) {
      logger.error('Cache increment error:', error);
      return 0;
    }
  },

  // Hash operations
  async hset(key, field, value) {
    try {
      const client = getRedisClient();
      await client.hSet(key, field, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache hset error:', error);
      return false;
    }
  },

  async hget(key, field) {
    try {
      const client = getRedisClient();
      const value = await client.hGet(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache hget error:', error);
      return null;
    }
  },

  async hgetall(key) {
    try {
      const client = getRedisClient();
      const hash = await client.hGetAll(key);
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value;
        }
      }
      return result;
    } catch (error) {
      logger.error('Cache hgetall error:', error);
      return {};
    }
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (redisClient && redisClient.isOpen) {
    logger.info('Closing Redis connection...');
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
});

process.on('SIGINT', async () => {
  if (redisClient && redisClient.isOpen) {
    logger.info('Closing Redis connection...');
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
});

module.exports = {
  connectRedis,
  getRedisClient,
  checkRedisHealth,
  cacheUtils
};