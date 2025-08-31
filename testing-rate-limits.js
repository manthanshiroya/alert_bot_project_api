// Temporary rate limit configuration for testing
// This file provides higher rate limits to facilitate testing multiple accounts

const rateLimit = require('express-rate-limit');

// Testing rate limiters with much higher limits
const testingAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased from 5 to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const testingLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Increased from 10 to 200 login attempts per windowMs
  message: {
    success: false,
    message: 'Too many login attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const testingGeneralLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased from 100 to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  testingAuthLimiter,
  testingLoginLimiter,
  testingGeneralLimiter
};

// Instructions for use:
// 1. Backup your current auth.js and server.js files
// 2. Replace the rate limiters in auth.js with testingAuthLimiter and testingLoginLimiter
// 3. Replace the general limiter in server.js with testingGeneralLimiter
// 4. Restart your server
// 5. After testing, restore the original files for production use

// Example replacement in auth.js:
// const { testingAuthLimiter, testingLoginLimiter } = require('../testing-rate-limits');
// 
// router.post('/register', 
//   testingAuthLimiter,  // instead of authLimiter
//   sanitizeInput,
//   validateRegister,
//   handleValidationErrors,
//   authController.register
// );
//
// router.post('/login', 
//   testingLoginLimiter,  // instead of loginLimiter
//   sanitizeInput,
//   validateLogin,
//   handleValidationErrors,
//   authController.login
// );

// Example replacement in server.js:
// const { testingGeneralLimiter } = require('./testing-rate-limits');
// app.use('/api/', testingGeneralLimiter);  // instead of limiter