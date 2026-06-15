const Joi = require('joi');

const uploadFileSchema = Joi.object({
  folder_id: Joi.string().allow(null, '').optional() // Multer fields are strings
});

const updateFileSchema = Joi.object({
  file_name: Joi.string().trim().min(1).max(255).required().messages({
    'string.empty': 'File name is required.',
    'string.max': 'File name cannot exceed 255 characters.'
  })
});

const moveFileSchema = Joi.object({
  file_id: Joi.string().uuid().required().messages({
    'string.empty': 'File ID is required.'
  }),
  folder_id: Joi.number().integer().allow(null).required()
});

const favoriteFileSchema = Joi.object({
  file_id: Joi.string().uuid().required().messages({
    'string.empty': 'File ID is required.'
  }),
  is_favorite: Joi.boolean().required()
});

const createShareSchema = Joi.object({
  file_id: Joi.string().uuid().required(),
  permission: Joi.string().valid('read').default('read'),
  expiry_hours: Joi.number().integer().min(1).max(720).default(24) // 1 hour to 30 days
});

module.exports = {
  uploadFileSchema,
  updateFileSchema,
  moveFileSchema,
  favoriteFileSchema,
  createShareSchema
};
