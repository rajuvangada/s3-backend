const crypto = require('crypto');
const File = require('../models/File');
const Folder = require('../models/Folder');
const SharedLink = require('../models/SharedLink');
const { uploadFile, deleteFile: deleteS3File, getPreSignedDownloadUrl } = require('../services/s3Service');
const { logActivity } = require('../services/activityService');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');

const serializeFile = (file) => ({
  id: file.id,
  user_id: file.user_id?.toString?.() || file.user_id,
  folder_id: file.folder_id ? file.folder_id.toString() : null,
  file_name: file.file_name,
  original_name: file.original_name,
  file_type: file.file_type,
  file_size: file.file_size,
  s3_key: file.s3_key,
  is_favorite: file.is_favorite,
  created_at: file.created_at,
  updated_at: file.updated_at
});

const getS3Category = (mimetype) => {
  if (mimetype === 'application/pdf') return 'documents';
  if (mimetype.startsWith('image/')) return 'images';
  if (mimetype.includes('zip')) return 'archives';
  return 'files';
};

const ensureOwnedFolder = async (folderId, userId) => {
  if (!folderId || folderId === 'null' || folderId === '') {
    return null;
  }

  const folder = await Folder.findById(folderId);
  if (!folder) {
    throw new NotFoundError('Folder not found.');
  }

  if (folder.user_id.toString() !== userId.toString()) {
    throw new ForbiddenError('Access denied: you do not own this folder.');
  }

  return folder;
};

const findOwnedFile = async (fileId, userId) => {
  const file = await File.findById(fileId);
  if (!file) {
    throw new NotFoundError('File not found.');
  }

  if (file.user_id.toString() !== userId.toString()) {
    throw new ForbiddenError('Access denied: you do not own this file.');
  }

  return file;
};

