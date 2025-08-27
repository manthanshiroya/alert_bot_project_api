const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema } = mongoose;

/**
 * User Schema for Subscription Service
 * Manages user accounts, profiles, and subscription-related information
 */
const userSchema = new Schema({
  // Basic user information
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    index: true
  },
  
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'],
    index: true
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false // Don't include password in queries by default
  },
  
  // Personal information
  profile: {
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters']
    },
    
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    
    displayName: {
      type: String,
      trim: true,
      maxlength: [100, 'Display name cannot exceed 100 characters']
    },
    
    avatar: {
      type: String,
      trim: true
    },
    
    timezone: {
      type: String,
      default: 'UTC',
      trim: true
    },
    
    language: {
      type: String,
      default: 'en',
      lowercase: true,
      match: [/^[a-z]{2}(-[A-Z]{2})?$/, 'Language must be in ISO format (e.g., en, en-US)']
    },
    
    dateOfBirth: {
      type: Date,
      validate: {
        validator: function(value) {
          if (!value) return true;
          const age = (new Date() - value) / (365.25 * 24 * 60 * 60 * 1000);
          return age >= 13 && age <= 120;
        },
        message: 'User must be between 13 and 120 years old'
      }
    },
    
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'Bio cannot exceed 500 characters']
    }
  },
  
  // Contact information
  contact: {
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[1-9]\d{1,14}$/, 'Please provide a valid phone number']
    },
    
    address: {
      street: {
        type: String,
        trim: true,
        maxlength: [200, 'Street address cannot exceed 200 characters']
      },
      
      city: {
        type: String,
        trim: true,
        maxlength: [100, 'City cannot exceed 100 characters']
      },
      
      state: {
        type: String,
        trim: true,
        maxlength: [100, 'State cannot exceed 100 characters']
      },
      
      postalCode: {
        type: String,
        trim: true,
        maxlength: [20, 'Postal code cannot exceed 20 characters']
      },
      
      country: {
        type: String,
        trim: true,
        uppercase: true,
        match: [/^[A-Z]{2}$/, 'Country must be a valid 2-letter ISO code']
      }
    }
  },
  
  // Account status and verification
  status: {
    type: String,
    enum: {
      values: ['pending', 'active', 'suspended', 'banned', 'deleted'],
      message: 'Status must be one of: pending, active, suspended, banned, deleted'
    },
    default: 'pending',
    index: true
  },
  
  verification: {
    email: {
      verified: {
        type: Boolean,
        default: false,
        index: true
      },
      
      verifiedAt: {
        type: Date
      },
      
      token: {
        type: String,
        select: false
      },
      
      tokenExpires: {
        type: Date,
        select: false
      }
    },
    
    phone: {
      verified: {
        type: Boolean,
        default: false
      },
      
      verifiedAt: {
        type: Date
      },
      
      code: {
        type: String,
        select: false
      },
      
      codeExpires: {
        type: Date,
        select: false
      }
    }
  },
  
  // Security settings
  security: {
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    
    twoFactorSecret: {
      type: String,
      select: false
    },
    
    backupCodes: [{
      type: String,
      select: false
    }],
    
    lastPasswordChange: {
      type: Date,
      default: Date.now
    },
    
    passwordResetToken: {
      type: String,
      select: false
    },
    
    passwordResetExpires: {
      type: Date,
      select: false
    },
    
    loginAttempts: {
      type: Number,
      default: 0
    },
    
    lockUntil: {
      type: Date
    }
  },
  
  // Subscription information
  subscription: {
    currentSubscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription',
      index: true
    },
    
    currentPlanId: {
      type: Schema.Types.ObjectId,
      ref: 'Plan',
      index: true
    },
    
    subscriptionHistory: [{
      subscriptionId: {
        type: Schema.Types.ObjectId,
        ref: 'Subscription'
      },
      planId: {
        type: Schema.Types.ObjectId,
        ref: 'Plan'
      },
      startDate: {
        type: Date,
        required: true
      },
      endDate: {
        type: Date
      },
      status: {
        type: String,
        enum: ['trial', 'active', 'canceled', 'expired']
      }
    }],
    
    billingInfo: {
      customerId: {
        type: String,
        trim: true,
        index: true
      },
      
      defaultPaymentMethod: {
        type: String,
        trim: true
      },
      
      billingAddress: {
        street: String,
        city: String,
        state: String,
        postalCode: String,
        country: String
      },
      
      taxId: {
        type: String,
        trim: true
      },
      
      companyName: {
        type: String,
        trim: true,
        maxlength: [200, 'Company name cannot exceed 200 characters']
      }
    }
  },
  
  // Preferences and settings
  preferences: {
    notifications: {
      email: {
        marketing: {
          type: Boolean,
          default: true
        },
        billing: {
          type: Boolean,
          default: true
        },
        security: {
          type: Boolean,
          default: true
        },
        product: {
          type: Boolean,
          default: true
        }
      },
      
      sms: {
        billing: {
          type: Boolean,
          default: false
        },
        security: {
          type: Boolean,
          default: false
        }
      },
      
      push: {
        enabled: {
          type: Boolean,
          default: true
        },
        alerts: {
          type: Boolean,
          default: true
        }
      }
    },
    
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'private', 'friends'],
        default: 'private'
      },
      
      dataSharing: {
        type: Boolean,
        default: false
      },
      
      analytics: {
        type: Boolean,
        default: true
      }
    },
    
    ui: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'auto'
      },
      
      currency: {
        type: String,
        uppercase: true,
        match: [/^[A-Z]{3}$/, 'Currency must be a valid 3-letter ISO code'],
        default: 'USD'
      },
      
      dateFormat: {
        type: String,
        enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'],
        default: 'MM/DD/YYYY'
      },
      
      timeFormat: {
        type: String,
        enum: ['12h', '24h'],
        default: '12h'
      }
    }
  },
  
  // Activity tracking
  activity: {
    lastLoginAt: {
      type: Date,
      index: true
    },
    
    lastActiveAt: {
      type: Date,
      index: true
    },
    
    loginCount: {
      type: Number,
      default: 0
    },
    
    ipAddresses: [{
      ip: String,
      lastUsed: {
        type: Date,
        default: Date.now
      },
      userAgent: String,
      location: {
        country: String,
        city: String,
        region: String
      }
    }],
    
    sessions: [{
      sessionId: {
        type: String,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      expiresAt: {
        type: Date,
        required: true
      },
      ipAddress: String,
      userAgent: String,
      isActive: {
        type: Boolean,
        default: true
      }
    }]
  },
  
  // Metadata and tracking
  metadata: {
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'admin', 'import'],
      default: 'web'
    },
    
    referralCode: {
      type: String,
      trim: true
    },
    
    referredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    
    utmSource: {
      type: String,
      trim: true
    },
    
    utmMedium: {
      type: String,
      trim: true
    },
    
    utmCampaign: {
      type: String,
      trim: true
    },
    
    tags: [{
      type: String,
      trim: true,
      lowercase: true
    }],
    
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    },
    
    customFields: {
      type: Map,
      of: Schema.Types.Mixed
    }
  },
  
  // Soft delete
  deletedAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true,
  versionKey: false,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.password;
      delete ret.security.twoFactorSecret;
      delete ret.security.backupCodes;
      delete ret.security.passwordResetToken;
      delete ret.verification.email.token;
      delete ret.verification.phone.code;
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    }
  }
});

