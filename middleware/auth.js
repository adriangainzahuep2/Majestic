const authService = require('../services/auth');

// Admin allowlist middleware using Google email
function adminOnly(req, res, next) {
  try {
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const email = req.user?.email?.toLowerCase();

    if (!email || adminEmails.length === 0 || !adminEmails.includes(email)) {
      return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
    }
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ error: 'admin_check_failed', message: error.message });
  }
}

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // Debug logging for development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[AUTH] ${req.method} ${req.path} - Has Auth Header: ${!!authHeader}`);
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'unauthorized',
        message: 'No valid authorization token provided' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify and decode token
    const decoded = authService.verifyToken(token);
    
    // Debug logging for development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[AUTH] Token valid for user: ${decoded.email || decoded.userId}`);
    }
    
    // Add user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      is_demo: !!decoded.is_demo
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.message === 'Invalid token') {
      return res.status(401).json({ 
        error: 'unauthorized',
        message: 'Invalid or expired token' 
      });
    }

    res.status(500).json({ 
      error: 'Authentication error',
      message: error.message 
    });
  }
};

module.exports = authMiddleware;
module.exports.adminOnly = adminOnly;
