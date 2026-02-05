// routes/api.js
const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const ApiKey = require('../models/ApiKey');
const router = express.Router();
const crypto = require('crypto');

// API Key Verification Middleware
const verifyApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const signature = req.headers['x-signature'];

    if (!apiKey) {
      return res.status(401).json({ success: false, message: 'Missing API Key' });
    }

    const apiKeyDoc = await ApiKey.findOne({ key: apiKey, isActive: true });

    if (!apiKeyDoc) {
      return res.status(401).json({ success: false, message: 'Invalid API Key' });
    }

    if (apiKeyDoc.expiresAt && apiKeyDoc.expiresAt < new Date()) {
      return res.status(401).json({ success: false, message: 'API Key expired' });
    }

    // IP Whitelist Check
    if (apiKeyDoc.ipWhitelist.length > 0) {
      if (!apiKeyDoc.ipWhitelist.includes(req.ip)) {
        return res.status(403).json({ success: false, message: 'IP not whitelisted' });
      }
    }

    // Quota Check
    if (apiKeyDoc.quota.used >= apiKeyDoc.quota.limit) {
      return res.status(429).json({ success: false, message: 'API quota exceeded' });
    }

    req.apiKey = apiKeyDoc;
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Send Message via API
router.post('/v1/messages/send', verifyApiKey, async (req, res) => {
  try {
    const { phone, message, templateId, variables, scheduledFor } = req.body;
    const userId = req.apiKey.user;

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone and message are required'
      });
    }

    const user = await User.findById(userId);

    // Validate phone format
    if (!/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone format'
      });
    }

    const messageDoc = new Message({
      user: userId,
      recipient: { phone },
      content: message,
      template: templateId,
      variables,
      method: 'api',
      apiKey: req.apiKey._id,
      status: scheduledFor ? 'scheduled' : 'pending',
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined
    });

    // Send message
    const messageService = require('../controllers/MessageController');
    const sent = await messageService.sendViaWhatsApp(user, phone, message);

    if (sent && !scheduledFor) {
      messageDoc.status = 'sent';
      messageDoc.sentAt = new Date();
    }

    await messageDoc.save();

    // Update API Key usage
    req.apiKey.quota.used++;
    req.apiKey.lastUsed = new Date();
    await req.apiKey.save();

    res.status(201).json({
      success: true,
      message: 'Message queued successfully',
      messageId: messageDoc._id,
      status: messageDoc.status
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Bulk Send via API
router.post('/v1/messages/bulk', verifyApiKey, async (req, res) => {
  try {
    const { contacts, templateId, delay = 1000 } = req.body;
    const userId = req.apiKey.user;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Contacts array is required and must not be empty'
      });
    }

    const campaignId = crypto.randomBytes(8).toString('hex');
    const results = [];

    for (const contact of contacts) {
      try {
        const message = new Message({
          user: userId,
          recipient: { phone: contact.phone, name: contact.name },
          content: contact.message,
          template: templateId,
          method: 'api',
          apiKey: req.apiKey._id,
          metadata: { campaignId }
        });

        await message.save();
        results.push({
          phone: contact.phone,
          messageId: message._id,
          status: 'queued'
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error) {
        results.push({
          phone: contact.phone,
          status: 'error',
          error: error.message
        });
      }
    }

    // Update API quota
    req.apiKey.quota.used += contacts.length;
    req.apiKey.lastUsed = new Date();
    await req.apiKey.save();

    res.status(201).json({
      success: true,
      campaignId,
      totalQueued: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Message Status
router.get('/v1/messages/:messageId', verifyApiKey, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    res.json({
      success: true,
      message: {
        id: message._id,
        phone: message.recipient.phone,
        status: message.status,
        sentAt: message.sentAt,
        deliveredAt: message.deliveredAt,
        readAt: message.readAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
