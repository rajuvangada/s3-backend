const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  folder_name: { type: String, required: true },
  parent_folder_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Folder', folderSchema);
