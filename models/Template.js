// models/Template.js
const mongoose = require('mongoose');

const TemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['promotional', 'transactional', 'otp', 'reminder', 'custom'],
    default: 'custom'
  },
  content: {
    type: String,
    required: true
  },
  variables: [String], // {{name}}, {{order_id}}, etc.
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending_approval'],
    default: 'active'
  },
  isEditable: {
    type: Boolean,
    default: false // Admin controls if user can edit
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Template', TemplateSchema);
