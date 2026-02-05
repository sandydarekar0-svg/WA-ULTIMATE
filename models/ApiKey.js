// models/ApiKey.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const ApiKeySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: String,
  key: {
    type: String,
    unique: true,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  secret: {
    type: String,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  permissions: {
    send: { type: Boolean, default: true },
    read: { type: Boolean, default: true },
    webhook: { type: Boolean, default: true }
  },
  quota: {
    limit: { type: Number, default: 10000 },
    used: { type: Number, default: 0 },
    resetDate: Date
  },
  ipWhitelist: [String],
  isActive: { type: Boolean, default: true },
  lastUsed: Date,
  createdAt: { type: Date, default: Date.now },
  expiresAt: Date
}, { timestamps: true });

module.exports = mongoose.model('ApiKey', ApiKeySchema);