// Indexes for better query performance
userSchema.index({ email: 1, status: 1 });
userSchema.index({ username: 1, status: 1 });
userSchema.index({ 'subscription.currentSubscriptionId': 1 });
userSchema.index({ 'subscription.currentPlanId': 1 });
userSchema.index({ 'verification.email.verified': 1 });
userSchema.index({ 'activity.lastActiveAt': -1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ deletedAt: 1 }, { sparse: true });

// Virtual properties
userSchema.virtual('fullName').get(function() {
  if (this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.profile.displayName || this.username || this.email;
});

userSchema.virtual('isActive').get(function() {
  return this.status === 'active' && !this.deletedAt;
});

userSchema.virtual('isVerified').get(function() {
  return this.verification.email.verified;
});

userSchema.virtual('isLocked').get(function() {
  return this.security.lockUntil && this.security.lockUntil > Date.now();
});

userSchema.virtual('hasActiveSubscription').get(function() {
  return !!this.subscription.currentSubscriptionId;
});

// Pre-save middleware
userSchema.pre('save', async function(next) {
  // Hash password if it's modified
  if (this.isModified('password')) {
    try {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
      this.security.lastPasswordChange = new Date();
    } catch (error) {
      return next(error);
    }
  }
  
  // Generate username from email if not provided
  if (!this.username && this.email) {
    const baseUsername = this.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    let username = baseUsername;
    let counter = 1;
    
    // Check if username exists and increment counter if needed
    while (await this.constructor.findOne({ username, _id: { $ne: this._id } })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }
    
    this.username = username;
  }
  
  // Set display name if not provided
  if (!this.profile.displayName) {
    this.profile.displayName = this.fullName;
  }
  
  // Update last active timestamp
  this.activity.lastActiveAt = new Date();
  
  next();
});

// Static methods
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase(), deletedAt: null });
};

