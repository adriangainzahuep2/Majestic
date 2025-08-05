const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const authService = require('../services/auth');

const router = express.Router();

// Initialize Google OAuth client
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || 'your-google-client-id'
);

// Google OAuth login
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const googleUserData = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture
    };

    // Find or create user
    const user = await authService.findOrCreateUser(googleUserData);

    // Generate JWT token
    const authToken = authService.generateToken(user);

    res.json({
      success: true,
      token: authToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url
      }
    });

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ 
      error: 'Authentication failed',
      message: error.message 
    });
  }
});

// Demo login (for testing without Google OAuth)
router.post('/demo', async (req, res) => {
  try {
    const demoUser = {
      id: 'demo-123',
      email: 'demo@healthapp.com',
      name: 'Demo User',
      picture: null
    };

    // Find or create demo user
    const user = await authService.findOrCreateUser(demoUser);

    // Generate JWT token
    const authToken = authService.generateToken(user);

    res.json({
      success: true,
      token: authToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url
      }
    });

  } catch (error) {
    console.error('Demo auth error:', error);
    res.status(500).json({ 
      error: 'Demo authentication failed',
      message: error.message 
    });
  }
});

// Get current user profile
router.get('/me', async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const user = await authService.getUserById(req.user.userId);
    res.json({ user });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(404).json({ error: 'User not found' });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const updates = req.body;
    const user = await authService.updateUserProfile(req.user.userId, updates);
    res.json({ user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(400).json({ 
      error: 'Failed to update profile',
      message: error.message 
    });
  }
});

// Delete user account
router.delete('/account', async (req, res) => {
  try {
    await authService.deleteUser(req.user.userId);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ 
      error: 'Failed to delete account',
      message: error.message 
    });
  }
});

// Get auth configuration (Google Client ID for frontend)
router.get('/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    hasGoogleAuth: !!process.env.GOOGLE_CLIENT_ID
  });
});

// Logout (client-side token removal)
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
