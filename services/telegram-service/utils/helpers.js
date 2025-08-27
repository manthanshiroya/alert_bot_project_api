const crypto = require('crypto');
const logger = require('./logger');

/**
 * Generate a random string of specified length
 */
const generateRandomString = (length = 32) => {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

/**
 * Generate a secure hash
 */
const generateHash = (data, algorithm = 'sha256') => {
  return crypto.createHash(algorithm).update(data).digest('hex');
};

/**
 * Validate Telegram bot token format
 */
const validateBotToken = (token) => {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Telegram bot token format: {bot_id}:{bot_secret}
  // bot_id: 8-10 digits
  // bot_secret: 35 characters (alphanumeric, underscore, hyphen)
  const tokenRegex = /^[0-9]{8,10}:[a-zA-Z0-9_-]{35}$/;
  return tokenRegex.test(token);
};

/**
 * Extract bot ID from token
 */
const extractBotIdFromToken = (token) => {
  if (!validateBotToken(token)) {
    return null;
  }
  
  return token.split(':')[0];
};

/**
 * Validate Telegram chat ID
 */
const validateChatId = (chatId) => {
  if (!chatId) {
    return false;
  }
  
  // Chat ID can be:
  // - Number (positive for users, negative for groups/channels)
  // - String starting with @ (username)
  if (typeof chatId === 'number') {
    return true;
  }
  
  if (typeof chatId === 'string') {
    // Username format
    if (chatId.startsWith('@')) {
      return /^@[a-zA-Z0-9_]{5,32}$/.test(chatId);
    }
    
    // Numeric string
    return /^-?\d+$/.test(chatId);
  }
  
  return false;
};

/**
 * Sanitize text for Telegram
 */
const sanitizeText = (text, parseMode = 'text') => {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  switch (parseMode.toLowerCase()) {
    case 'markdown':
    case 'markdownv2':
      // Escape special characters for Markdown
      return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
    
    case 'html':
      // Escape HTML special characters
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    
    default:
      // Plain text - no escaping needed
      return text;
  }
};

/**
 * Format message with template variables
 */
const formatMessage = (template, variables = {}) => {
  if (!template || typeof template !== 'string') {
    return '';
  }
  
  let formatted = template;
  
  // Replace template variables like {{variable}}
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    formatted = formatted.replace(regex, variables[key] || '');
  });
  
  // Remove any remaining unreplaced variables
  formatted = formatted.replace(/{{\s*\w+\s*}}/g, '');
  
  return formatted.trim();
};

/**
 * Truncate text to specified length
 */
const truncateText = (text, maxLength = 4096, suffix = '...') => {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength - suffix.length) + suffix;
};

/**
 * Parse Telegram entities (mentions, hashtags, etc.)
 */
const parseEntities = (text, entities = []) => {
  if (!text || !Array.isArray(entities) || entities.length === 0) {
    return { text, mentions: [], hashtags: [], urls: [] };
  }
  
  const mentions = [];
  const hashtags = [];
  const urls = [];
  
  entities.forEach(entity => {
    const { type, offset, length } = entity;
    const entityText = text.substring(offset, offset + length);
    
    switch (type) {
      case 'mention':
      case 'text_mention':
        mentions.push({
          text: entityText,
          user: entity.user || null,
          offset,
          length
        });
        break;
      
      case 'hashtag':
        hashtags.push({
          text: entityText,
          offset,
          length
        });
        break;
      
      case 'url':
      case 'text_link':
        urls.push({
          text: entityText,
          url: entity.url || entityText,
          offset,
          length
        });
        break;
    }
  });
  
  return { text, mentions, hashtags, urls };
};

/**
 * Create inline keyboard markup
 */
const createInlineKeyboard = (buttons) => {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return null;
  }
  
  const keyboard = buttons.map(row => {
    if (!Array.isArray(row)) {
      row = [row];
    }
    
    return row.map(button => {
      if (typeof button === 'string') {
        return { text: button, callback_data: button };
      }
      
      return {
        text: button.text || 'Button',
        callback_data: button.callback_data || button.data || button.text,
        url: button.url || undefined
      };
    });
  });
  
  return { inline_keyboard: keyboard };
};

/**
 * Validate webhook URL
 */
const validateWebhookUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    const parsedUrl = new URL(url);
    
    // Must be HTTPS
    if (parsedUrl.protocol !== 'https:') {
      return false;
    }
    
    // Must have valid hostname
    if (!parsedUrl.hostname) {
      return false;
    }
    
    // Cannot be localhost or private IP in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = parsedUrl.hostname.toLowerCase();
      if (hostname === 'localhost' || 
          hostname.startsWith('127.') ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Sleep/delay function
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 */
const retry = async (fn, options = {}) => {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    onRetry = null
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        throw error;
      }
      
      const delay = Math.min(
        baseDelay * Math.pow(backoffFactor, attempt - 1),
        maxDelay
      );
      
      if (onRetry) {
        onRetry(error, attempt, delay);
      }
      
      logger.warn(`Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`, {
        error: error.message,
        attempt,
        delay
      });
      
      await sleep(delay);
    }
  }
  
  throw lastError;
};

/**
 * Rate limit checker
 */
const checkRateLimit = (lastCall, intervalMs) => {
  if (!lastCall) {
    return true;
  }
  
  const now = Date.now();
  const timeSinceLastCall = now - lastCall;
  
  return timeSinceLastCall >= intervalMs;
};

/**
 * Parse cron expression for alert scheduling
 */
const parseCronExpression = (interval) => {
  if (typeof interval === 'number') {
    // Convert seconds to cron expression
    if (interval < 60) {
      return `*/${interval} * * * * *`; // Every N seconds
    } else if (interval < 3600) {
      const minutes = Math.floor(interval / 60);
      return `0 */${minutes} * * * *`; // Every N minutes
    } else {
      const hours = Math.floor(interval / 3600);
      return `0 0 */${hours} * * *`; // Every N hours
    }
  }
  
  // Return as-is if already a cron expression
  return interval;
};

/**
 * Validate alert conditions
 */
const validateAlertConditions = (conditions, type) => {
  if (!conditions || typeof conditions !== 'object') {
    return { valid: false, errors: ['Conditions must be an object'] };
  }
  
  const errors = [];
  
  switch (type) {
    case 'price':
      if (!conditions.symbol) {
        errors.push('Symbol is required for price alerts');
      }
      if (!conditions.operator || !['>', '<', '>=', '<=', '=='].includes(conditions.operator)) {
        errors.push('Valid operator is required (>, <, >=, <=, ==)');
      }
      if (typeof conditions.value !== 'number' || conditions.value <= 0) {
        errors.push('Value must be a positive number');
      }
      break;
    
    case 'volume':
      if (!conditions.symbol) {
        errors.push('Symbol is required for volume alerts');
      }
      if (typeof conditions.volume !== 'number' || conditions.volume <= 0) {
        errors.push('Volume must be a positive number');
      }
      break;
    
    case 'technical':
      if (!conditions.indicator) {
        errors.push('Technical indicator is required');
      }
      if (!conditions.symbol) {
        errors.push('Symbol is required for technical alerts');
      }
      break;
    
    case 'news':
      if (!conditions.keywords || !Array.isArray(conditions.keywords)) {
        errors.push('Keywords array is required for news alerts');
      }
      break;
    
    case 'custom':
      if (!conditions.expression) {
        errors.push('Expression is required for custom alerts');
      }
      break;
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Format number with appropriate precision
 */
const formatNumber = (number, decimals = 2) => {
  if (typeof number !== 'number' || isNaN(number)) {
    return '0';
  }
  
  return number.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

/**
 * Format currency
 */
const formatCurrency = (amount, currency = 'USD') => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '$0.00';
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase()
  }).format(amount);
};

/**
 * Format percentage
 */
const formatPercentage = (value, decimals = 2) => {
  if (typeof value !== 'number' || isNaN(value)) {
    return '0%';
  }
  
  return `${value.toFixed(decimals)}%`;
};

/**
 * Get time ago string
 */
const getTimeAgo = (date) => {
  if (!date) {
    return 'Unknown';
  }
  
  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
  }
};

/**
 * Deep clone object
 */
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  
  const cloned = {};
  Object.keys(obj).forEach(key => {
    cloned[key] = deepClone(obj[key]);
  });
  
  return cloned;
};

/**
 * Merge objects deeply
 */
const deepMerge = (target, source) => {
  const result = deepClone(target);
  
  Object.keys(source).forEach(key => {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  });
  
  return result;
};

module.exports = {
  generateRandomString,
  generateHash,
  validateBotToken,
  extractBotIdFromToken,
  validateChatId,
  sanitizeText,
  formatMessage,
  truncateText,
  parseEntities,
  createInlineKeyboard,
  validateWebhookUrl,
  sleep,
  retry,
  checkRateLimit,
  parseCronExpression,
  validateAlertConditions,
  formatNumber,
  formatCurrency,
  formatPercentage,
  getTimeAgo,
  deepClone,
  deepMerge
};