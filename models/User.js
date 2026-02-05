// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
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
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  company: String,
  role: {
    type: String,
    enum: ['admin', 'reseller', 'user'],
    default: 'user'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  smsLimit: {
    daily: { type: Number, default: 100 },
    monthly: { type: Number, default: 3000 },
    used: {
      today: { type: Number, default: 0 },
      thisMonth: { type: Number, default: 0 }
    }
  },
  whatsappConnection: {
    sessionId: String,
    qrCode: String,
    isConnected: { type: Boolean, default: false },
    connectedAt: Date,
    expiresAt: Date
  },
  apiQuota: {
    limit: { type: Number, default: 1000 },
    used: { type: Number, default: 0 },
    resetDate: Date
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free'
    },
    expiresAt: Date,
    autoRenew: { type: Boolean, default: false }
  },
  settings: {
    twoFactorEnabled: { type: Boolean, default: false },
    apiKey: String,
    webhookUrl: String,
    proxyUrl: String
  },
  lastLogin: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Hash Password
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', UserSchema);
