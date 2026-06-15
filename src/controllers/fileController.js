const crypto = require('crypto');
const pool = require('../config/db');
const { uploadFile, deleteFile, getPreSignedDownloadUrl } = require('../services/s3Service');
const { logActivity } = require('../services/activityService');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');

// Helper to partition S3 file directories by standard portfolio category folders
const getS3Category = (mimetype) => {
  if (mimetype === 'application/pdf') return 'resumes';
  if (mimetype.startsWith('image/')) return 'certificates';
  if (mimetype.startsWith('application/zip') || mimetype.startsWith('application/x-zip-compressed')) return 'projects';
  return 'notes';
};

/**
 * Handle multipart S3 file upload and DB metadata insertion.
 */
const uploadFileController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { folder_id } = req.body;

    if (!req.file) {
      return next(new BadRequestError('No file buffer uploaded.'));
    }

    let dbFolderId = null;
    if (folder_id && folder_id !== 'null' && folder_id !== '') {
      dbFolderId = parseInt(folder_id, 10);
      
      // Ownership check for destination folder
      const [folder] = await pool.query('SELECT user_id FROM Folders WHERE id = ?', [dbFolderId]);
      if (folder.length === 0) {
        return next(new NotFoundError('Destination folder not found.'));
      }
      if (folder[0].user_id !== userId) {
        return next(new ForbiddenError('Access Denied: You do not own the destination folder.'));
      }
    }

    const file = req.file;
    const fileId = crypto.randomUUID();
    const category = getS3Category(file.mimetype);

    // Prefix path matching S3 bucket folder requirement
    const s3Key = `users/${userId}/${category}/${fileId}-${file.originalname}`;

    // Upload to Amazon S3
    await uploadFile(file.buffer, s3Key, file.mimetype);

    // Write metadata to RDS
    const insertQuery = `
      INSERT INTO Files (id, user_id, folder_id, file_name, original_name, file_type, file_size, s3_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await pool.query(insertQuery, [
      fileId,
      userId,
      dbFolderId,
      file.originalname,
      file.originalname,
      file.mimetype,
      file.size,
      s3Key
    ]);

    // Record activity
    await logActivity(userId, 'Upload', { fileId, fileName: file.originalname }, req.ip);

    res.status(201).json({
      status: 'success',
      data: {
        file: {
          id: fileId,
          user_id: userId,
          folder_id: dbFolderId,
          file_name: file.originalname,
          file_type: file.mimetype,
          file_size: file.size,
          s3_key: s3Key,
          is_favorite: 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get files list
 * Supports optional parent folder_id and is_favorite filtering
 */
const getFiles = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { folder_id, is_favorite } = req.query;

    let query = 'SELECT * FROM Files WHERE user_id = ? AND is_deleted = 0';
    let params = [userId];

    if (folder_id !== undefined) {
      if (folder_id === 'null' || folder_id === '') {
        query += ' AND folder_id IS NULL';
      } else {
        query += ' AND folder_id = ?';
        params.push(folder_id);
      }
    }

    if (is_favorite !== undefined) {
      query += ' AND is_favorite = ?';
      params.push(is_favorite === 'true' ? 1 : 0);
    }

    const [files] = await pool.query(query, params);

    res.status(200).json({
      status: 'success',
      results: files.length,
      data: {
        files
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single file metadata by ID
 */
const getFile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [files] = await pool.query('SELECT * FROM Files WHERE id = ? AND is_deleted = 0', [id]);
    if (files.length === 0) {
      return next(new NotFoundError('File not found.'));
    }

    const file = files[0];
    if (file.user_id !== userId) {
      return next(new ForbiddenError('Access Denied: You do not own this file.'));
    }

    res.status(200).json({
      status: 'success',
      data: {
        file
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Rename file name
 */
const updateFile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { file_name } = req.body;
    const userId = req.user.id;

    // Ownership check
    const [files] = await pool.query('SELECT user_id, file_name FROM Files WHERE id = ? AND is_deleted = 0', [id]);
    if (files.length === 0) {
      return next(new NotFoundError('File not found.'));
    }

    const file = files[0];
    if (file.user_id !== userId) {
      return next(new ForbiddenError('Access Denied: You do not own this file.'));
    }

    await pool.query('UPDATE Files SET file_name = ? WHERE id = ?', [file_name, id]);

    // Log rename activity
    await logActivity(userId, 'Rename', { fileId: id, oldName: file.file_name, newName: file_name }, req.ip);

    res.status(200).json({
      status: 'success',
      data: {
        file: {
          id,
          file_name
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete file
 */
const deleteFileController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify owner
    const [files] = await pool.query('SELECT user_id, file_name FROM Files WHERE id = ? AND is_deleted = 0', [id]);
    if (files.length === 0) {
      return next(new NotFoundError('File not found.'));
    }

    const file = files[0];
    if (file.user_id !== userId) {
      return next(new ForbiddenError('Access Denied: You do not own this file.'));
    }

    // Perform soft-delete
    await pool.query('UPDATE Files SET is_deleted = 1 WHERE id = ?', [id]);

    // Log deletion activity
    await logActivity(userId, 'Delete', { fileId: id, fileName: file.file_name, type: 'soft' }, req.ip);

    res.status(200).json({
      status: 'success',
      message: 'File soft deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Move file to another directory folder
 */
const moveFile = async (req, res, next) => {
  try {
    const { file_id, folder_id } = req.body;
    const userId = req.user.id;

    // Fetch file ownership
    const [files] = await pool.query('SELECT user_id, folder_id, file_name FROM Files WHERE id = ? AND is_deleted = 0', [file_id]);
    if (files.length === 0) {
      return next(new NotFoundError('File not found.'));
    }

    const file = files[0];
    if (file.user_id !== userId) {
      return next(new ForbiddenError('Access Denied: You do not own this file.'));
    }

    // Verify target folder ownership
    let dbFolderId = null;
    if (folder_id !== null && folder_id !== '') {
      dbFolderId = parseInt(folder_id, 10);
      const [folder] = await pool.query('SELECT user_id FROM Folders WHERE id = ?', [dbFolderId]);
      if (folder.length === 0) {
        return next(new NotFoundError('Target folder not found.'));
      }
      if (folder[0].user_id !== userId) {
        return next(new ForbiddenError('Access Denied: You do not own the target folder.'));
      }
    }

    await pool.query('UPDATE Files SET folder_id = ? WHERE id = ?', [dbFolderId, file_id]);

    // Log move as rename event in activities schema
    await logActivity(
      userId,
      'Rename',
      { fileId: file_id, fileName: file.file_name, subaction: 'moved', oldFolder: file.folder_id, newFolder: dbFolderId },
      req.ip
    );

    res.status(200).json({
      status: 'success',
      message: 'File moved successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle favorite status of a file
 */
const favoriteFile = async (req, res, next) => {
  try {
    const { file_id, is_favorite } = req.body;
    const userId = req.user.id;

    const [files] = await pool.query('SELECT user_id FROM Files WHERE id = ? AND is_deleted = 0', [file_id]);
    if (files.length === 0) {
      return next(new NotFoundError('File not found.'));
    }

    if (files[0].user_id !== userId) {
      return next(new ForbiddenError('Access Denied: You do not own this file.'));
    }

    await pool.query('UPDATE Files SET is_favorite = ? WHERE id = ?', [is_favorite ? 1 : 0, file_id]);

    res.status(200).json({
      status: 'success',
      message: is_favorite ? 'File marked as favorite.' : 'File removed from favorites.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get S3 Pre-Signed URL for authenticated user download
 */
const downloadFile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [files] = await pool.query('SELECT * FROM Files WHERE id = ? AND is_deleted = 0', [id]);
    if (files.length === 0) {
      return next(new NotFoundError('File not found.'));
    }

    const file = files[0];
    if (file.user_id !== userId) {
      return next(new ForbiddenError('Access Denied: You do not own this file.'));
    }

    // Generate pre-signed URL valid for 15 minutes
    const presignedUrl = await getPreSignedDownloadUrl(file.s3_key, file.original_name, 900);

    // Audit Download Action
    await logActivity(userId, 'Download', { fileId: id, fileName: file.file_name }, req.ip);

    res.status(200).json({
      status: 'success',
      download_url: presignedUrl
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create public read-only shared link
 */
const shareFile = async (req, res, next) => {
  try {
    const { file_id, permission, expiry_hours } = req.body;
    const userId = req.user.id;

    const [files] = await pool.query('SELECT user_id, file_name FROM Files WHERE id = ? AND is_deleted = 0', [file_id]);
    if (files.length === 0) {
      return next(new NotFoundError('File not found.'));
    }

    if (files[0].user_id !== userId) {
      return next(new ForbiddenError('Access Denied: You do not own this file.'));
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiryDate = new Date(Date.now() + expiry_hours * 60 * 60 * 1000);
    const shareId = crypto.randomUUID();

    const insertQuery = `
      INSERT INTO SharedLinks (id, file_id, token, permission, expiry_date)
      VALUES (?, ?, ?, ?, ?)
    `;
    await pool.query(insertQuery, [shareId, file_id, token, permission || 'read', expiryDate]);

    // Log Share
    await logActivity(userId, 'Share', { fileId: file_id, fileName: files[0].file_name, shareId, expiryHours: expiry_hours }, req.ip);

    res.status(201).json({
      status: 'success',
      data: {
        id: shareId,
        file_id,
        token,
        permission: permission || 'read',
        expiry_date: expiryDate.toISOString(),
        share_link: `${req.protocol}://${req.get('host')}/api/files/share/${token}`
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetch shared file metadata and download link (Public endpoint - no JWT required)
 */
