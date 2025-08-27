const { generateCorrelationId } = require('../utils/logger');

/**
 * Request ID middleware for correlation tracking
 * Extracts or generates correlation ID and exposes it to the client
 */
module.exports = (req, res, next) => {
  // Extract correlation ID from header or generate one
  const headerId = req.headers['x-request-id'];
  req.correlationId = headerId || generateCorrelationId();
  
  // Echo correlation ID back to client
  res.setHeader('X-Request-ID', req.correlationId);
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID');
  
  next();
};