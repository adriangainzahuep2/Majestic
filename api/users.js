/**
 * User Management API Routes
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authService = require('../services/auth');

// GET /users/profile
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const userProfile = await authService.getUserProfile(userId);

    res.json({
      success: true,
      data: userProfile
    });

  } catch (error) {
    console.error('[USERS] Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: error.message
    });
  }
});

// PUT /users/profile
router.put('/profile', [
  body('name').optional().isLength({ min: 2 }).trim(),
  body('age').optional().isInt({ min: 1, max: 150 }),
  body('gender').optional().isIn(['male', 'female', 'other']),
  body('height').optional().isFloat({ min: 1, max: 3 }),
  body('weight').optional().isFloat({ min: 1, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const updateData = req.body;
    
    const updatedProfile = await authService.updateUserProfile(userId, updateData);

    res.json({
      success: true,
      data: updatedProfile
    });

  } catch (error) {
    console.error('[USERS] Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error.message
    });
  }
});

// GET /users/settings
router.get('/settings', async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = await authService.getUserSettings(userId);

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    console.error('[USERS] Get settings error:', error);
    res.status(500).json({
      error: 'Failed to get settings',
      message: error.message
    });
  }
});

// PUT /users/settings
router.put('/settings', [
  body('notifications').optional().isBoolean(),
  body('privacy').optional().isIn(['public', 'private', 'friends']),
  body('units').optional().isIn(['metric', 'imperial']),
  body('timezone').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const settings = req.body;
    
    const updatedSettings = await authService.updateUserSettings(userId, settings);

    res.json({
      success: true,
      data: updatedSettings
    });

  } catch (error) {
    console.error('[USERS] Update settings error:', error);
    res.status(500).json({
      error: 'Failed to update settings',
      message: error.message
    });
  }
});

// GET /users/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    const dashboard = await authService.getUserDashboard(userId);

    res.json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    console.error('[USERS] Dashboard error:', error);
    res.status(500).json({
      error: 'Failed to get dashboard data',
      message: error.message
    });
  }
});

module.exports = router;
