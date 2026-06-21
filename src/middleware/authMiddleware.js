const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { UnauthorizedError } = require('../utils/errors');

/**
 * Middleware to protect routes and verify user identity via JWT.
 */
const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Debug: log the incoming Authorization header
    console.log('--- Protect Middleware Debug ---');
    console.log('Authorization header:', req.headers.authorization || 'none');

    if (!token) {
      return next(new UnauthorizedError('Authentication token missing. Access denied.'));
    }

    // Decode and verify token – add detailed logging
    console.log('JWT_SECRET length (verify side):', (process.env.JWT_SECRET || '').length);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('jwt.verify SUCCESS – decoded payload:', decoded);
    } catch (err) {
      console.log('jwt.verify FAILED – error:', err.message);
      return next(new UnauthorizedError('Invalid or expired authentication token. Please log in again.'));
    }

    // Verify user still exists in the database
    const user = await User.findById(decoded.id).select('name email');
    if (!user) {
      return next(new UnauthorizedError('The user account associated with this token no longer exists.'));
    }

    // Attach user context to request
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email
    };
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  protect
};
