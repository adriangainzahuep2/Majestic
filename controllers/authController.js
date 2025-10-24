const { googleOAuthService } = require('../services/google-oauth');
const jwt = require('jsonwebtoken');
const { pool } = require('../database/schema');

const JWT_SECRET = process.env.JWT_SECRET || 'majestic-health-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

async function googleLogin(req, res) {
  try {
    const { authUrl } = await googleOAuthService.getAuthorizationUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ success: false, error: 'Failed to initiate Google login' });
  }
}

async function googleCallback(req, res) {
  try {
    const { code, state } = req.query;
    const { user } = await googleOAuthService.handleCallback(code, state);

    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({
      success: true,
      data: {
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatar_url,
          profileCompleted: user.profile_completed || false,
        },
      },
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Google callback error:', error);
    res.status(401).json({ success: false, error: 'Authentication failed' });
  }
}

async function getCurrentUser(req, res) {
  try {
    const userId = req.user.id;
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        profileCompleted: user.profile_completed || false,
        preferredUnitSystem: user.preferred_unit_system,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve user' });
  }
}

async function refreshToken(req, res) {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const newToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email, name: decoded.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({ success: true, data: { token: newToken }, message: 'Token refreshed' });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh token' });
  }
}

async function logout(req, res) {
  try {
    const userId = req.user?.id;
    if (userId) {
      console.log(`[Auth] User ${userId} logged out`);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
}

module.exports = {
  googleLogin,
  googleCallback,
  getCurrentUser,
  refreshToken,
  logout,
};
