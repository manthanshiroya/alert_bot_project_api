const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  subscriptionPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: [true, 'Subscription plan ID is required']
  },
  transactionId: {
    type: String,
    required: [true, 'Transaction ID is required'],
    unique: true,
    trim: true,
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  currency: {
    type: String,
    default: 'INR',
    uppercase: true
  },
  method: {
    type: String,
    enum: ['UPI', 'bank_transfer', 'net_banking', 'card', 'other'],
    default: 'UPI',
    required: true
  },
  upiDetails: {
    vpa: {
      type: String,
      trim: true
    },
    qrCodeUrl: {
      type: String,
      trim: true
    },
    qrCodeData: {
      type: String,
      trim: true
    },
    merchantName: {
      type: String,
      trim: true
    },
    merchantCode: {
      type: String,
      trim: true
    }
  },
  proofUpload: {
    originalName: {
      type: String,
      trim: true
    },
    filename: {
      type: String,
      trim: true
    },
    path: {
      type: String,
      trim: true
    },
    url: {
      type: String,
      trim: true
    },
    size: {
      type: Number
    },
    mimetype: {
      type: String,
      trim: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  status: {
    type: String,
    enum: ['initiated', 'pending', 'approved', 'rejected', 'expired'],
    default: 'initiated',
    index: true
  },
  verification: {
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    verifiedAt: {
      type: Date
    },
    rejectionReason: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    }
  },
  metadata: {
    ipAddress: {
      type: String,
      trim: true
    },
    userAgent: {
      type: String,
      trim: true
    },
    referenceNumber: {
      type: String,
      trim: true
    },
    bankReference: {
      type: String,
      trim: true
    }
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Payment expires after 24 hours
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    },
    index: { expireAfterSeconds: 0 }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
paymentSchema.index({ userId: 1, status: 1 });
paymentSchema.index({ subscriptionPlanId: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ 'verification.verifiedAt': -1 });

// Virtual for payment age
paymentSchema.virtual('ageInHours').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60));
});

// Virtual for time remaining
paymentSchema.virtual('timeRemaining').get(function() {
  if (this.status !== 'initiated' && this.status !== 'pending') {
    return null;
  }
  const remaining = this.expiresAt - Date.now();
  return remaining > 0 ? remaining : 0;
});

// Static methods
paymentSchema.statics.findPendingPayments = function() {
  return this.find({ status: 'pending' })
    .populate('userId', 'profile.name email')
    .populate('subscriptionPlanId', 'name pricing')
    .sort({ createdAt: -1 });
};

paymentSchema.statics.findByUser = function(userId, options = {}) {
  const query = { userId };
  if (options.status) {
    query.status = options.status;
  }
  
  return this.find(query)
    .populate('subscriptionPlanId', 'name pricing')
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

paymentSchema.statics.getPaymentStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    {
      $group: {
        _id: null,
        stats: {
          $push: {
            status: '$_id',
            count: '$count',
            totalAmount: '$totalAmount'
          }
        },
        totalPayments: { $sum: '$count' },
        totalRevenue: { $sum: '$totalAmount' }
      }
    }
  ]);
};

// Instance methods
paymentSchema.methods.approve = function(adminUserId, notes = '') {
  this.status = 'approved';
  this.verification.verifiedBy = adminUserId;
  this.verification.verifiedAt = new Date();
  this.verification.notes = notes;
  return this.save();
};

paymentSchema.methods.reject = function(adminUserId, reason, notes = '') {
  this.status = 'rejected';
  this.verification.verifiedBy = adminUserId;
  this.verification.verifiedAt = new Date();
  this.verification.rejectionReason = reason;
  this.verification.notes = notes;
  return this.save();
};

paymentSchema.methods.markPending = function() {
  this.status = 'pending';
  return this.save();
};

paymentSchema.methods.isExpired = function() {
  return Date.now() > this.expiresAt;
};

paymentSchema.methods.canBeVerified = function() {
  return ['pending'].includes(this.status) && !this.isExpired();
};

// Pre-save middleware
paymentSchema.pre('save', function(next) {
  // Auto-expire payments
  if (this.isExpired() && ['initiated', 'pending'].includes(this.status)) {
    this.status = 'expired';
  }
  next();
});

// Post-save middleware for logging
paymentSchema.post('save', function(doc) {
  if (this.isModified('status')) {
    console.log(`Payment ${doc.transactionId} status changed to ${doc.status}`);
  }
});

module.exports = mongoose.model('Payment', paymentSchema);