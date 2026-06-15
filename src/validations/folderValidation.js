const Joi = require('joi');

const objectId = Joi.string().trim().length(24).hex();

const createFolderSchema = Joi.object({
  folder_name: Joi.string().trim().min(1).max(255).required().messages({
    'string.empty': 'Folder name is required.',
    'string.min': 'Folder name must contain at least 1 character.',
    'string.max': 'Folder name cannot exceed 255 characters.'
  }),
  parent_folder_id: objectId.allow(null, '').optional()
});

const updateFolderSchema = Joi.object({
  folder_name: Joi.string().trim().min(1).max(255).required().messages({
    'string.empty': 'Folder name is required.',
    'string.min': 'Folder name must contain at least 1 character.',
    'string.max': 'Folder name cannot exceed 255 characters.'
  })
});

module.exports = {
  createFolderSchema,
  updateFolderSchema
};
