// controllers/MessageController.js
const Message = require('../models/Message');
const User = require('../models/User');
const Template = require('../models/Template');
const axios = require('axios');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 });

class MessageController {
  // Send Single Message
  static async sendSingle(req, res) {
    try {
      const { phone, message, templateId, variables } = req.body;
      const userId = req.user.id;

      const user = await User.findById(userId);

      // Check SMS Limit
      if (user.smsLimit.used.today >= user.smsLimit.daily) {
        return res.status(429).json({
          success: false,
          message: `Daily SMS limit (${user.smsLimit.daily}) exceeded`
        });
      }

      let content = message;
      if (templateId) {
        const template = await Template.findById(templateId);
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
        
        content = template.content;
        // Replace variables
        if (variables) {
          template.variables.forEach(variable => {
            content = content.replace(`{{${variable}}}`, variables[variable] || '');
          });
        }
      }

      const messageDoc = new Message({
        user: userId,
        recipient: { phone, name: req.body.name || '' },
        content,
        variables,
        template: templateId,
        method: 'personal',
        status: 'pending'
      });

      // Send via WhatsApp
      const sent = await this.sendViaWhatsApp(user, phone, content);

      if (sent) {
        messageDoc.status = 'sent';
        messageDoc.sentAt = new Date();
        user.smsLimit.used.today++;
        user.smsLimit.used.thisMonth++;
      } else {
        messageDoc.status = 'failed';
        messageDoc.failureReason = 'WhatsApp connection failed';
      }

      await messageDoc.save();
      await user.save();

      // Trigger Webhook
      if (user.settings.webhookUrl) {
        this.triggerWebhook(user.settings.webhookUrl, messageDoc);
      }

      res.json({
        success: true,
        message: 'Message sent successfully',
        messageId: messageDoc._id,
        status: messageDoc.status
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Bulk Send
  static async sendBulk(req, res) {
    try {
      const { contacts, templateId, variables, delay = 1000 } = req.body;
      const userId = req.user.id;

      const user = await User.findById(userId);
      const template = await Template.findById(templateId);

      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }

      // Check Quota
      if (user.smsLimit.used.today + contacts.length > user.smsLimit.daily) {
        return res.status(429).json({
          success: false,
          message: `Insufficient quota. Available: ${user.smsLimit.daily - user.smsLimit.used.today}`,
          available: user.smsLimit.daily - user.smsLimit.used.today
        });
      }

      const campaignId = require('crypto').randomBytes(8).toString('hex');
      const results = [];

      // Process in batches
      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        
        try {
          let content = template.content;
          
          if (variables && variables[i]) {
            template.variables.forEach(variable => {
              content = content.replace(`{{${variable}}}`, variables[i][variable] || '');
            });
          }

          const message = new Message({
            user: userId,
            recipient: { phone: contact.phone, name: contact.name },
            content,
            template: templateId,
            method: 'bulk',
            status: 'pending',
            metadata: { campaignId }
          });

          const sent = await this.sendViaWhatsApp(user, contact.phone, content);
          
          if (sent) {
            message.status = 'sent';
            message.sentAt = new Date();
            results.push({ phone: contact.phone, status: 'sent' });
          } else {
            message.status = 'failed';
            results.push({ phone: contact.phone, status: 'failed' });
          }

          await message.save();

          // Delay between messages
          await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
          results.push({ phone: contact.phone, status: 'error', error: error.message });
        }
      }

      // Update user quota
      const successCount = results.filter(r => r.status === 'sent').length;
      user.smsLimit.used.today += successCount;
      user.smsLimit.used.thisMonth += successCount;
      await user.save();

      res.json({
        success: true,
        message: 'Bulk campaign completed',
        campaignId,
        results: {
          total: contacts.length,
          sent: successCount,
          failed: results.length - successCount,
          details: results
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Send via WhatsApp
  static async sendViaWhatsApp(user, phone, message) {
    try {
      // Using official WhatsApp API
      if (user.settings.apiKey) {
        const response = await axios.post(
          `https://api.whatsapp.com/send`,
          {
            messaging_product: 'whatsapp',
            to: phone.replace(/\D/g, ''),
            type: 'text',
            text: { body: message }
          },
          {
            headers: {
              'Authorization': `Bearer ${user.settings.apiKey}`,
              'Content-Type': 'application/json'
            },
            httpAgent: user.settings.proxyUrl ? new (require('http').Agent)({ proxy: user.settings.proxyUrl }) : undefined,
            httpsAgent: user.settings.proxyUrl ? new (require('https').Agent)({ proxy: user.settings.proxyUrl }) : undefined
          }
        );

        return response.data.messages[0].id ? true : false;
      }

      // Fallback to personal connection (Baileys)
      return await this.sendViaPersonalConnection(user, phone, message);
    } catch (error) {
      console.error('WhatsApp Send Error:', error.message);
      return false;
    }
  }

  static async sendViaPersonalConnection(user, phone, message) {
    // Implement Baileys integration here
    // This is a placeholder
    return true;
  }

  // Trigger Webhook
  static async triggerWebhook(webhookUrl, messageData) {
    try {
      await axios.post(webhookUrl, {
        event: 'message.sent',
        data: messageData,
        timestamp: new Date()
      }, { timeout: 5000 });
    } catch (error) {
      console.error('Webhook Error:', error.message);
    }
  }

  // Get Message History
  static async getHistory(req, res) {
    try {
      const { page = 1, limit = 20, status, dateFrom, dateTo } = req.query;
      const userId = req.user.id;

      const query = { user: userId };

      if (status) query.status = status;
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      const messages = await Message.find(query)
        .populate('template', 'name content')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Message.countDocuments(query);

      res.json({
        success: true,
        messages,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalMessages: total
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get Statistics
  static async getStats(req, res) {
    try {
      const userId = req.user.id;
      const { period = 'monthly' } = req.query;

      let dateFilter = {};
      const now = new Date();

      if (period === 'daily') {
        dateFilter.createdAt = { $gte: new Date(now.setHours(0, 0, 0, 0)) };
      } else if (period === 'weekly') {
        const weekAgo = new Date(now.setDate(now.getDate() - 7));
        dateFilter.createdAt = { $gte: weekAgo };
      } else {
        const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
        dateFilter.createdAt = { $gte: monthAgo };
      }

      const stats = await Message.aggregate([
        { $match: { user: require('mongoose').Types.ObjectId(userId), ...dateFilter } },
        { $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      res.json({
        success: true,
        stats: {
          total: stats.reduce((sum, s) => sum + s.count, 0),
          breakdown: stats
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = MessageController;
