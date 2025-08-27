const http = require('http');
const { URL } = require('url');

// Configuration
const HEALTH_CHECK_URL = process.env.HEALTH_CHECK_URL || 'http://localhost:3003/health';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000;
const MAX_RETRIES = parseInt(process.env.HEALTH_CHECK_RETRIES) || 3;
const RETRY_DELAY = parseInt(process.env.HEALTH_CHECK_RETRY_DELAY) || 1000;

/**
 * Perform health check with retry logic
 */
const performHealthCheck = (url, timeout = TIMEOUT) => {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'GET',
      timeout: timeout,
      headers: {
        'User-Agent': 'HealthCheck/1.0',
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          };
          
          if (res.statusCode === 200) {
            try {
              const healthData = JSON.parse(data);
              resolve({
                success: true,
                statusCode: res.statusCode,
                data: healthData,
                timestamp: new Date().toISOString()
              });
            } catch (parseError) {
              resolve({
                success: true,
                statusCode: res.statusCode,
                data: { status: 'healthy', raw: data },
                timestamp: new Date().toISOString()
              });
            }
          } else {
            reject(new Error(`Health check failed with status ${res.statusCode}: ${data}`));
          }
        } catch (error) {
          reject(new Error(`Error processing health check response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Health check request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Health check timed out after ${timeout}ms`));
    });

    req.end();
  });
};

/**
 * Sleep function for retry delays
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Main health check function with retry logic
 */
const healthCheck = async () => {
  const startTime = Date.now();
  let lastError;
  
  console.log(`Starting health check for ${HEALTH_CHECK_URL}`);
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Health check attempt ${attempt}/${MAX_RETRIES}`);
      
      const result = await performHealthCheck(HEALTH_CHECK_URL, TIMEOUT);
      const duration = Date.now() - startTime;
      
      console.log('✅ Health check passed');
      console.log(`📊 Status: ${result.data.status}`);
      console.log(`⏱️  Duration: ${duration}ms`);
      console.log(`🔄 Attempts: ${attempt}/${MAX_RETRIES}`);
      
      if (result.data.service) {
        console.log(`🏷️  Service: ${result.data.service}`);
      }
      
      if (result.data.version) {
        console.log(`📦 Version: ${result.data.version}`);
      }
      
      if (result.data.uptime) {
        console.log(`⏰ Uptime: ${Math.floor(result.data.uptime)}s`);
      }
      
      if (result.data.database) {
        console.log(`💾 Database: ${result.data.database.status}`);
      }
      
      if (result.data.memory) {
        console.log(`🧠 Memory: ${result.data.memory.used}/${result.data.memory.total}`);
      }
      
      // Exit with success
      process.exit(0);
      
    } catch (error) {
      lastError = error;
      console.log(`❌ Health check attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < MAX_RETRIES) {
        console.log(`⏳ Retrying in ${RETRY_DELAY}ms...`);
        await sleep(RETRY_DELAY);
      }
    }
  }
  
  // All attempts failed
  const duration = Date.now() - startTime;
  console.log('💥 Health check failed after all attempts');
  console.log(`⏱️  Total duration: ${duration}ms`);
  console.log(`🔄 Total attempts: ${MAX_RETRIES}`);
  console.log(`❌ Last error: ${lastError.message}`);
  
  // Exit with failure
  process.exit(1);
};

/**
 * Enhanced health check with additional validations
 */
const enhancedHealthCheck = async () => {
  console.log('🔍 Starting enhanced health check...');
  
  try {
    // Basic health check
    await healthCheck();
    
  } catch (error) {
    console.log('💥 Enhanced health check failed');
    console.log(`❌ Error: ${error.message}`);
    process.exit(1);
  }
};

/**
 * Validate environment and configuration
 */
const validateEnvironment = () => {
  console.log('🔧 Validating environment...');
  
  const requiredEnvVars = [
    'NODE_ENV'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.log(`⚠️  Warning: Missing environment variables: ${missingVars.join(', ')}`);
  }
  
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'unknown'}`);
  console.log(`🔗 Health check URL: ${HEALTH_CHECK_URL}`);
  console.log(`⏱️  Timeout: ${TIMEOUT}ms`);
  console.log(`🔄 Max retries: ${MAX_RETRIES}`);
  console.log(`⏳ Retry delay: ${RETRY_DELAY}ms`);
};

/**
 * Handle process signals
 */
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, exiting health check');
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, exiting health check');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.log('💥 Uncaught exception in health check:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.log('💥 Unhandled rejection in health check:', reason);
  process.exit(1);
});

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const enhanced = args.includes('--enhanced') || args.includes('-e');
  const validate = args.includes('--validate') || args.includes('-v');
  
  if (validate) {
    validateEnvironment();
  }
  
  if (enhanced) {
    enhancedHealthCheck();
  } else {
    healthCheck();
  }
}

module.exports = {
  performHealthCheck,
  healthCheck,
  enhancedHealthCheck,
  validateEnvironment
};