const uploadFileController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { folder_id } = req.body;

    // Debug logging to verify Multer file handling
    console.log('--- UploadFileController Debug ---');
    console.log('req.file:', req.file);
    console.log('req.body:', req.body);

    if (!req.file) {
      return next(new BadRequestError('No file uploaded.'));
    }

    const folder = await ensureOwnedFolder(folder_id, userId);
    const file = req.file;
    const category = getS3Category(file.mimetype);
    const objectId = crypto.randomUUID();
    const sanitizedName = file.originalname.replace(/\s+/g, '-');
    const s3Key = `users/${userId}/${category}/${objectId}-${sanitizedName}`;

    await uploadFile(file.buffer, s3Key, file.mimetype);

    const createdFile = await File.create({
      user_id: userId,
      folder_id: folder ? folder.id : null,
      file_name: file.originalname,
      original_name: file.originalname,
      file_type: file.mimetype,
      file_size: file.size,
      s3_key: s3Key
    });

    await logActivity(userId, 'Upload', { fileId: createdFile.id, fileName: createdFile.file_name }, req.ip);

    res.status(201).json({
      status: 'success',
      data: {
        file: serializeFile(createdFile)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getFiles = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { folder_id, is_favorite } = req.query;
    const query = { user_id: userId };

    if (folder_id !== undefined) {
      query.folder_id = folder_id === 'null' || folder_id === '' ? null : folder_id;
    }

    if (is_favorite !== undefined) {
      query.is_favorite = is_favorite === 'true';
    }

    const files = await File.find(query).sort({ created_at: -1 });

    res.status(200).json({
      status: 'success',
      results: files.length,
      data: {
        files: files.map(serializeFile)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getFile = async (req, res, next) => {
  try {
    const file = await findOwnedFile(req.params.id, req.user.id);

    res.status(200).json({
      status: 'success',
      data: {
        file: serializeFile(file)
      }
    });
  } catch (error) {
    next(error);
  }
};

const updateFile = async (req, res, next) => {
  try {
    const file = await findOwnedFile(req.params.id, req.user.id);
    const oldName = file.file_name;

    file.file_name = req.body.file_name;
    await file.save();

    await logActivity(req.user.id, 'Rename', { fileId: file.id, oldName, newName: file.file_name }, req.ip);

    res.status(200).json({
      status: 'success',
      data: {
        file: serializeFile(file)
      }
    });
  } catch (error) {
    next(error);
  }
};

const deleteFileController = async (req, res, next) => {
  try {
    const file = await findOwnedFile(req.params.id, req.user.id);

    await deleteS3File(file.s3_key);
    await SharedLink.deleteMany({ file_id: file.id });
    await File.findByIdAndDelete(file.id);

    await logActivity(req.user.id, 'Delete', { fileId: file.id, fileName: file.file_name }, req.ip);

    res.status(200).json({
      status: 'success',
      message: 'File metadata deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

const moveFile = async (req, res, next) => {
  try {
    const { file_id, folder_id } = req.body;
    const file = await findOwnedFile(file_id, req.user.id);
    const folder = await ensureOwnedFolder(folder_id, req.user.id);
    const oldFolder = file.folder_id ? file.folder_id.toString() : null;

    file.folder_id = folder ? folder.id : null;
    await file.save();

    await logActivity(
      req.user.id,
      'Move',
      { fileId: file.id, fileName: file.file_name, oldFolder, newFolder: file.folder_id ? file.folder_id.toString() : null },
      req.ip
    );

    res.status(200).json({
      status: 'success',
      data: {
        file: serializeFile(file)
      }
    });
  } catch (error) {
    next(error);
  }
};

const favoriteFile = async (req, res, next) => {
  try {
    const { file_id, is_favorite } = req.body;
    const file = await findOwnedFile(file_id, req.user.id);

    file.is_favorite = is_favorite;
    await file.save();

    res.status(200).json({
      status: 'success',
      data: {
        file: serializeFile(file)
      }
    });
  } catch (error) {
    next(error);
  }
};

const downloadFile = async (req, res, next) => {
  try {
    const file = await findOwnedFile(req.params.id, req.user.id);
    const presignedUrl = await getPreSignedDownloadUrl(file.s3_key, file.original_name, 900);

    await logActivity(req.user.id, 'Download', { fileId: file.id, fileName: file.file_name }, req.ip);

    res.status(200).json({
      status: 'success',
      download_url: presignedUrl
    });
  } catch (error) {
    next(error);
  }
};

const shareFile = async (req, res, next) => {
  try {
    const { file_id, permission, expiry_hours } = req.body;
    const file = await findOwnedFile(file_id, req.user.id);
    const token = crypto.randomBytes(32).toString('hex');
    const expiryDate = expiry_hours ? new Date(Date.now() + expiry_hours * 60 * 60 * 1000) : null;

    const sharedLink = await SharedLink.create({
      file_id: file.id,
      token,
      permission: permission || 'read',
      expiry_date: expiryDate
    });

    await logActivity(
      req.user.id,
      'Share',
      { fileId: file.id, fileName: file.file_name, shareId: sharedLink.id, expiryHours: expiry_hours || null },
      req.ip
    );

    res.status(201).json({
      status: 'success',
      data: {
        id: sharedLink.id,
        file_id: file.id,
        token: sharedLink.token,
        permission: sharedLink.permission,
        expiry_date: sharedLink.expiry_date,
        share_link: `${req.protocol}://${req.get('host')}/api/share/${sharedLink.token}`
      }
    });
  } catch (error) {
    next(error);
  }
};

const getSharedFile = async (req, res, next) => {
  try {
    const sharedLink = await SharedLink.findOne({ token: req.params.token }).populate('file_id');

    if (!sharedLink || !sharedLink.file_id) {
      return next(new NotFoundError('Shared link not found.'));
    }

    if (sharedLink.expiry_date && new Date() > sharedLink.expiry_date) {
      return next(new ForbiddenError('This shared link has expired.'));
    }

    const file = sharedLink.file_id;
    const presignedUrl = await getPreSignedDownloadUrl(file.s3_key, file.original_name, 600);

    await logActivity(file.user_id, 'Download', { fileId: file.id, viaShare: sharedLink.id, status: 'public' }, req.ip);

    res.status(200).json({
      status: 'success',
      data: {
        file_name: file.file_name,
        file_type: file.file_type,
        file_size: file.file_size,
        download_url: presignedUrl
      }
    });
  } catch (error) {
    next(error);
  }
};

const deleteShare = async (req, res, next) => {
  try {
    const sharedLink = await SharedLink.findById(req.params.id).populate('file_id');

    if (!sharedLink || !sharedLink.file_id) {
      return next(new NotFoundError('Shared link not found.'));
    }

    if (sharedLink.file_id.user_id.toString() !== req.user.id.toString()) {
      return next(new ForbiddenError('Access denied: you do not own the file associated with this share link.'));
    }

    await SharedLink.findByIdAndDelete(sharedLink.id);

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
