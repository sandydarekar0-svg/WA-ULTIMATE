// models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    phone: String,
    name: String
  },
  template: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template'
  },
  content: String,
  variables: mongoose.Schema.Types.Mixed,
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'scheduled'],
    default: 'pending'
  },
  method: {
    type: String,
    enum: ['personal', 'api', 'bulk'],
    default: 'personal'
  },
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  failureReason: String,
  cost: { type: Number, default: 1 },
  apiKey: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApiKey'
  },
  webhookStatus: {
    notified: { type: Boolean, default: false },
    notifiedAt: Date
  },
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
  scheduledFor: Date
}, { timestamps: true, indexes: true });

// Index for faster queries
MessageSchema.index({ user: 1, createdAt: -1 });
MessageSchema.index({ status: 1 });
MessageSchema.index({ 'recipient.phone': 1 });

module.exports = mongoose.model('Message', MessageSchema);
