const express = require('express');
const { MarketData, Alert } = require('../models');
const { AlertEngine, DataSourceManager, TechnicalAnalysis } = require('../services');
const { logger, helpers } = require('../utils');
const mongoose = require('mongoose');
const redis = require('redis');

const router = express.Router();

/**
 * @route   GET /api/health
 * @desc    Basic health check
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date(),
      service: 'Alert Engine',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };

    res.json(helpers.successResponse('Service is healthy', healthStatus));
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json(helpers.errorResponse('Health check failed'));
  }
});

/**
 * @route   GET /api/health/detailed
 * @desc    Detailed health check with all components
 * @access  Public
 */
router.get('/detailed', async (req, res) => {
  const healthChecks = {
    service: {
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    },
    database: {
      status: 'unknown',
      mongodb: null,
      redis: null
    },
    alertEngine: {
      status: 'unknown',
      isRunning: false,
      activeAlerts: 0,
      processedToday: 0
    },
    dataSources: {
      status: 'unknown',
      sources: {}
    },
    technicalAnalysis: {
      status: 'unknown',
      indicators: {}
    }
  };

  let overallStatus = 'healthy';

  try {
    // Check MongoDB connection
    try {
      const mongoState = mongoose.connection.readyState;
      const mongoStatus = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      };

      healthChecks.database.mongodb = {
        status: mongoState === 1 ? 'healthy' : 'unhealthy',
        state: mongoStatus[mongoState],
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        name: mongoose.connection.name
      };

      if (mongoState === 1) {
        // Test database operation
        const alertCount = await Alert.countDocuments();
        const marketDataCount = await MarketData.countDocuments();
        
        healthChecks.database.mongodb.collections = {
          alerts: alertCount,
          marketData: marketDataCount
        };
      }

      if (mongoState !== 1) {
        overallStatus = 'degraded';
      }
    } catch (mongoError) {
      logger.error('MongoDB health check failed:', mongoError);
      healthChecks.database.mongodb = {
        status: 'unhealthy',
        error: mongoError.message
      };
      overallStatus = 'unhealthy';
    }

    // Check Redis connection
    try {
      if (process.env.REDIS_URL) {
        const redisClient = redis.createClient({
          url: process.env.REDIS_URL
        });

        await redisClient.connect();
        await redisClient.ping();
        
        healthChecks.database.redis = {
          status: 'healthy',
          connected: true,
          url: process.env.REDIS_URL.replace(/\/\/.*@/, '//***@') // Hide credentials
        };

        await redisClient.disconnect();
      } else {
        healthChecks.database.redis = {
          status: 'not_configured',
          connected: false
        };
      }
    } catch (redisError) {
      logger.error('Redis health check failed:', redisError);
      healthChecks.database.redis = {
        status: 'unhealthy',
        error: redisError.message
      };
      overallStatus = 'degraded';
    }

    // Set overall database status
    if (healthChecks.database.mongodb?.status === 'healthy') {
      healthChecks.database.status = 'healthy';
    } else {
      healthChecks.database.status = 'unhealthy';
    }

    // Check Alert Engine
    try {
      const alertEngine = global.alertEngine;
      if (alertEngine) {
        const engineHealth = await alertEngine.healthCheck();
        healthChecks.alertEngine = {
          status: engineHealth.status,
          isRunning: engineHealth.isRunning,
          activeAlerts: engineHealth.activeAlerts,
          processedToday: engineHealth.processedToday,
          lastProcessed: engineHealth.lastProcessed,
          workers: engineHealth.workers,
          queue: engineHealth.queue
        };

        if (engineHealth.status !== 'healthy') {
          overallStatus = 'degraded';
        }
      } else {
        healthChecks.alertEngine = {
          status: 'not_running',
          isRunning: false,
          error: 'Alert Engine not initialized'
        };
        overallStatus = 'degraded';
      }
    } catch (engineError) {
      logger.error('Alert Engine health check failed:', engineError);
      healthChecks.alertEngine = {
        status: 'unhealthy',
        error: engineError.message
      };
      overallStatus = 'unhealthy';
    }

    // Check Data Sources
    try {
      const dataSourceManager = new DataSourceManager();
      const dataSourceHealth = await dataSourceManager.healthCheck();
      
      healthChecks.dataSources = {
        status: dataSourceHealth.overall,
        sources: dataSourceHealth.sources,
        lastUpdate: dataSourceHealth.lastUpdate
      };

      if (dataSourceHealth.overall !== 'healthy') {
        overallStatus = 'degraded';
      }
    } catch (dataSourceError) {
      logger.error('Data Sources health check failed:', dataSourceError);
      healthChecks.dataSources = {
        status: 'unhealthy',
        error: dataSourceError.message
      };
      overallStatus = 'degraded';
    }

    // Check Technical Analysis
    try {
      const technicalAnalysis = new TechnicalAnalysis();
      const taHealth = await technicalAnalysis.healthCheck();
      
      healthChecks.technicalAnalysis = {
        status: taHealth.status,
        indicators: taHealth.indicators,
        cache: taHealth.cache
      };

      if (taHealth.status !== 'healthy') {
        overallStatus = 'degraded';
      }
    } catch (taError) {
      logger.error('Technical Analysis health check failed:', taError);
      healthChecks.technicalAnalysis = {
        status: 'unhealthy',
        error: taError.message
      };
      overallStatus = 'degraded';
    }

    // Set overall status
    healthChecks.overall = {
      status: overallStatus,
      timestamp: new Date()
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;

    res.status(statusCode).json(
      helpers.successResponse('Detailed health check completed', healthChecks)
    );

  } catch (error) {
    logger.error('Detailed health check failed:', error);
    res.status(500).json(helpers.errorResponse('Detailed health check failed', {
      error: error.message,
      timestamp: new Date()
    }));
  }
});

