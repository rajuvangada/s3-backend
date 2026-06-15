const mongoose = require('mongoose');

const sharedLinkSchema = new mongoose.Schema({
  file_id: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
  token: { type: String, required: true, unique: true },
  permission: { type: String, enum: ['view', 'download'], default: 'view' },
  expiry_date: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('SharedLink', sharedLinkSchema);
