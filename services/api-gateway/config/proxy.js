const { createProxyMiddleware } = require('http-proxy-middleware');
const logger = require('../../../shared/utils/logger');
const environmentConfig = require('../../../shared/config/environment');

class ProxyConfig {
  constructor() {
    this.defaultTimeout = 30000; // 30 seconds
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
  }

  // Create proxy options for a route
  createProxyOptions(route) {
    const baseOptions = {
      target: route.target,
      changeOrigin: true,
      timeout: route.timeout || this.defaultTimeout,
      proxyTimeout: route.proxyTimeout || this.defaultTimeout,
      
      // Logging
      logLevel: environmentConfig.get('NODE_ENV') === 'development' ? 'debug' : 'warn',
      logProvider: () => logger,

      // Headers
      onProxyReq: this.onProxyRequest.bind(this),
      onProxyRes: this.onProxyResponse.bind(this),
      onError: this.onProxyError.bind(this),

      // Path rewriting (if needed)
      pathRewrite: route.pathRewrite || {},

      // Router function for dynamic routing
      router: route.router || undefined,

      // Security
      secure: environmentConfig.get('NODE_ENV') === 'production',
      
      // Keep alive
      agent: undefined, // Use default agent
      
      // Custom headers
      headers: {
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': environmentConfig.get('API_GATEWAY_HOST') || 'localhost',
        'X-Gateway-Service': 'alert-bot-api-gateway',
        'X-Gateway-Version': '1.0.0'
      }
    };

    // Add route-specific options
    if (route.options) {
      Object.assign(baseOptions, route.options);
    }

    return baseOptions;
  }

  // Handle proxy request
  onProxyRequest(proxyReq, req, res) {
    try {
      // Add request ID to headers
      if (req.id) {
        proxyReq.setHeader('X-Request-ID', req.id);
      }

      // Add user information to headers
      if (req.user) {
        proxyReq.setHeader('X-User-ID', req.user.id);
        proxyReq.setHeader('X-User-Role', req.user.role);
        proxyReq.setHeader('X-User-Subscription', req.user.subscriptionPlan || 'free');
        
        if (req.user.telegramId) {
          proxyReq.setHeader('X-Telegram-ID', req.user.telegramId);
        }
      }

      // Add API key information
      if (req.apiKey) {
        proxyReq.setHeader('X-API-Key-Type', req.apiKey.type);
      }

      // Add rate limit information
      if (req.rateLimits) {
        proxyReq.setHeader('X-Rate-Limit-Max', req.rateLimits.requests);
        proxyReq.setHeader('X-Rate-Limit-Window', req.rateLimits.window);
      }

      // Add subscription limits
      if (req.subscriptionLimits) {
        proxyReq.setHeader('X-Subscription-Max-Alerts', req.subscriptionLimits.maxAlerts);
        proxyReq.setHeader('X-Subscription-Plan', req.subscriptionLimits.plan);
      }

      // Add client IP
      proxyReq.setHeader('X-Real-IP', req.ip);
      proxyReq.setHeader('X-Forwarded-For', req.ip);

      // Log proxy request
      logger.logServiceCall({
        direction: 'outbound',
        service: this.getServiceNameFromTarget(proxyReq.host),
        method: req.method,
        path: req.path,
        target: `${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`,
        userId: req.user?.id,
        requestId: req.id,
        headers: this.sanitizeHeaders(proxyReq.getHeaders())
      });

      // Handle request body for POST/PUT requests
      if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    } catch (error) {
      logger.logError(error, {
        context: 'proxy_request_handler',
        method: req.method,
        path: req.path,
        target: proxyReq.host
      });
    }
  }

  // Handle proxy response
  onProxyResponse(proxyRes, req, res) {
    try {
      // Add response headers
      res.setHeader('X-Gateway-Service', 'alert-bot-api-gateway');
      res.setHeader('X-Response-Time', Date.now() - req.startTime);
      
      if (req.id) {
        res.setHeader('X-Request-ID', req.id);
      }

      // Log proxy response
      logger.logServiceCall({
        direction: 'inbound',
        service: this.getServiceNameFromTarget(proxyRes.req.host),
        method: req.method,
        path: req.path,
        statusCode: proxyRes.statusCode,
        responseTime: Date.now() - (req.startTime || Date.now()),
        userId: req.user?.id,
        requestId: req.id,
        contentLength: proxyRes.headers['content-length']
      });

      // Handle specific status codes
      if (proxyRes.statusCode >= 400) {
        logger.warn('Proxy response error', {
          statusCode: proxyRes.statusCode,
          method: req.method,
          path: req.path,
          service: this.getServiceNameFromTarget(proxyRes.req.host),
          userId: req.user?.id,
          requestId: req.id
        });
      }

      // Monitor slow responses
      const responseTime = Date.now() - (req.startTime || Date.now());
      if (responseTime > 5000) { // 5 seconds
        logger.warn('Slow proxy response detected', {
          responseTime,
          method: req.method,
          path: req.path,
          service: this.getServiceNameFromTarget(proxyRes.req.host),
          userId: req.user?.id,
          requestId: req.id
        });
      }
    } catch (error) {
      logger.logError(error, {
        context: 'proxy_response_handler',
        method: req.method,
        path: req.path,
        statusCode: proxyRes.statusCode
      });
    }
  }