/**
 * @route   GET /api/health/database
 * @desc    Database-specific health check
 * @access  Public
 */
router.get('/database', async (req, res) => {
  try {
    const dbHealth = {
      mongodb: {
        status: 'unknown',
        connection: null,
        collections: null
      },
      redis: {
        status: 'unknown',
        connection: null
      }
    };

    // MongoDB check
    try {
      const mongoState = mongoose.connection.readyState;
      const mongoStatus = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      };

      dbHealth.mongodb.connection = {
        state: mongoStatus[mongoState],
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        name: mongoose.connection.name
      };

      if (mongoState === 1) {
        // Test operations
        const startTime = Date.now();
        const alertCount = await Alert.countDocuments();
        const marketDataCount = await MarketData.countDocuments();
        const responseTime = Date.now() - startTime;

        dbHealth.mongodb.status = 'healthy';
        dbHealth.mongodb.collections = {
          alerts: alertCount,
          marketData: marketDataCount
        };
        dbHealth.mongodb.responseTime = responseTime;
      } else {
        dbHealth.mongodb.status = 'unhealthy';
      }
    } catch (mongoError) {
      dbHealth.mongodb.status = 'unhealthy';
      dbHealth.mongodb.error = mongoError.message;
    }

    // Redis check
    try {
      if (process.env.REDIS_URL) {
        const redisClient = redis.createClient({
          url: process.env.REDIS_URL
        });

        const startTime = Date.now();
        await redisClient.connect();
        await redisClient.ping();
        const responseTime = Date.now() - startTime;
        
        dbHealth.redis.status = 'healthy';
        dbHealth.redis.connection = {
          connected: true,
          responseTime
        };

        await redisClient.disconnect();
      } else {
        dbHealth.redis.status = 'not_configured';
        dbHealth.redis.connection = {
          configured: false
        };
      }
    } catch (redisError) {
      dbHealth.redis.status = 'unhealthy';
      dbHealth.redis.error = redisError.message;
    }

    const overallStatus = dbHealth.mongodb.status === 'healthy' ? 'healthy' : 'unhealthy';
    const statusCode = overallStatus === 'healthy' ? 200 : 503;

    res.status(statusCode).json(
      helpers.successResponse('Database health check completed', {
        overall: overallStatus,
        ...dbHealth,
        timestamp: new Date()
      })
    );

  } catch (error) {
    logger.error('Database health check failed:', error);
    res.status(500).json(helpers.errorResponse('Database health check failed'));
  }
});

