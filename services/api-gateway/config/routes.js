const { AuthMiddleware, ValidationMiddleware, RateLimiter } = require('../../../shared/middleware');
const environmentConfig = require('../../../shared/config/environment');
const logger = require('../../../shared/utils/logger');

class RouteConfig {
  constructor() {
    this.serviceUrls = {
      subscriptionService: environmentConfig.get('SUBSCRIPTION_SERVICE_URL') || 'http://localhost:3001',
      telegramService: environmentConfig.get('TELEGRAM_SERVICE_URL') || 'http://localhost:3002',
      alertEngine: environmentConfig.get('ALERT_ENGINE_URL') || 'http://localhost:3003'
    };
  }

  // Get proxy routes configuration
  getProxyRoutes() {
    return [
      // Subscription Service Routes
      {
        path: '/api/users',
        target: this.serviceUrls.subscriptionService,
        middleware: [
          AuthMiddleware.authenticate(),
          AuthMiddleware.requireActiveUser(),
          RateLimiter.api()
        ],
        description: 'User management endpoints'
      },
      {
        path: '/api/subscriptions',
        target: this.serviceUrls.subscriptionService,
        middleware: [
          AuthMiddleware.authenticate(),
          AuthMiddleware.requireActiveUser(),
          RateLimiter.api()
        ],
        description: 'Subscription management endpoints'
      },
      {
        path: '/api/plans',
        target: this.serviceUrls.subscriptionService,
        middleware: [
          RateLimiter.api()
        ],
        description: 'Subscription plans endpoints (public)'
      },

      // Telegram Service Routes
      {
        path: '/api/telegram',
        target: this.serviceUrls.telegramService,
        middleware: [
          AuthMiddleware.authenticate(),
          AuthMiddleware.requireActiveUser(),
          RateLimiter.telegramMessage()
        ],
        description: 'Telegram bot interaction endpoints'
      },
      {
        path: '/api/notifications',
        target: this.serviceUrls.telegramService,
        middleware: [
          AuthMiddleware.authenticate(),
          AuthMiddleware.requireActiveUser(),
          RateLimiter.api()
        ],
        description: 'Notification management endpoints'
      },

      // Alert Engine Routes
      {
        path: '/api/alerts',
        target: this.serviceUrls.alertEngine,
        middleware: [
          AuthMiddleware.authenticate(),
          AuthMiddleware.requireActiveUser(),
          RateLimiter.alertCreation(),
          ValidationMiddleware.validateBusinessRules()
        ],
        description: 'Alert condition management endpoints'
      },
      {
        path: '/api/charts',
        target: this.serviceUrls.alertEngine,
        middleware: [
          AuthMiddleware.authenticate(),
          AuthMiddleware.requireActiveUser(),
          RateLimiter.api()
        ],
        description: 'Chart management endpoints'
      },
      {
        path: '/api/conditions',
        target: this.serviceUrls.alertEngine,
        middleware: [
          AuthMiddleware.authenticate(),
          AuthMiddleware.requireActiveUser(),
          RateLimiter.api()
        ],
        description: 'Alert condition templates endpoints'
      },

      // Analytics and Reporting (Alert Engine)
      {
        path: '/api/analytics',
        target: this.serviceUrls.alertEngine,
        middleware: [
          AuthMiddleware.authenticate(),
          AuthMiddleware.requireActiveUser(),
          RateLimiter.api()
        ],
        description: 'Analytics and reporting endpoints'
      },

      // File Upload (Subscription Service)
      {
        path: '/api/upload',
        target: this.serviceUrls.subscriptionService,
        middleware: [
          AuthMiddleware.authenticate(),
          AuthMiddleware.requireActiveUser(),
          RateLimiter.upload()
        ],
        description: 'File upload endpoints'
      }
    ];
  }

  // Get direct routes (handled by API Gateway)
  getDirectRoutes() {
    return [
      {
        path: '/api/auth/*',
        description: 'Authentication endpoints (login, register, refresh)'
      },
      {
        path: '/api/admin/*',
        description: 'Admin management endpoints'
      },
      {
        path: '/api/webhooks/*',
        description: 'Webhook endpoints (TradingView, external services)'
      },
      {
        path: '/api/gateway/*',
        description: 'API Gateway information and health endpoints'
      },
      {
        path: '/health',
        description: 'Health check endpoint'
      },
      {
        path: '/health/detailed',
        description: 'Detailed health check endpoint'
      },
      {
        path: '/api/docs',
        description: 'API documentation (Swagger UI)'
      }
    ];
  }

