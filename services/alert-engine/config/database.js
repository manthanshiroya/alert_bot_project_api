const mongoose = require('mongoose');
const Redis = require('ioredis');
const { logger } = require('../utils');

// Global variables
let redisClient;
let redisSubscriber;
let redisPublisher;

/**
 * Connect to MongoDB
 */
const connectDB = async () => {
  try {
    const mongoURI = process.env.NODE_ENV === 'test' 
      ? process.env.MONGODB_TEST_URI 
      : process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error('MongoDB URI not provided');
    }

    const options = {
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,
      serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT) || 5000,
      socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT) || 45000,
      bufferMaxEntries: 0,
      bufferCommands: false,
    };

    await mongoose.connect(mongoURI, options);

    // Connection event handlers
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected successfully');
    });

    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed through app termination');
      } catch (error) {
        logger.error('Error closing MongoDB connection:', error);
      }
    });

    logger.info('MongoDB connection established');
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
};

/**
 * Connect to Redis
 */
const connectRedis = async () => {
  try {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
      family: 4
    };

    // Create Redis clients
    redisClient = new Redis(redisConfig);
    redisSubscriber = new Redis(redisConfig);
    redisPublisher = new Redis(redisConfig);

    // Connect all clients
    await Promise.all([
      redisClient.connect(),
      redisSubscriber.connect(),
      redisPublisher.connect()
    ]);

    // Event handlers for main client
    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('error', (error) => {
      logger.error('Redis client error:', error);
    });

    redisClient.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    // Event handlers for subscriber
    redisSubscriber.on('connect', () => {
      logger.info('Redis subscriber connected');
    });

    redisSubscriber.on('error', (error) => {
      logger.error('Redis subscriber error:', error);
    });

    // Event handlers for publisher
    redisPublisher.on('connect', () => {
      logger.info('Redis publisher connected');
    });

    redisPublisher.on('error', (error) => {
      logger.error('Redis publisher error:', error);
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      try {
        await Promise.all([
          redisClient.quit(),
          redisSubscriber.quit(),
          redisPublisher.quit()
        ]);
        logger.info('Redis connections closed through app termination');
      } catch (error) {
        logger.error('Error closing Redis connections:', error);
      }
    });

    logger.info('Redis connections established');
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

/**
 * Get Redis client instance
 */
const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
};

/**
 * Get Redis subscriber instance
 */
const getRedisSubscriber = () => {
  if (!redisSubscriber) {
    throw new Error('Redis subscriber not initialized');
  }
  return redisSubscriber;
};

/**
 * Get Redis publisher instance
 */
const getRedisPublisher = () => {
  if (!redisPublisher) {
    throw new Error('Redis publisher not initialized');
  }
  return redisPublisher;
};

/**
 * Cache helper functions
 */
const cache = {
  /**
   * Get value from cache
   */
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

  /**
   * Set value in cache
   */
  async set(key, value, ttl = 3600) {
    try {
      const client = getRedisClient();
      const serialized = JSON.stringify(value);
      if (ttl > 0) {
        await client.setex(key, ttl, serialized);
      } else {
        await client.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  },

  /**
   * Delete value from cache
   */
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

  /**
   * Check if key exists in cache
   */
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

  /**
   * Increment value in cache
   */
  async incr(key, amount = 1) {
    try {
      const client = getRedisClient();
      if (amount === 1) {
        return await client.incr(key);
      } else {
        return await client.incrby(key, amount);
      }
    } catch (error) {
      logger.error('Cache increment error:', error);
      return null;
    }
  },

  /**
   * Set expiration for key
   */
  async expire(key, ttl) {
    try {
      const client = getRedisClient();
      await client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error('Cache expire error:', error);
      return false;
    }
  },

  /**
   * Get multiple keys
   */
  async mget(keys) {
    try {
      const client = getRedisClient();
      const values = await client.mget(keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      logger.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  },

  /**
   * Set multiple keys
   */
  async mset(keyValuePairs, ttl = 3600) {
    try {
      const client = getRedisClient();
      const pipeline = client.pipeline();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const serialized = JSON.stringify(value);
        if (ttl > 0) {
          pipeline.setex(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      }
      
      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Cache mset error:', error);
      return false;
    }
  },

  /**
   * Get keys by pattern
   */
  async keys(pattern) {
    try {
      const client = getRedisClient();
      return await client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error:', error);
      return [];
    }
  },

  /**
   * Clear all cache
   */
  async clear() {
    try {
      const client = getRedisClient();
      await client.flushdb();
      return true;
    } catch (error) {
      logger.error('Cache clear error:', error);
      return false;
    }
  }
};

/**
 * Pub/Sub helper functions
 */
const pubsub = {
  /**
   * Publish message to channel
   */
  async publish(channel, message) {
    try {
      const publisher = getRedisPublisher();
      const serialized = typeof message === 'string' ? message : JSON.stringify(message);
      await publisher.publish(channel, serialized);
      return true;
    } catch (error) {
      logger.error('Publish error:', error);
      return false;
    }
  },

  /**
   * Subscribe to channel
   */
  async subscribe(channel, callback) {
    try {
      const subscriber = getRedisSubscriber();
      
      subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsed = JSON.parse(message);
            callback(parsed);
          } catch (error) {
            callback(message);
          }
        }
      });
      
      await subscriber.subscribe(channel);
      logger.info(`Subscribed to channel: ${channel}`);
      return true;
    } catch (error) {
      logger.error('Subscribe error:', error);
      return false;
    }
  },

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(channel) {
    try {
      const subscriber = getRedisSubscriber();
      await subscriber.unsubscribe(channel);
      logger.info(`Unsubscribed from channel: ${channel}`);
      return true;
    } catch (error) {
      logger.error('Unsubscribe error:', error);
      return false;
    }
  }
};

/**
 * Health check for databases
 */
const healthCheck = async () => {
  const health = {
    mongodb: { status: 'unknown' },
    redis: { status: 'unknown' }
  };

  // Check MongoDB
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      health.mongodb = { status: 'healthy' };
    } else {
      health.mongodb = { status: 'disconnected' };
    }
  } catch (error) {
    health.mongodb = { status: 'error', error: error.message };
  }

  // Check Redis
  try {
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.ping();
      health.redis = { status: 'healthy' };
    } else {
      health.redis = { status: 'disconnected' };
    }
  } catch (error) {
    health.redis = { status: 'error', error: error.message };
  }

  return health;
};

module.exports = {
  connectDB,
  connectRedis,
  getRedisClient,
  getRedisSubscriber,
  getRedisPublisher,
  cache,
  pubsub,
  healthCheck
};