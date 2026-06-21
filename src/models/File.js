const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  folder_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  file_name: { type: String, required: true },
  original_name: { type: String, required: true },
  file_type: { type: String, required: true },
  file_size: { type: Number, required: true },
  s3_key: { type: String, required: true },
  is_favorite: { type: Boolean, default: false }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('File', fileSchema);
