const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

const adminUserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    select: false // Don't include password in queries by default
  },
  profile: {
    firstName: {
      type: String,
      required: true
    },
    lastName: {
      type: String,
      required: true
    },
    phone: String
  },
  permissions: {
    users: {
      view: {
        type: Boolean,
        default: true
      },
      edit: {
        type: Boolean,
        default: true
      },
      delete: {
        type: Boolean,
        default: false
      }
    },
    subscriptions: {
      view: {
        type: Boolean,
        default: true
      },
      approve: {
        type: Boolean,
        default: true
      },
      edit: {
        type: Boolean,
        default: true
      }
    },
    alerts: {
      view: {
        type: Boolean,
        default: true
      },
      configure: {
        type: Boolean,
        default: true
      }
    },
    system: {
      settings: {
        type: Boolean,
        default: false
      },
      logs: {
        type: Boolean,
        default: true
      }
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  security: {
    lastLoginAt: Date,
    lastLoginIP: String,
    failedLoginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: Date,
    passwordResetToken: {
      type: String,
      select: false
    },
    passwordResetExpires: {
      type: Date,
      select: false
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'admin_users',
  timestamps: true
});

// Virtual for checking if account is locked
adminUserSchema.virtual('isLocked').get(function() {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});

// Virtual for full name
adminUserSchema.virtual('fullName').get(function() {
  return `${this.profile.firstName} ${this.profile.lastName}`;
});

// Pre-save middleware to hash password
adminUserSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const hashedPassword = await bcrypt.hash(this.password, 12);
    this.password = hashedPassword;
    next();
  } catch (error) {
    logger.error('Error hashing admin password:', error);
    next(error);
  }
});

// Pre-save middleware to update timestamps
adminUserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method to compare password
adminUserSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    logger.error('Error comparing admin password:', error);
    throw error;
  }
};

// Instance method to increment login attempts
adminUserSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.security.lockUntil && this.security.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: {
        'security.lockUntil': 1
      },
      $set: {
        'security.failedLoginAttempts': 1
      }
    });
  }
  
  const updates = { $inc: { 'security.failedLoginAttempts': 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.security.failedLoginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = {
      'security.lockUntil': Date.now() + 2 * 60 * 60 * 1000 // 2 hours
    };
  }
  
  return this.updateOne(updates);
};

// Instance method to reset login attempts
adminUserSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: {
      'security.failedLoginAttempts': 1,
      'security.lockUntil': 1
    }
  });
};

// Static method to find by email
adminUserSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to find by username
adminUserSchema.statics.findByUsername = function(username) {
  return this.findOne({ username: username.toLowerCase() });
};

// Indexes
adminUserSchema.index({ email: 1 }, { unique: true });
adminUserSchema.index({ username: 1 }, { unique: true });
adminUserSchema.index({ status: 1 });
adminUserSchema.index({ 'security.lockUntil': 1 });

const AdminUser = mongoose.model('AdminUser', adminUserSchema);

module.exports = AdminUser;