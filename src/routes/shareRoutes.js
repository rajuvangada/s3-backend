const express = require('express');
const router = express.Router();

const {
  shareFile,
  getSharedFile,
  deleteShare
} = require('../controllers/fileController');

const { protect } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { createShareSchema } = require('../validations/fileValidation');

// Public read-only endpoint (no JWT verification to allow anonymous downloads)
router.get('/:token', getSharedFile);

// Protected endpoints for generating or revoking shares
router.post('/', protect, validate(createShareSchema), shareFile);
router.delete('/:id', protect, deleteShare);

module.exports = router;
