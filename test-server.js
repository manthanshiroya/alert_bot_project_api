console.log('Test server starting...');

try {
  console.log('Loading express...');
  const express = require('express');
  console.log('Express loaded successfully');
  
  console.log('Loading path...');
  const path = require('path');
  console.log('Path loaded successfully');
  
  console.log('Loading helmet...');
  const helmet = require('helmet');
  console.log('Helmet loaded successfully');
  
  console.log('Loading cors...');
  const cors = require('cors');
  console.log('CORS loaded successfully');
  
  console.log('Loading compression...');
  const compression = require('compression');
  console.log('Compression loaded successfully');
  
  console.log('Loading rate limiter...');
  const rateLimit = require('express-rate-limit');
  console.log('Rate limiter loaded successfully');
  
  console.log('Loading config files...');
  const connectDB = require('./src/config/database');
  console.log('Database config loaded');
  
  const connectRedis = require('./src/config/redis');
  console.log('Redis config loaded');
  
  const logger = require('./src/config/logger');
  console.log('Logger config loaded');
  
  console.log('Loading routes...');
  const authRoutes = require('./src/routes/auth');
  console.log('Auth routes loaded');
  
  const userRoutes = require('./src/routes/users');
  console.log('User routes loaded');
  
  const alertRoutes = require('./src/routes/alerts');
  console.log('Alert routes loaded');
  
  const subscriptionRoutes = require('./src/routes/subscriptions');
  console.log('Subscription routes loaded');
  
  const webhookRoutes = require('./src/routes/webhooks');
  console.log('Webhook routes loaded');
  
  const adminRoutes = require('./src/routes/admin');
  console.log('Admin routes loaded');
  
  console.log('Loading middleware...');
  const errorHandler = require('./src/middleware/errorHandler');
  console.log('Error handler loaded');
  
  const { requestLogger } = require('./src/middleware/requestLogger');
  console.log('Request logger loaded');
  
  console.log('All modules loaded successfully!');
  
  const app = express();
  console.log('Express app created');
  
  const PORT = process.env.PORT || 3000;
  console.log('Port set to:', PORT);
  
  console.log('Test completed successfully!');
  
} catch (error) {
  console.error('Error during module loading:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}