const getSharedFile = async (req, res, next) => {
  try {
    const { token } = req.params;

    const query = `
      SELECT sl.id AS share_id, sl.expiry_date, f.id AS file_id, f.file_name, f.original_name, f.file_type, f.file_size, f.s3_key, f.user_id
      FROM SharedLinks sl
      INNER JOIN Files f ON sl.file_id = f.id
      WHERE sl.token = ? AND f.is_deleted = 0
    `;
    const [results] = await pool.query(query, [token]);

    if (results.length === 0) {
      return next(new NotFoundError('Shared link invalid or the target file was deleted.'));
    }

    const share = results[0];

    // Check share link expiration
    if (new Date() > new Date(share.expiry_date)) {
      return next(new ForbiddenError('This shared link has expired.'));
    }

    // Generate S3 Pre-signed URL for the anonymous client
    const presignedUrl = await getPreSignedDownloadUrl(share.s3_key, share.original_name, 600);

    // Audit Download via public share token (attributed to file owner's logs ledger)
    await logActivity(share.user_id, 'Download', { fileId: share.file_id, viaShare: share.share_id, status: 'public' }, req.ip);

    res.status(200).json({
      status: 'success',
      data: {
        file_name: share.file_name,
        file_type: share.file_type,
        file_size: share.file_size,
        download_url: presignedUrl
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Revoke/delete shared link
 */
const deleteShare = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const checkQuery = `
      SELECT sl.id, f.user_id 
      FROM SharedLinks sl
      INNER JOIN Files f ON sl.file_id = f.id
      WHERE sl.id = ?
    `;
    const [shares] = await pool.query(checkQuery, [id]);

    if (shares.length === 0) {
      return next(new NotFoundError('Shared link not found.'));
    }

    if (shares[0].user_id !== userId) {
      return next(new ForbiddenError('Access Denied: You do not own the file associated with this share link.'));
    }

    await pool.query('DELETE FROM SharedLinks WHERE id = ?', [id]);

    res.status(200).json({
      status: 'success',
      message: 'Shared link revoked successfully.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadFile: uploadFileController,
  getFiles,
  getFile,
  updateFile,
  deleteFile: deleteFileController,
  moveFile,
  favoriteFile,
  downloadFile,
  shareFile,
  getSharedFile,
  deleteShare
};
