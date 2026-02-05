// routes/admin.js
const express = require('express');
const User = require('../models/User');
const ApiKey = require('../models/ApiKey');
const Message = require('../models/Message');
const Template = require('../models/Template');
const router = express.Router();

// Get All Users
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, role } = req.query;

    const query = {};
    if (status) query.status = status;
    if (role) query.role = role;

    const users = await User.find(query)
      .select('-password')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update User SMS Limit
router.patch('/users/:userId/sms-limit', async (req, res) => {
  try {
    const { daily, monthly } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      {
        'smsLimit.daily': daily || undefined,
        'smsLimit.monthly': monthly || undefined
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'SMS limit updated',
      user: {
        id: user._id,
        smsLimit: user.smsLimit
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Suspend User
router.patch('/users/:userId/suspend', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { status: 'suspended' },
      { new: true }
    );

    res.json({
      success: true,
      message: 'User suspended successfully',
      user: { id: user._id, status: user.status }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create System Template
router.post('/templates', async (req, res) => {
  try {
    const { name, category, content, variables, isEditable } = req.body;

    const template = new Template({
      name,
      category,
      content,
      variables,
      isEditable: isEditable || false,
      createdBy: req.user.id,
      status: 'active'
    });

    await template.save();

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      template
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Dashboard Stats
router.get('/dashboard', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'active' });
    const suspendedUsers = await User.countDocuments({ status: 'suspended' });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const messagesToday = await Message.countDocuments({ createdAt: { $gte: today } });
    const messagesSuccessful = await Message.countDocuments({
      createdAt: { $gte: today },
      status: 'sent'
    });

    const totalRevenue = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$subscription.expiresAt' } } }
    ]);

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          suspended: suspendedUsers
        },
        messages: {
          today: messagesToday,
          successful: messagesSuccessful
        },
        revenue: totalRevenue[0]?.total || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
