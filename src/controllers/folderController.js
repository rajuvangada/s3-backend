const Folder = require('../models/Folder');
const File = require('../models/File');
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
      const parent = await Folder.findById(parent_folder_id);
      if (!parent) {
        return next(new NotFoundError('Parent folder not found.'));
      }
      if (parent.user_id.toString() !== userId.toString()) {
        return next(new ForbiddenError('Access Denied: You do not own the parent folder.'));
      }
    }

    const folder = await Folder.create({
      user_id: userId,
      folder_name,
      parent_folder_id: parent_folder_id || null
    });

    res.status(201).json({
      status: 'success',
      data: {
        folder: {
          id: folder.id,
          user_id: userId,
          folder_name,
          parent_folder_id: folder.parent_folder_id
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

    const query = { user_id: userId };

    if (parent_folder_id !== undefined) {
      if (parent_folder_id === 'null' || parent_folder_id === '') {
        query.parent_folder_id = null;
      } else {
        query.parent_folder_id = parent_folder_id;
      }
    }

    let folders = await Folder.find(query);
    
    // Map _id to id for API compatibility
    folders = folders.map(f => {
      const folderObj = f.toObject();
      folderObj.id = folderObj._id.toString();
      delete folderObj._id;
      delete folderObj.__v;
      return folderObj;
    });

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
    const folder = await Folder.findById(id);
    if (!folder) {
      return next(new NotFoundError('Folder not found.'));
    }
    if (folder.user_id.toString() !== userId.toString()) {
      return next(new ForbiddenError('Access Denied: You do not own this folder.'));
    }

    folder.folder_name = folder_name;
    await folder.save();

    res.status(200).json({
      status: 'success',
      data: {
        folder: {
          id: folder.id,
          folder_name
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all descendant folder IDs recursively
 */
const getDescendantFolderIds = async (folderId, userId) => {
  let ids = [folderId.toString()];
  let currentParentIds = [folderId.toString()];
  
  while (currentParentIds.length > 0) {
    const children = await Folder.find({ parent_folder_id: { $in: currentParentIds }, user_id: userId });
    currentParentIds = children.map(c => c.id);
    ids = ids.concat(currentParentIds);
  }
  return ids;
};

/**
 * Delete a folder recursively.
 * Uses getDescendantFolderIds to gather all sub-files and purge them from S3, then deletes database records.
 */
const deleteFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify folder exists and matches user
    const folder = await Folder.findById(id);
    if (!folder) {
      return next(new NotFoundError('Folder not found.'));
    }
    if (folder.user_id.toString() !== userId.toString()) {
      return next(new ForbiddenError('Access Denied: You do not own this folder.'));
    }

    // Retrieve all folder IDs in hierarchy
    const folderIds = await getDescendantFolderIds(id, userId);

    // Retrieve S3 keys of all files in this folder and its subfolders recursively
    const files = await File.find({ folder_id: { $in: folderIds } });

    // Delete files from S3 concurrently
    const s3DeletePromises = files.map((file) =>
      deleteFile(file.s3_key).catch((err) => {
        // Log S3 deletion failures but do not block the DB deletion flow
        console.error(`Deferred S3 purge failure for key: ${file.s3_key}. Error: ${err.message}`);
      })
    );
    await Promise.all(s3DeletePromises);

    // Delete Files in DB
    await File.deleteMany({ folder_id: { $in: folderIds } });

    // Delete parent folder and its subfolders from DB
    await Folder.deleteMany({ _id: { $in: folderIds } });

    // Log rename/deletion audit logs
    await logActivity(userId, 'Delete', { folderId: id, folderName: folder.folder_name }, req.ip);

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
