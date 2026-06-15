const express = require('express');
const router = express.Router();

const {
  createFolder,
  getFolders,
  updateFolder,
  deleteFolder
} = require('../controllers/folderController');

const { protect } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { createFolderSchema, updateFolderSchema } = require('../validations/folderValidation');

// All folder endpoints require JWT authentication
router.use(protect);

router.post('/', validate(createFolderSchema), createFolder);
router.get('/', getFolders);
router.put('/:id', validate(updateFolderSchema), updateFolder);
router.delete('/:id', deleteFolder);

module.exports = router;
