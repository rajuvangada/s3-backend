const express = require('express');
const router = express.Router();

const {
  uploadFile,
  getFiles,
  getFile,
  updateFile,
  deleteFile,
  moveFile,
  favoriteFile,
  downloadFile
} = require('../controllers/fileController');

const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/fileValidation');
const validate = require('../middleware/validate');
const {
  updateFileSchema,
  moveFileSchema,
  favoriteFileSchema
} = require('../validations/fileValidation');

// All file management endpoints require JWT authentication
router.use(protect);

// File management paths
router.post('/upload', upload.single('file'), uploadFile);
router.get('/', getFiles);
router.get('/:id', getFile);
router.put('/:id', validate(updateFileSchema), updateFile);
router.delete('/:id', deleteFile);
router.post('/move', validate(moveFileSchema), moveFile);
router.post('/favorite', validate(favoriteFileSchema), favoriteFile);
router.get('/download/:id', downloadFile);

module.exports = router;
