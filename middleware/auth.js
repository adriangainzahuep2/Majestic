const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'majestic-health-secret-key-change-in-production';

/**
 * Auth Middleware
 * Verifies JWT token and attaches user info to request
 */

function authMiddleware(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user info to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      name: decoded.name
    };

    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

/**
 * Admin middleware (checks against allowlist)
 */
function adminOnly(req, res, next) {
  try {
    const userEmail = req.user?.email;

    // Admin allowlist (should be in environment variables in production)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim());

    if (!adminEmails.includes(userEmail)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    next();

  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }
}

module.exports = authMiddleware;
module.exports.adminOnly = adminOnly;
