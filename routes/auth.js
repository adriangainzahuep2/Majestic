const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// POST /api/auth/google - Google OAuth login
router.post('/google', authController.googleLogin);

// GET /api/auth/me - Get current user
router.get('/me', authMiddleware, authController.getCurrentUser);

// POST /api/auth/refresh - Refresh JWT token
router.post('/refresh', authController.refreshToken);

// POST /api/auth/logout - Logout
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;