  // Handle proxy errors
  onProxyError(err, req, res) {
    try {
      logger.logError(err, {
        context: 'proxy_error',
        method: req.method,
        path: req.path,
        target: req.url,
        userId: req.user?.id,
        requestId: req.id,
        errorCode: err.code,
        errorMessage: err.message
      });

      // Determine appropriate error response
      let statusCode = 500;
      let errorMessage = 'Service temporarily unavailable';
      let errorCode = 'SERVICE_ERROR';

      switch (err.code) {
        case 'ECONNREFUSED':
          statusCode = 503;
          errorMessage = 'Service unavailable';
          errorCode = 'SERVICE_UNAVAILABLE';
          break;
        case 'ETIMEDOUT':
        case 'ESOCKETTIMEDOUT':
          statusCode = 504;
          errorMessage = 'Service timeout';
          errorCode = 'SERVICE_TIMEOUT';
          break;
        case 'ENOTFOUND':
          statusCode = 502;
          errorMessage = 'Service not found';
          errorCode = 'SERVICE_NOT_FOUND';
          break;
        case 'ECONNRESET':
          statusCode = 502;
          errorMessage = 'Connection reset by service';
          errorCode = 'CONNECTION_RESET';
          break;
        default:
          statusCode = 502;
          errorMessage = 'Bad gateway';
          errorCode = 'BAD_GATEWAY';
      }

      // Send error response if not already sent
      if (!res.headersSent) {
        res.status(statusCode).json({
          success: false,
          error: errorMessage,
          code: errorCode,
          requestId: req.id,
          timestamp: new Date().toISOString(),
          service: this.getServiceNameFromPath(req.path)
        });
      }
    } catch (handlingError) {
      logger.logError(handlingError, {
        context: 'proxy_error_handler',
        originalError: err.message
      });

      // Fallback error response
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  // Get service name from target host
  getServiceNameFromTarget(host) {
    if (!host) return 'unknown';
    
    if (host.includes('3001')) return 'subscription-service';
    if (host.includes('3002')) return 'telegram-service';
    if (host.includes('3003')) return 'alert-engine';
    
    return 'unknown';
  }

  // Get service name from request path
  getServiceNameFromPath(path) {
    if (path.startsWith('/api/users') || path.startsWith('/api/subscriptions') || path.startsWith('/api/plans')) {
      return 'subscription-service';
    }
    if (path.startsWith('/api/telegram') || path.startsWith('/api/notifications')) {
      return 'telegram-service';
    }
    if (path.startsWith('/api/alerts') || path.startsWith('/api/charts') || path.startsWith('/api/conditions')) {
      return 'alert-engine';
    }
    
    return 'api-gateway';
  }

  // Sanitize headers for logging (remove sensitive information)
  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    
    // Remove sensitive headers
    delete sanitized.authorization;
    delete sanitized['x-api-key'];
    delete sanitized.cookie;
    delete sanitized['set-cookie'];
    
    return sanitized;
  }

  // Create retry proxy middleware
  createRetryProxy(route) {
    let attempts = 0;
    
    const retryProxy = createProxyMiddleware({
      ...this.createProxyOptions(route),
      onError: (err, req, res) => {
        attempts++;
        
        if (attempts < this.retryAttempts && this.shouldRetry(err)) {
          logger.warn(`Retrying proxy request (attempt ${attempts}/${this.retryAttempts})`, {
            method: req.method,
            path: req.path,
            error: err.message,
            requestId: req.id
          });
          
          // Retry after delay
          setTimeout(() => {
            retryProxy(req, res);
          }, this.retryDelay * attempts);
        } else {
          // Max retries reached or non-retryable error
          this.onProxyError(err, req, res);
        }
      }
    });
    
    return retryProxy;
  }

  // Determine if error should trigger a retry
  shouldRetry(err) {
    const retryableCodes = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ESOCKETTIMEDOUT',
      'ECONNRESET'
    ];
    
    return retryableCodes.includes(err.code);
  }

  // Create circuit breaker proxy (for future implementation)
  createCircuitBreakerProxy(route) {
    // This would implement circuit breaker pattern
    // For now, return standard proxy
    return createProxyMiddleware(this.createProxyOptions(route));
  }

  // Create load balancer proxy (for future implementation)
  createLoadBalancerProxy(route) {
    // This would implement load balancing between multiple service instances
    // For now, return standard proxy
    return createProxyMiddleware(this.createProxyOptions(route));
  }

  // Health check proxy targets
  async checkTargetHealth(target) {
    try {
      const axios = require('axios');
      const response = await axios.get(`${target}/health`, {
        timeout: 5000,
        validateStatus: (status) => status < 500
      });
      
      return {
        healthy: response.status === 200,
        status: response.status,
        responseTime: response.headers['x-response-time'] || 'unknown',
        data: response.data
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        code: error.code
      };
    }
  }

  // Get proxy statistics
  getProxyStats() {
    // This would return proxy statistics
    // Implementation would depend on monitoring requirements
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      serviceHealth: {}
    };
  }
}

// Export singleton instance
module.exports = new ProxyConfig();