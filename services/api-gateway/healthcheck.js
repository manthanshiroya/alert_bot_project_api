const http = require('http');
const environmentConfig = require('../../shared/config/environment');

// Health check configuration
const HEALTH_CHECK_TIMEOUT = 3000; // 3 seconds
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

/**
 * Perform health check by making HTTP request to health endpoint
 */
function performHealthCheck() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/health',
      method: 'GET',
      timeout: HEALTH_CHECK_TIMEOUT,
      headers: {
        'User-Agent': 'Docker-Health-Check/1.0'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const response = JSON.parse(data);
            
            // Check if response indicates healthy status
            if (response.status === 'healthy' || response.success === true) {
              console.log('✅ Health check passed:', {
                status: res.statusCode,
                response: response.status || 'healthy',
                timestamp: new Date().toISOString()
              });
              resolve({
                healthy: true,
                status: res.statusCode,
                response
              });
            } else {
              console.log('❌ Health check failed - unhealthy response:', {
                status: res.statusCode,
                response,
                timestamp: new Date().toISOString()
              });
              reject(new Error(`Service reported unhealthy status: ${JSON.stringify(response)}`));
            }
          } else {
            console.log('❌ Health check failed - bad status code:', {
              status: res.statusCode,
              data,
              timestamp: new Date().toISOString()
            });
            reject(new Error(`Health check returned status ${res.statusCode}: ${data}`));
          }
        } catch (parseError) {
          console.log('❌ Health check failed - invalid JSON response:', {
            status: res.statusCode,
            data,
            error: parseError.message,
            timestamp: new Date().toISOString()
          });
          reject(new Error(`Invalid JSON response: ${parseError.message}`));
        }
      });
    });

    req.on('error', (error) => {
      console.log('❌ Health check failed - request error:', {
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString()
      });
      reject(error);
    });

    req.on('timeout', () => {
      console.log('❌ Health check failed - timeout:', {
        timeout: HEALTH_CHECK_TIMEOUT,
        timestamp: new Date().toISOString()
      });
      req.destroy();
      reject(new Error(`Health check timed out after ${HEALTH_CHECK_TIMEOUT}ms`));
    });

    req.setTimeout(HEALTH_CHECK_TIMEOUT);
    req.end();
  });
}

/**
 * Additional checks for critical dependencies
 */
async function performExtendedHealthCheck() {
  const checks = {
    server: false,
    environment: false,
    memory: false
  };

  try {
    // Check if server is responding
    await performHealthCheck();
    checks.server = true;
  } catch (error) {
    console.log('Server health check failed:', error.message);
  }

  try {
    // Check environment configuration
    const nodeEnv = process.env.NODE_ENV;
    const requiredEnvVars = ['NODE_ENV', 'PORT'];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length === 0) {
      checks.environment = true;
    } else {
      console.log('Missing environment variables:', missingVars);
    }
  } catch (error) {
    console.log('Environment check failed:', error.message);
  }

  try {
    // Check memory usage
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };

    // Check if memory usage is reasonable (less than 512MB RSS)
    if (memUsageMB.rss < 512) {
      checks.memory = true;
    } else {
      console.log('High memory usage detected:', memUsageMB);
    }
  } catch (error) {
    console.log('Memory check failed:', error.message);
  }

  return checks;
}

/**
 * Main health check function
 */
async function main() {
  console.log('🔍 Starting health check...', {
    timestamp: new Date().toISOString(),
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform
  });

  try {
    // Perform basic health check
    const result = await performHealthCheck();
    
    // Perform extended checks
    const extendedChecks = await performExtendedHealthCheck();
    
    // Determine overall health
    const allChecksPass = Object.values(extendedChecks).every(check => check === true);
    
    if (allChecksPass) {
      console.log('✅ All health checks passed');
      process.exit(0); // Success
    } else {
      console.log('⚠️ Some health checks failed:', extendedChecks);
      process.exit(1); // Failure
    }
  } catch (error) {
    console.log('❌ Health check failed:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    process.exit(1); // Failure
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.log('❌ Uncaught exception in health check:', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.log('❌ Unhandled rejection in health check:', {
    reason: reason?.message || reason,
    promise,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});

// Set timeout for entire health check process
setTimeout(() => {
  console.log('❌ Health check process timed out');
  process.exit(1);
}, HEALTH_CHECK_TIMEOUT + 1000); // Give extra time for cleanup

// Run health check
main();