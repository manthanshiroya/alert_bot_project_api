const crypto = require('crypto');
const { logger } = require('./logger');

/**
 * Response helper functions
 */
const response = {
  /**
   * Send success response
   */
  success: (res, data = null, message = 'Success', statusCode = 200) => {
    const responseData = {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    
    return res.status(statusCode).json(responseData);
  },

  /**
   * Send error response
   */
  error: (res, message = 'Internal Server Error', statusCode = 500, errors = null) => {
    const responseData = {
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString()
    };
    
    return res.status(statusCode).json(responseData);
  },

  /**
   * Send paginated response
   */
  paginated: (res, data, pagination, message = 'Success') => {
    const responseData = {
      success: true,
      message,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        pages: Math.ceil(pagination.total / pagination.limit),
        hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
        hasPrev: pagination.page > 1
      },
      timestamp: new Date().toISOString()
    };
    
    return res.status(200).json(responseData);
  }
};

/**
 * Validation helper functions
 */
const validation = {
  /**
   * Validate email format
   */
  isValidEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Validate MongoDB ObjectId
   */
  isValidObjectId: (id) => {
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    return objectIdRegex.test(id);
  },

  /**
   * Validate URL format
   */
  isValidUrl: (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Validate alert condition
   */
  isValidCondition: (condition) => {
    const validOperators = ['>', '<', '>=', '<=', '==', '!=', 'crosses_above', 'crosses_below'];
    return validOperators.includes(condition);
  },

  /**
   * Validate alert type
   */
  isValidAlertType: (type) => {
    const validTypes = ['price', 'volume', 'technical', 'news', 'custom'];
    return validTypes.includes(type);
  },

  /**
   * Validate symbol format
   */
  isValidSymbol: (symbol) => {
    const symbolPattern = /^[A-Z]{2,10}(\/[A-Z]{2,10})?$/;
    return symbolRegex.test(symbol.toUpperCase());
  },

  /**
   * Validate time interval
   */
  isValidInterval: (interval) => {
    const validIntervals = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
    return validIntervals.includes(interval);
  },

  /**
   * Sanitize input string
   */
  sanitizeString: (str, maxLength = 255) => {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, maxLength).replace(/[<>"'&]/g, '');
  },

  /**
   * Validate and sanitize alert message
   */
  sanitizeAlertMessage: (message) => {
    if (typeof message !== 'string') return '';
    return message.trim().slice(0, 1000).replace(/[<>]/g, '');
  }
};

/**
 * Utility helper functions
 */
const utils = {
  /**
   * Generate random string
   */
  generateRandomString: (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
  },

  /**
   * Generate UUID v4
   */
  generateUUID: () => {
    return crypto.randomUUID();
  },

  /**
   * Hash string using SHA256
   */
  hashString: (str) => {
    return crypto.createHash('sha256').update(str).digest('hex');
  },

  /**
   * Encrypt string
   */
  encrypt: (text, key = process.env.ENCRYPTION_KEY) => {
    if (!key) throw new Error('Encryption key not provided');
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', key);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  },

  /**
   * Decrypt string
   */
  decrypt: (encryptedText, key = process.env.ENCRYPTION_KEY) => {
    if (!key) throw new Error('Encryption key not provided');
    
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  },

  /**
   * Sleep for specified milliseconds
   */
  sleep: (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Retry function with exponential backoff
   */
  retry: async (fn, maxRetries = 3, baseDelay = 1000) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, {
          error: error.message,
          attempt,
          maxRetries
        });
        
        await utils.sleep(delay);
      }
    }
    
    throw lastError;
  },

  /**
   * Debounce function
   */
  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Throttle function
   */
  throttle: (func, limit) => {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  /**
   * Deep clone object
   */
  deepClone: (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => utils.deepClone(item));
    if (typeof obj === 'object') {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = utils.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
  },

  /**
   * Check if object is empty
   */
  isEmpty: (obj) => {
    if (obj == null) return true;
    if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
    return Object.keys(obj).length === 0;
  },

  /**
   * Format number with commas
   */
  formatNumber: (num, decimals = 2) => {
    if (isNaN(num)) return '0';
    return Number(num).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  },

  /**
   * Format currency
   */
  formatCurrency: (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  },

  /**
   * Format percentage
   */
  formatPercentage: (value, decimals = 2) => {
    return `${(value * 100).toFixed(decimals)}%`;
  },

  /**
   * Calculate percentage change
   */
  calculatePercentageChange: (oldValue, newValue) => {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
  },

  /**
   * Round to specified decimal places
   */
  roundTo: (num, decimals = 2) => {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
};

/**
 * Date helper functions
 */
const dateHelpers = {
  /**
   * Get current timestamp
   */
  now: () => new Date(),

  /**
   * Get timestamp in milliseconds
   */
  nowMs: () => Date.now(),

  /**
   * Format date to ISO string
   */
  toISOString: (date = new Date()) => date.toISOString(),

  /**
   * Add time to date
   */
  addTime: (date, amount, unit = 'minutes') => {
    const newDate = new Date(date);
    switch (unit) {
      case 'seconds':
        newDate.setSeconds(newDate.getSeconds() + amount);
        break;
      case 'minutes':
        newDate.setMinutes(newDate.getMinutes() + amount);
        break;
      case 'hours':
        newDate.setHours(newDate.getHours() + amount);
        break;
      case 'days':
        newDate.setDate(newDate.getDate() + amount);
        break;
      default:
        throw new Error(`Unsupported time unit: ${unit}`);
    }
    return newDate;
  },

  /**
   * Check if date is in the past
   */
  isPast: (date) => new Date(date) < new Date(),

  /**
   * Check if date is in the future
   */
  isFuture: (date) => new Date(date) > new Date(),

  /**
   * Get time difference in milliseconds
   */
  timeDiff: (date1, date2 = new Date()) => {
    return Math.abs(new Date(date2) - new Date(date1));
  },

  /**
   * Format time duration
   */
  formatDuration: (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
};

/**
 * Alert-specific helper functions
 */
const alertHelpers = {
  /**
   * Evaluate alert condition
   */
  evaluateCondition: (currentValue, targetValue, condition) => {
    const current = parseFloat(currentValue);
    const target = parseFloat(targetValue);
    
    if (isNaN(current) || isNaN(target)) {
      throw new Error('Invalid numeric values for condition evaluation');
    }
    
    switch (condition) {
      case '>':
        return current > target;
      case '<':
        return current < target;
      case '>=':
        return current >= target;
      case '<=':
        return current <= target;
      case '==':
        return Math.abs(current - target) < 0.0001; // Handle floating point precision
      case '!=':
        return Math.abs(current - target) >= 0.0001;
      default:
        throw new Error(`Unsupported condition: ${condition}`);
    }
  },

  /**
   * Generate alert message
   */
  generateAlertMessage: (alert, currentValue, marketData = {}) => {
    const symbol = alert.symbol.toUpperCase();
    const condition = alert.condition;
    const targetValue = alert.targetValue;
    const change = marketData.change || 0;
    const changePercent = marketData.changePercent || 0;
    
    let message = `🚨 Alert Triggered for ${symbol}\n\n`;
    
    switch (alert.type) {
      case 'price':
        message += `💰 Price Alert\n`;
        message += `Current Price: $${utils.formatNumber(currentValue)}\n`;
        message += `Target: ${condition} $${utils.formatNumber(targetValue)}\n`;
        if (change !== 0) {
          const changeIcon = change > 0 ? '📈' : '📉';
          message += `24h Change: ${changeIcon} ${utils.formatCurrency(change)} (${utils.formatPercentage(changePercent / 100)})`;
        }
        break;
        
      case 'volume':
        message += `📊 Volume Alert\n`;
        message += `Current Volume: ${utils.formatNumber(currentValue)}\n`;
        message += `Target: ${condition} ${utils.formatNumber(targetValue)}`;
        break;
        
      case 'technical':
        message += `📈 Technical Alert\n`;
        message += `Indicator: ${alert.indicator || 'Custom'}\n`;
        message += `Current Value: ${utils.formatNumber(currentValue)}\n`;
        message += `Target: ${condition} ${utils.formatNumber(targetValue)}`;
        break;
        
      case 'news':
        message += `📰 News Alert\n`;
        message += `Sentiment Score: ${utils.formatNumber(currentValue)}\n`;
        message += `Target: ${condition} ${utils.formatNumber(targetValue)}`;
        break;
        
      default:
        message += `⚡ Custom Alert\n`;
        message += `Current Value: ${utils.formatNumber(currentValue)}\n`;
        message += `Target: ${condition} ${utils.formatNumber(targetValue)}`;
    }
    
    if (alert.message) {
      message += `\n\n📝 Note: ${alert.message}`;
    }
    
    message += `\n\n⏰ ${dateHelpers.toISOString()}`;
    
    return message;
  },

  /**
   * Calculate alert priority
   */
  calculatePriority: (alert, currentValue, marketData = {}) => {
    let priority = 'medium';
    
    const percentDiff = Math.abs((currentValue - alert.targetValue) / alert.targetValue) * 100;
    const volatility = marketData.volatility || 0;
    
    // High priority conditions
    if (percentDiff > 10 || volatility > 5 || alert.type === 'news') {
      priority = 'high';
    }
    // Low priority conditions
    else if (percentDiff < 1 && volatility < 1) {
      priority = 'low';
    }
    
    return priority;
  },

  /**
   * Check if alert is in cooldown
   */
  isInCooldown: (alert, cooldownPeriod = 300000) => { // 5 minutes default
    if (!alert.lastTriggered) return false;
    
    const timeSinceLastTrigger = Date.now() - new Date(alert.lastTriggered).getTime();
    return timeSinceLastTrigger < cooldownPeriod;
  },

  /**
   * Validate alert configuration
   */
  validateAlertConfig: (alertConfig) => {
    const errors = [];
    
    if (!alertConfig.symbol || !validation.isValidSymbol(alertConfig.symbol)) {
      errors.push('Invalid symbol format');
    }
    
    if (!alertConfig.type || !validation.isValidAlertType(alertConfig.type)) {
      errors.push('Invalid alert type');
    }
    
    if (!alertConfig.condition || !validation.isValidCondition(alertConfig.condition)) {
      errors.push('Invalid condition');
    }
    
    if (alertConfig.targetValue === undefined || isNaN(parseFloat(alertConfig.targetValue))) {
      errors.push('Invalid target value');
    }
    
    if (alertConfig.interval && !validation.isValidInterval(alertConfig.interval)) {
      errors.push('Invalid time interval');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

/**
 * Error handling helpers
 */
const errorHelpers = {
  /**
   * Create standardized error
   */
  createError: (message, statusCode = 500, code = null) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },

  /**
   * Handle async errors
   */
  asyncHandler: (fn) => {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  },

  /**
   * Parse error for response
   */
  parseError: (error) => {
    let statusCode = 500;
    let message = 'Internal Server Error';
    let code = null;
    
    if (error.statusCode) {
      statusCode = error.statusCode;
    }
    
    if (error.message) {
      message = error.message;
    }
    
    if (error.code) {
      code = error.code;
    }
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      statusCode = 400;
      message = 'Validation Error';
    } else if (error.name === 'CastError') {
      statusCode = 400;
      message = 'Invalid ID format';
    } else if (error.code === 11000) {
      statusCode = 409;
      message = 'Duplicate entry';
    }
    
    return { statusCode, message, code };
  }
};

module.exports = {
  response,
  validation,
  utils,
  dateHelpers,
  alertHelpers,
  errorHelpers
};