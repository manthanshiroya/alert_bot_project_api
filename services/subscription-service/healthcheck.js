const http = require('http');
const process = require('process');

/**
 * Health check script for Docker container
 * Checks if the subscription service is responding to requests
 */

const options = {
  hostname: process.env.HOST || 'localhost',
  port: process.env.SUBSCRIPTION_SERVICE_PORT || process.env.PORT || 3002,
  path: '/health',
  method: 'GET',
  timeout: 3000,
  headers: {
    'User-Agent': 'Docker-Health-Check/1.0',
    'Accept': 'application/json'
  }
};

const request = http.request(options, (response) => {
  let data = '';
  
  response.on('data', (chunk) => {
    data += chunk;
  });
  
  response.on('end', () => {
    try {
      const healthData = JSON.parse(data);
      
      if (response.statusCode === 200 && healthData.status === 'healthy') {
        console.log('✅ Health check passed:', {
          status: healthData.status,
          service: healthData.service,
          timestamp: healthData.timestamp,
          uptime: healthData.uptime
        });
        process.exit(0);
      } else {
        console.error('❌ Health check failed:', {
          statusCode: response.statusCode,
          status: healthData.status || 'unknown',
          response: data
        });
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Health check failed - Invalid JSON response:', {
        error: error.message,
        response: data,
        statusCode: response.statusCode
      });
      process.exit(1);
    }
  });
});

request.on('error', (error) => {
  console.error('❌ Health check failed - Request error:', {
    error: error.message,
    code: error.code,
    hostname: options.hostname,
    port: options.port,
    path: options.path
  });
  process.exit(1);
});

request.on('timeout', () => {
  console.error('❌ Health check failed - Request timeout:', {
    timeout: options.timeout,
    hostname: options.hostname,
    port: options.port,
    path: options.path
  });
  request.destroy();
  process.exit(1);
});

// Set request timeout
request.setTimeout(options.timeout);

// Send the request
request.end();

// Handle process signals
process.on('SIGTERM', () => {
  console.log('Health check received SIGTERM, exiting...');
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('Health check received SIGINT, exiting...');
  process.exit(1);
});

// Fallback timeout
setTimeout(() => {
  console.error('❌ Health check failed - Overall timeout exceeded');
  process.exit(1);
}, 5000);