userSchema.statics.findByUsername = function(username) {
  return this.findOne({ username, deletedAt: null });
};

userSchema.statics.findActiveUsers = function() {
  return this.find({ status: 'active', deletedAt: null })
    .sort({ 'activity.lastActiveAt': -1 });
};

userSchema.statics.findSubscribedUsers = function() {
  return this.find({
    'subscription.currentSubscriptionId': { $exists: true },
    status: 'active',
    deletedAt: null
  }).populate('subscription.currentSubscriptionId subscription.currentPlanId');
};

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    throw new Error('Password not set for this user');
  }
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.incrementLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.security.lockUntil && this.security.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { 'security.lockUntil': 1 },
      $set: { 'security.loginAttempts': 1 }
    });
  }
  
  const updates = { $inc: { 'security.loginAttempts': 1 } };
  
  // If we have max attempts and no lock, lock the account
  if (this.security.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { 'security.lockUntil': Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: {
      'security.loginAttempts': 1,
      'security.lockUntil': 1
    }
  });
};

userSchema.methods.updateLastLogin = function(ipAddress, userAgent) {
  const updates = {
    'activity.lastLoginAt': new Date(),
    'activity.lastActiveAt': new Date(),
    $inc: { 'activity.loginCount': 1 }
  };
  
  if (ipAddress) {
    // Add or update IP address
    const existingIp = this.activity.ipAddresses.find(ip => ip.ip === ipAddress);
    if (existingIp) {
      existingIp.lastUsed = new Date();
      if (userAgent) existingIp.userAgent = userAgent;
    } else {
      this.activity.ipAddresses.push({
        ip: ipAddress,
        lastUsed: new Date(),
        userAgent
      });
    }
  }
  
  return this.updateOne(updates);
};

userSchema.methods.addSession = function(sessionId, expiresAt, ipAddress, userAgent) {
  this.activity.sessions.push({
    sessionId,
    expiresAt,
    ipAddress,
    userAgent,
    isActive: true
  });
  
  return this.save();
};

userSchema.methods.removeSession = function(sessionId) {
  this.activity.sessions = this.activity.sessions.filter(
    session => session.sessionId !== sessionId
  );
  
  return this.save();
};

userSchema.methods.softDelete = function() {
  this.deletedAt = new Date();
  this.status = 'deleted';
  
  return this.save();
};

userSchema.methods.restore = function() {
  this.deletedAt = undefined;
  this.status = 'active';
  
  return this.save();
};

const User = mongoose.model('User', userSchema);

module.exports = User;