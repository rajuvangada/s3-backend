const pool = require('../config/db');
const logger = require('../config/logger');

/**
 * Log user action to database activity logs
 * @param {number} userId - ID of the user performing action
 * @param {string} action - Action type (Upload, Download, Delete, Rename, Share, Login, Logout)
 * @param {object} details - Additional structured log parameters
 * @param {string} ipAddress - Client IP address
 */
const logActivity = async (userId, action, details = {}, ipAddress = null) => {
  try {
    const query = `
      INSERT INTO ActivityLogs (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `;
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
    await pool.query(query, [userId, action, detailsStr, ipAddress]);
    logger.info(`[Activity] User ${userId || 'Anonymous'} - ${action} - Details: ${detailsStr}`);
  } catch (error) {
    logger.error(`Database logging failure for action ${action}: ${error.message}`);
  }
};

module.exports = {
  logActivity
};
