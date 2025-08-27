const mongoose = require('mongoose');
const redis = require('redis');
const { promisify } = require('util');

class DatabaseConfig {
  constructor() {
    this.mongoConnection = null;
    this.redisClient = null;
  }

  async connectMongoDB() {
    try {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/alertbot';
      
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferMaxEntries: 0,
        bufferCommands: false,
      };

      this.mongoConnection = await mongoose.connect(mongoUri, options);
      
      console.log(`✅ MongoDB connected: ${mongoUri}`);
      
      // Handle connection events
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
      });
      
      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected');
      });
      
      mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected');
      });
      
      return this.mongoConnection;
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      throw error;
    }
  }

  async connectRedis() {
    try {
      const redisUri = process.env.REDIS_URI || 'redis://localhost:6379';
      
      this.redisClient = redis.createClient({
        url: redisUri,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('❌ Redis server connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            console.error('❌ Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            console.error('❌ Redis max retry attempts reached');
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.redisClient.on('error', (err) => {
        console.error('❌ Redis client error:', err);
      });

      this.redisClient.on('connect', () => {
        console.log('✅ Redis connected');
      });

      this.redisClient.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...');
      });

      this.redisClient.on('ready', () => {
        console.log('✅ Redis ready');
      });

      await this.redisClient.connect();
      
      return this.redisClient;
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      throw error;
    }
  }

  async disconnectMongoDB() {
    if (this.mongoConnection) {
      await mongoose.disconnect();
      console.log('🔌 MongoDB disconnected');
    }
  }

  async disconnectRedis() {
    if (this.redisClient) {
      await this.redisClient.quit();
      console.log('🔌 Redis disconnected');
    }
  }

  async disconnectAll() {
    await Promise.all([
      this.disconnectMongoDB(),
      this.disconnectRedis()
    ]);
  }

  getMongoConnection() {
    return this.mongoConnection;
  }

  getRedisClient() {
    return this.redisClient;
  }

  // Health check methods
  async checkMongoHealth() {
    try {
      if (!this.mongoConnection) {
        return { status: 'disconnected', message: 'No connection established' };
      }
      
      const state = mongoose.connection.readyState;
      const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      };
      
      return {
        status: states[state] || 'unknown',
        readyState: state,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        name: mongoose.connection.name
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async checkRedisHealth() {
    try {
      if (!this.redisClient) {
        return { status: 'disconnected', message: 'No connection established' };
      }
      
      const pong = await this.redisClient.ping();
      return {
        status: 'connected',
        ping: pong,
        ready: this.redisClient.isReady
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// Singleton instance
const databaseConfig = new DatabaseConfig();

module.exports = databaseConfig;