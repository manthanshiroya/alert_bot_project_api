console.log('🚀 Server.js starting...');

console.log('Loading express...');
const express = require('express');
console.log('Loading path...');
const path = require('path');
console.log('Loading helmet...');
const helmet = require('helmet');
console.log('Loading cors...');
const cors = require('cors');
console.log('Loading compression...');
const compression = require('compression');
console.log('Loading rate limit...');
const rateLimit = require('express-rate-limit');
console.log('Basic modules loaded successfully');

console.log('Loading dotenv...');
const dotenv = require('dotenv');
console.log('Dotenv loaded successfully');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import database connections
console.log('Loading database config...');
const { connectDB } = require('./config/database');
console.log('Database config loaded');

console.log('Loading redis config...');
const { connectRedis } = require('./config/redis');
console.log('Redis config loaded');

console.log('Loading logger config...');
const logger = require('./utils/logger');
console.log('Logger config loaded');

// Import routes
console.log('Loading auth routes...');
const authRoutes = require('./routes/auth');
console.log('Auth routes loaded');

console.log('Loading user routes...');
const userRoutes = require('./routes/users');
console.log('User routes loaded');

console.log('Loading alert routes...');
const alertRoutes = require('./routes/alerts');
console.log('Alert routes loaded');

console.log('Loading subscription routes...');
const subscriptionRoutes = require('./routes/subscriptions');
console.log('Subscription routes loaded');

console.log('Loading webhook routes...');
const webhookRoutes = require('./routes/webhooks');
console.log('Webhook routes loaded');

console.log('Loading admin routes...');
const adminRoutes = require('./routes/admin');
console.log('Admin routes loaded');

console.log('Loading admin auth routes...');
const adminAuthRoutes = require('./routes/adminAuth');
console.log('Admin auth routes loaded');

console.log('Loading telegram routes...');
const telegramRoutes = require('./routes/telegram');
console.log('Telegram routes loaded');

console.log('Loading payment routes...');
const paymentRoutes = require('./routes/payments');
console.log('Payment routes loaded');

// Import middleware
console.log('Loading error handler middleware...');
const { errorHandler, notFound } = require('./middleware/errorHandler');
console.log('Error handler loaded');

console.log('Loading request logger middleware...');
const { requestLogger } = require('./middleware/requestLogger');
console.log('Request logger loaded');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Webhook rate limiting (more permissive for TradingView)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // limit each IP to 1000 requests per minute for webhooks
  message: {
    error: 'Webhook rate limit exceeded.',
  },
});
app.use('/api/webhooks/', webhookLimiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Compression middleware
app.use(compression());

// Request logging
app.use(requestLogger);

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Swagger Documentation
const { swaggerUi, specs } = require('./config/swagger');

/**
 * @swagger
 * /:
 *   get:
 *     summary: API Root endpoint
 *     description: Welcome message and basic API information
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Welcome message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Welcome to TradingView Alert Bot API"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 documentation:
 *                   type: string
 *                   example: "/api/docs"
 */

// Swagger UI setup
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'TradingView Alert Bot API',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true
  }
}));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin', adminAuthRoutes); // Admin authentication routes
app.use('/api/admin', adminRoutes); // Admin management routes
app.use('/api/telegram', telegramRoutes);
app.use('/api/payments', paymentRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'TradingView Alert Distribution System API',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/health',
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The requested route ${req.originalUrl} does not exist.`,
  });
});

// Global error handler
app.use(errorHandler);

// Global server reference for graceful shutdown
let server;

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  if (server) {
    server.close(() => {
      logger.info('Process terminated');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  if (server) {
    server.close(() => {
      logger.info('Process terminated');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Start server function
async function startServer() {
  try {
    console.log('🚀 Starting server...');
    
    // Connect to databases (optional in development)
    console.log('📡 Connecting to databases...');
    const dbConnection = await connectDB();
    const redisConnection = await connectRedis();
    
    if (dbConnection) {
      logger.info('✅ Database connection established');
    } else {
      logger.warn('⚠️  Running without database connection');
    }
    
    if (redisConnection) {
      logger.info('✅ Redis connection established');
    } else {
      logger.warn('⚠️  Running without Redis connection');
    }
    
    // Initialize Telegram Bot (if token is provided)
    if (process.env.TELEGRAM_BOT_TOKEN) {
      try {
        console.log('🤖 Initializing Telegram bot...');
        const telegramBot = require('./services/telegramBot');
        await telegramBot.initialize();
        logger.info('✅ Telegram bot initialized successfully');
      } catch (error) {
        logger.error('❌ Failed to initialize Telegram bot:', error.message);
        logger.warn('⚠️  Server will continue without Telegram bot');
      }
    } else {
      logger.warn('⚠️  TELEGRAM_BOT_TOKEN not provided, Telegram bot disabled');
    }
    
    // Start HTTP server
    server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
      logger.info(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
    });
    
    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
console.log('🔍 Checking if file is run directly...');
console.log('require.main:', require.main);
console.log('module:', module);
console.log('require.main === module:', require.main === module);

if (require.main === module) {
  console.log('✅ File is run directly, starting server...');
  startServer();
} else {
  console.log('❌ File is being imported, not starting server');
}

module.exports = { app, startServer };