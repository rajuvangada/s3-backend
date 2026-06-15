const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { UnauthorizedError } = require('../utils/errors');
const logger = require('../config/logger');

/**
 * Middleware to protect routes and verify user identity via JWT.
 */
const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new UnauthorizedError('Authentication token missing. Access denied.'));
    }

    // Decode and verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_dev_key_for_studentvault_2026');
    } catch (err) {
      return next(new UnauthorizedError('Invalid or expired authentication token. Please log in again.'));
    }

    // Verify user still exists in the database
    const [rows] = await pool.query('SELECT id, name, email FROM Users WHERE id = ?', [decoded.id]);
    if (rows.length === 0) {
      return next(new UnauthorizedError('The user account associated with this token no longer exists.'));
    }

    // Attach user context to request
    req.user = rows[0];
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  protect
};
