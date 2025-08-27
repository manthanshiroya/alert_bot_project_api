const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const environmentConfig = require('../config/environment');
const logger = require('./logger');

class Helpers {
  // Password utilities
  static async hashPassword(password) {
    try {
      const saltRounds = environmentConfig.get('BCRYPT_ROUNDS');
      return await bcrypt.hash(password, saltRounds);
    } catch (error) {
      logger.logError(error, { operation: 'hashPassword' });
      throw new Error('Password hashing failed');
    }
  }

  static async comparePassword(password, hashedPassword) {
    try {
      return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
      logger.logError(error, { operation: 'comparePassword' });
      throw new Error('Password comparison failed');
    }
  }

  // JWT utilities
  static generateToken(payload, options = {}) {
    try {
      const jwtConfig = environmentConfig.getJWTConfig();
      const tokenOptions = {
        expiresIn: jwtConfig.expiresIn,
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
        algorithm: jwtConfig.algorithm,
        ...options
      };

      return jwt.sign(payload, jwtConfig.secret, tokenOptions);
    } catch (error) {
      logger.logError(error, { operation: 'generateToken', payload });
      throw new Error('Token generation failed');
    }
  }

  static generateRefreshToken(payload) {
    try {
      const jwtConfig = environmentConfig.getJWTConfig();
      return jwt.sign(payload, jwtConfig.secret, {
        expiresIn: jwtConfig.refreshExpiresIn,
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
        algorithm: jwtConfig.algorithm
      });
    } catch (error) {
      logger.logError(error, { operation: 'generateRefreshToken', payload });
      throw new Error('Refresh token generation failed');
    }
  }

  static verifyToken(token) {
    try {
      const jwtConfig = environmentConfig.getJWTConfig();
      return jwt.verify(token, jwtConfig.secret, {
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
        algorithms: [jwtConfig.algorithm]
      });
    } catch (error) {
      logger.logError(error, { operation: 'verifyToken' });
      throw new Error('Token verification failed');
    }
  }

  static decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      logger.logError(error, { operation: 'decodeToken' });
      throw new Error('Token decoding failed');
    }
  }

  // Encryption utilities
  static encrypt(text, key = null) {
    try {
      const algorithm = 'aes-256-gcm';
      const secretKey = key || environmentConfig.get('JWT_SECRET');
      const keyHash = crypto.createHash('sha256').update(secretKey).digest();
      
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(algorithm, keyHash);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      logger.logError(error, { operation: 'encrypt' });
      throw new Error('Encryption failed');
    }
  }

  static decrypt(encryptedData, key = null) {
    try {
      const algorithm = 'aes-256-gcm';
      const secretKey = key || environmentConfig.get('JWT_SECRET');
      const keyHash = crypto.createHash('sha256').update(secretKey).digest();
      
      const decipher = crypto.createDecipher(algorithm, keyHash);
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.logError(error, { operation: 'decrypt' });
      throw new Error('Decryption failed');
    }
  }

  // Random generators
  static generateRandomString(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  static generateRandomNumber(min = 100000, max = 999999) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static generateUUID() {
    return crypto.randomUUID();
  }

  // Validation utilities
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidTelegramId(telegramId) {
    return /^\d{8,12}$/.test(telegramId.toString());
  }

  static isValidPassword(password) {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
  }

  static isValidObjectId(id) {
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    return objectIdRegex.test(id);
  }

  static isValidSymbol(symbol) {
    // Trading symbol validation (e.g., BTCUSDT, EURUSD)
    const symbolRegex = /^[A-Z]{3,10}$/;
    return symbolRegex.test(symbol);
  }

  static isValidTimeframe(timeframe) {
    const validTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
    return validTimeframes.includes(timeframe);
  }

  // Data sanitization
  static sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }
    
    return input
      .trim()
      .replace(/[<>"'&]/g, (match) => {
        const entities = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        };
        return entities[match];
      });
  }

  static sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeInput(value);
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  // Date utilities
  static formatDate(date, format = 'ISO') {
    const d = new Date(date);
    
    switch (format) {
      case 'ISO':
        return d.toISOString();
      case 'UTC':
        return d.toUTCString();
      case 'LOCAL':
        return d.toLocaleString();
      case 'DATE_ONLY':
        return d.toISOString().split('T')[0];
      case 'TIME_ONLY':
        return d.toISOString().split('T')[1].split('.')[0];
      default:
        return d.toISOString();
    }
  }

  static addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  static addHours(date, hours) {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
  }

  static isExpired(date) {
    return new Date(date) < new Date();
  }

  // Array utilities
  static chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  static unique(array) {
    return [...new Set(array)];
  }

  static shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Object utilities
  static pick(obj, keys) {
    const result = {};
    keys.forEach(key => {
      if (key in obj) {
        result[key] = obj[key];
      }
    });
    return result;
  }

  static omit(obj, keys) {
    const result = { ...obj };
    keys.forEach(key => {
      delete result[key];
    });
    return result;
  }

  static deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  static isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  // String utilities
  static capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  static camelCase(str) {
    return str.replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '');
  }

  static kebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  static truncate(str, length = 100, suffix = '...') {
    if (str.length <= length) return str;
    return str.substring(0, length) + suffix;
  }

  // Number utilities
  static formatNumber(num, decimals = 2) {
    return Number(num).toFixed(decimals);
  }

  static formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  static formatPercentage(value, decimals = 2) {
    return `${(value * 100).toFixed(decimals)}%`;
  }

  // Performance utilities
  static async measureTime(fn, ...args) {
    const start = process.hrtime.bigint();
    const result = await fn(...args);
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    return { result, duration };
  }

  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // Error utilities
  static createError(message, statusCode = 500, code = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
  }

  static isOperationalError(error) {
    return error.statusCode && error.statusCode < 500;
  }
}

module.exports = Helpers;