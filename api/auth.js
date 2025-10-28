/**
 * Authentication API Routes
 */

const express = require('express');
const router = express.Router();

// Import services
const authService = require('../services/auth');
const { body, validationResult } = require('express-validator');

// POST /auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;
    const result = await authService.login(email, password);

    res.json({
      success: true,
      data: {
        token: result.token,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          profile: result.user.profile
        },
        expiresAt: result.expiresAt
      }
    });

  } catch (error) {
    console.error('[AUTH] Login error:', error);
    res.status(401).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
});

// POST /auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').isLength({ min: 2 }).trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password, name } = req.body;
    const result = await authService.register(email, password, name);

    res.status(201).json({
      success: true,
      data: {
        token: result.token,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name
        },
        expiresAt: result.expiresAt
      }
    });

  } catch (error) {
    console.error('[AUTH] Registration error:', error);
    res.status(400).json({
      error: 'Registration failed',
      message: error.message
    });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { token } = req.body;
    const result = await authService.refreshToken(token);

    res.json({
      success: true,
      data: {
        token: result.token,
        expiresAt: result.expiresAt
      }
    });

  } catch (error) {
    console.error('[AUTH] Token refresh error:', error);
    res.status(401).json({
      error: 'Token refresh failed',
      message: error.message
    });
  }
});

// POST /auth/logout
router.post('/logout', async (req, res) => {
  try {
    const { token } = req.body;
    await authService.logout(token);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('[AUTH] Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: error.message
    });
  }
});

module.exports = router;