/**
 * @route   GET /api/health/metrics
 * @desc    System metrics and performance data
 * @access  Public
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid
      },
      application: {
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        startTime: new Date(Date.now() - process.uptime() * 1000)
      },
      database: {
        mongodb: {
          readyState: mongoose.connection.readyState,
          collections: {}
        }
      },
      alerts: {
        total: 0,
        active: 0,
        triggered24h: 0
      },
      marketData: {
        symbols: 0,
        lastUpdate: null,
        exchanges: []
      }
    };

    // Get database metrics
    try {
      if (mongoose.connection.readyState === 1) {
        // Alert metrics
        const totalAlerts = await Alert.countDocuments();
        const activeAlerts = await Alert.countDocuments({ isActive: true });
        const triggered24h = await Alert.countDocuments({
          lastTriggered: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });

        metrics.alerts = {
          total: totalAlerts,
          active: activeAlerts,
          triggered24h
        };

        // Market data metrics
        const symbolCount = await MarketData.countDocuments();
        const latestUpdate = await MarketData.findOne()
          .sort({ lastUpdated: -1 })
          .select('lastUpdated');
        
        const exchanges = await MarketData.distinct('exchange');

        metrics.marketData = {
          symbols: symbolCount,
          lastUpdate: latestUpdate?.lastUpdated,
          exchanges
        };

        // Collection stats
        const alertStats = await mongoose.connection.db.collection('alerts').stats();
        const marketDataStats = await mongoose.connection.db.collection('marketdatas').stats();
        
        metrics.database.mongodb.collections = {
          alerts: {
            count: alertStats.count,
            size: alertStats.size,
            avgObjSize: alertStats.avgObjSize
          },
          marketData: {
            count: marketDataStats.count,
            size: marketDataStats.size,
            avgObjSize: marketDataStats.avgObjSize
          }
        };
      }
    } catch (dbError) {
      logger.warn('Failed to get database metrics:', dbError);
      metrics.database.error = dbError.message;
    }

    // Get Alert Engine metrics
    try {
      const alertEngine = global.alertEngine;
      if (alertEngine) {
        const engineMetrics = alertEngine.getMetrics();
        metrics.alertEngine = engineMetrics;
      }
    } catch (engineError) {
      logger.warn('Failed to get Alert Engine metrics:', engineError);
    }

    res.json(helpers.successResponse('System metrics retrieved successfully', {
      ...metrics,
      timestamp: new Date()
    }));

  } catch (error) {
    logger.error('Failed to get system metrics:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve system metrics'));
  }
});

/**
 * @route   GET /api/health/readiness
 * @desc    Kubernetes readiness probe
 * @access  Public
 */
router.get('/readiness', async (req, res) => {
  try {
    const checks = {
      database: false,
      alertEngine: false
    };

    // Check database connection
    if (mongoose.connection.readyState === 1) {
      try {
        await Alert.findOne().limit(1);
        checks.database = true;
      } catch (dbError) {
        logger.warn('Database readiness check failed:', dbError);
      }
    }

    // Check Alert Engine
    const alertEngine = global.alertEngine;
    if (alertEngine && alertEngine.isRunning) {
      checks.alertEngine = true;
    }

    const isReady = Object.values(checks).every(check => check === true);
    const statusCode = isReady ? 200 : 503;

    res.status(statusCode).json({
      ready: isReady,
      checks,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      ready: false,
      error: error.message,
      timestamp: new Date()
    });
  }
});

/**
 * @route   GET /api/health/liveness
 * @desc    Kubernetes liveness probe
 * @access  Public
 */
router.get('/liveness', (req, res) => {
  try {
    // Simple liveness check - if we can respond, we're alive
    res.json({
      alive: true,
      timestamp: new Date(),
      uptime: process.uptime()
    });
  } catch (error) {
    logger.error('Liveness check failed:', error);
    res.status(500).json({
      alive: false,
      error: error.message,
      timestamp: new Date()
    });
  }
});

module.exports = router;