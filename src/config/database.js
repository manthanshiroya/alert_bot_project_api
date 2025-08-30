const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tradingview_alerts';
  
  try {
    const options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    };

    // Connect to MongoDB
    const conn = await mongoose.connect(mongoURI, options);

    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
    logger.info(`📊 Database: ${conn.connection.name}`);

    // Connection event listeners
    mongoose.connection.on('connected', () => {
      logger.info('Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Mongoose disconnected from MongoDB');
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        logger.info('Mongoose connection closed through app termination');
        process.exit(0);
      } catch (error) {
        logger.error('Error closing mongoose connection:', error);
        process.exit(1);
      }
    });

    return conn;
  } catch (error) {
    logger.error(`❌ MongoDB connection failed: ${error.message}`);
    logger.error(`🔍 Error Name: ${error.name}`);
    logger.error(`🔍 Error Code: ${error.code || 'N/A'}`);
    logger.error(`🔍 Error CodeName: ${error.codeName || 'N/A'}`);
    logger.error(`🔗 Attempted connection URI: ${mongoURI}`);
    if (error.stack) {
      logger.error(`🔍 Stack trace: ${error.stack}`);
    }
    logger.warn('⚠️  Server will continue without MongoDB connection');
    
    // In development, continue without database
    if (process.env.NODE_ENV === 'development') {
      return null;
    }
    
    // In production, exit process with failure
    process.exit(1);
  }
};

// Function to check database health
const checkDBHealth = async () => {
  try {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return {
      status: states[state] || 'unknown',
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
      collections: Object.keys(mongoose.connection.collections).length
    };
  } catch (error) {
    logger.error('Error checking database health:', error);
    return {
      status: 'error',
      error: error.message
    };
  }
};

// Function to get database statistics
const getDBStats = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database not connected');
    }

    const admin = mongoose.connection.db.admin();
    const stats = await admin.serverStatus();
    
    return {
      version: stats.version,
      uptime: stats.uptime,
      connections: stats.connections,
      memory: stats.mem,
      network: stats.network
    };
  } catch (error) {
    logger.error('Error getting database stats:', error);
    return {
      error: error.message
    };
  }
};

module.exports = {
  connectDB,
  checkDBHealth,
  getDBStats
};