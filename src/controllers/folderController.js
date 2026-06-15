const pool = require('../config/db');
const { logActivity } = require('../services/activityService');
const { deleteFile } = require('../services/s3Service');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');

/**
 * Create a new folder
 */
const createFolder = async (req, res, next) => {
  try {
    const { folder_name, parent_folder_id } = req.body;
    const userId = req.user.id;

    // Check parent folder ownership if parent_folder_id is provided
    if (parent_folder_id) {
      const [parent] = await pool.query('SELECT user_id FROM Folders WHERE id = ?', [parent_folder_id]);
      if (parent.length === 0) {
        return next(new NotFoundError('Parent folder not found.'));
      }
      if (parent[0].user_id !== userId) {
        return next(new ForbiddenError('Access Denied: You do not own the parent folder.'));
      }
    }

    const [result] = await pool.query(
      'INSERT INTO Folders (user_id, folder_name, parent_folder_id) VALUES (?, ?, ?)',
      [userId, folder_name, parent_folder_id || null]
    );

    res.status(201).json({
      status: 'success',
      data: {
        folder: {
          id: result.insertId,
          user_id: userId,
          folder_name,
          parent_folder_id: parent_folder_id || null
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve folders for the authenticated user
 * Supports optional parent_folder_id filtering
 */
const getFolders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { parent_folder_id } = req.query;

    let query = 'SELECT * FROM Folders WHERE user_id = ?';
    let params = [userId];

    if (parent_folder_id !== undefined) {
      if (parent_folder_id === 'null' || parent_folder_id === '') {
        query += ' AND parent_folder_id IS NULL';
      } else {
        query += ' AND parent_folder_id = ?';
        params.push(parent_folder_id);
      }
    }

    const [folders] = await pool.query(query, params);

    res.status(200).json({
      status: 'success',
      results: folders.length,
      data: {
        folders
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Rename an existing folder
 */
const updateFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { folder_name } = req.body;
    const userId = req.user.id;

    // Ownership check
    const [folder] = await pool.query('SELECT user_id FROM Folders WHERE id = ?', [id]);
    if (folder.length === 0) {
      return next(new NotFoundError('Folder not found.'));
    }
    if (folder[0].user_id !== userId) {
      return next(new ForbiddenError('Access Denied: You do not own this folder.'));
    }

    await pool.query('UPDATE Folders SET folder_name = ? WHERE id = ?', [folder_name, id]);

    res.status(200).json({
      status: 'success',
      data: {
        folder: {
          id: parseInt(id, 10),
          folder_name
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a folder recursively.
 * Uses recursive CTEs to gather all sub-files and purge them from S3, then deletes database records.
 */
const deleteFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify folder exists and matches user
    const [folder] = await pool.query('SELECT user_id, folder_name FROM Folders WHERE id = ?', [id]);
    if (folder.length === 0) {
      return next(new NotFoundError('Folder not found.'));
    }
    if (folder[0].user_id !== userId) {
      return next(new ForbiddenError('Access Denied: You do not own this folder.'));
    }

    // Retrieve S3 keys of all files in this folder and its subfolders recursively
    const recursiveFileQuery = `
      WITH RECURSIVE FolderHierarchy AS (
        SELECT id FROM Folders WHERE id = ? AND user_id = ?
        UNION ALL
        SELECT f.id FROM Folders f
        INNER JOIN FolderHierarchy fh ON f.parent_folder_id = fh.id
      )
      SELECT s3_key FROM Files 
      WHERE folder_id IN (SELECT id FROM FolderHierarchy)
    `;
    const [files] = await pool.query(recursiveFileQuery, [id, userId]);

    // Delete files from S3 concurrently
    const s3DeletePromises = files.map((file) =>
      deleteFile(file.s3_key).catch((err) => {
        // Log S3 deletion failures but do not block the DB deletion flow
        console.error(`Deferred S3 purge failure for key: ${file.s3_key}. Error: ${err.message}`);
      })
    );
    await Promise.all(s3DeletePromises);

    // Delete parent folder from DB.
    // Database constraints (ON DELETE CASCADE) will clean up child folders and notifications.
    await pool.query('DELETE FROM Folders WHERE id = ?', [id]);

    // Log rename/deletion audit logs
    await logActivity(userId, 'Delete', { folderId: id, folderName: folder[0].folder_name }, req.ip);

    res.status(200).json({
      status: 'success',
      message: 'Folder and all subcontents deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createFolder,
  getFolders,
  updateFolder,
  deleteFolder
};
