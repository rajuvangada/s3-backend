const ActivityLog = require('../models/ActivityLog');
const logger = require('../config/logger');

/**
 * Log user action to database activity logs
 * @param {string} userId - ID of the user performing action
 * @param {string} action - Action type (Upload, Download, Delete, Rename, Share, Login, Logout)
 * @param {object} details - Additional structured log parameters
 * @param {string} ipAddress - Client IP address
 */
const logActivity = async (userId, action, details = {}, ipAddress = null) => {
  try {
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
    await ActivityLog.create({
      user_id: userId,
      action,
      details: detailsStr,
      ip_address: ipAddress
    });
    logger.info(`[Activity] User ${userId || 'Anonymous'} - ${action} - Details: ${detailsStr}`);
  } catch (error) {
    logger.error(`Database logging failure for action ${action}: ${error.message}`);
  }
};

module.exports = {
  logActivity
};
