const authService = require('../services/auth');

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
      name: decoded.name
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