  // Get route information for documentation
  getRouteInfo() {
    return {
      proxyRoutes: this.getProxyRoutes().map(route => ({
        path: route.path,
        target: route.target,
        description: route.description,
        middlewareCount: route.middleware ? route.middleware.length : 0
      })),
      directRoutes: this.getDirectRoutes(),
      serviceUrls: this.serviceUrls
    };
  }

  // Get service health check endpoints
  getServiceHealthChecks() {
    return [
      {
        name: 'subscription-service',
        url: `${this.serviceUrls.subscriptionService}/health`,
        timeout: 5000
      },
      {
        name: 'telegram-service',
        url: `${this.serviceUrls.telegramService}/health`,
        timeout: 5000
      },
      {
        name: 'alert-engine',
        url: `${this.serviceUrls.alertEngine}/health`,
        timeout: 5000
      }
    ];
  }

  // Get route by path
  getRouteByPath(path) {
    const proxyRoutes = this.getProxyRoutes();
    return proxyRoutes.find(route => path.startsWith(route.path));
  }

  // Check if path is a direct route
  isDirectRoute(path) {
    const directRoutes = this.getDirectRoutes();
    return directRoutes.some(route => {
      const routePath = route.path.replace('/*', '');
      return path.startsWith(routePath);
    });
  }

  // Get middleware for specific route
  getRouteMiddleware(path) {
    const route = this.getRouteByPath(path);
    return route ? route.middleware || [] : [];
  }

  // Validate service URLs
  validateServiceUrls() {
    const errors = [];
    
    Object.entries(this.serviceUrls).forEach(([service, url]) => {
      try {
        new URL(url);
      } catch (error) {
        errors.push(`Invalid URL for ${service}: ${url}`);
      }
    });

    if (errors.length > 0) {
      logger.logError(new Error('Service URL validation failed'), {
        context: 'route_config_validation',
        errors
      });
      throw new Error(`Service URL validation failed: ${errors.join(', ')}`);
    }

    return true;
  }

  // Update service URL (for dynamic configuration)
  updateServiceUrl(service, url) {
    if (!this.serviceUrls.hasOwnProperty(service)) {
      throw new Error(`Unknown service: ${service}`);
    }

    try {
      new URL(url); // Validate URL
      this.serviceUrls[service] = url;
      
      logger.info('Service URL updated', {
        service,
        newUrl: url
      });
      
      return true;
    } catch (error) {
      throw new Error(`Invalid URL for ${service}: ${url}`);
    }
  }

  // Get load balancing configuration (for future use)
  getLoadBalancingConfig() {
    return {
      strategy: 'round-robin', // round-robin, least-connections, ip-hash
      healthCheck: {
        enabled: true,
        interval: 30000, // 30 seconds
        timeout: 5000, // 5 seconds
        retries: 3
      },
      failover: {
        enabled: true,
        maxRetries: 3,
        retryDelay: 1000 // 1 second
      }
    };
  }

  // Get circuit breaker configuration (for future use)
  getCircuitBreakerConfig() {
    return {
      enabled: true,
      threshold: 5, // Number of failures before opening circuit
      timeout: 60000, // 1 minute timeout
      resetTimeout: 30000, // 30 seconds before trying to close circuit
      monitoringPeriod: 10000 // 10 seconds monitoring window
    };
  }

  // Get rate limiting configuration by route
  getRateLimitConfig(path) {
    const routeConfigs = {
      '/api/auth': {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // 5 attempts
        skipSuccessfulRequests: true
      },
      '/api/webhooks': {
        windowMs: 60 * 1000, // 1 minute
        max: 60 // 60 requests
      },
      '/api/alerts': {
        windowMs: 24 * 60 * 60 * 1000, // 24 hours
        max: 100 // Based on subscription
      },
      '/api/upload': {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10 // 10 uploads
      },
      default: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // 100 requests
      }
    };

    // Find matching route config
    for (const [routePath, config] of Object.entries(routeConfigs)) {
      if (routePath !== 'default' && path.startsWith(routePath)) {
        return config;
      }
    }

    return routeConfigs.default;
  }

  // Get CORS configuration by route
  getCorsConfig(path) {
    const corsConfigs = {
      '/api/webhooks': {
        origin: false, // No CORS for webhooks
        credentials: false
      },
      '/api/auth': {
        origin: environmentConfig.get('CORS_ORIGINS') || ['http://localhost:3000'],
        credentials: true
      },
      default: {
        origin: environmentConfig.get('CORS_ORIGINS') || ['http://localhost:3000'],
        credentials: true
      }
    };

    // Find matching CORS config
    for (const [routePath, config] of Object.entries(corsConfigs)) {
      if (routePath !== 'default' && path.startsWith(routePath)) {
        return config;
      }
    }

    return corsConfigs.default;
  }
}

// Export singleton instance
module.exports = new RouteConfig();