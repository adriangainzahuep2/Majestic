const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || '145039075222-cro10f91ba61aguqsojosdkgfvvn4m71.apps.googleusercontent.com'
);

const JWT_SECRET = process.env.JWT_SECRET || 'majestic-health-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

/**
 * Auth Controller
 * Handles Google OAuth authentication and JWT token management
 */

/**
 * Google OAuth login
 */
async function googleLogin(req, res) {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Google token is required'
      });
    }

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    console.log(`[Auth] Google login: ${email}`);

    // Find or create user
    let userResult = await req.db.query(
      'SELECT * FROM users WHERE google_id = $1 OR email = $2',
      [googleId, email]
    );

    let user;

    if (userResult.rows.length === 0) {
      // Create new user
      const insertResult = await req.db.query(`
        INSERT INTO users (
          google_id,
          email,
          name,
          avatar_url,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `, [googleId, email, name, picture]);

      user = insertResult.rows[0];
      console.log(`[Auth] New user created: ${email}`);

    } else {
      user = userResult.rows[0];

      // Update user info if changed
      await req.db.query(`
        UPDATE users 
        SET 
          google_id = $1,
          name = $2,
          avatar_url = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [googleId, name, picture, user.id]);

      console.log(`[Auth] User updated: ${email}`);
    }

    // Generate JWT
    const jwtToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name
      },
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
          profileCompleted: user.profile_completed || false
        }
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Google login error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: error.message
    });
  }
}

/**
 * Get current user
 */
async function getCurrentUser(req, res) {
  try {
    const userId = req.user.id;

    const result = await req.db.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
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
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user',
      message: error.message
    });
  }
}

/**
 * Refresh JWT token
 */
async function refreshToken(req, res) {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }

    // Verify existing token (even if expired)
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    // Generate new token
    const newToken = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        name: decoded.name
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({
      success: true,
      data: {
        token: newToken
      },
      message: 'Token refreshed'
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token',
      message: error.message
    });
  }
}

/**
 * Logout (client-side token removal)
 */
async function logout(req, res) {
  try {
    // In JWT authentication, logout is typically handled client-side
    // by removing the token. However, we can log the event.
    
    const userId = req.user?.id;
    
    if (userId) {
      console.log(`[Auth] User ${userId} logged out`);
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      message: error.message
    });
  }
}

/**
 * Verify token (middleware helper)
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    return null;
  }
}

module.exports = {
  googleLogin,
  getCurrentUser,
  refreshToken,
  logout,
  verifyToken
};
