const mongoose = require('mongoose');

// Stores admin-set labels for WhatsApp conversations — persists indefinitely
const chatLabelSchema = new mongoose.Schema({
  customerPhone: { type: String, required: true, trim: true },
  businessId:    { type: String, required: true },
  label:         { type: String, enum: ['follow_up', 'active', 'closed', 'no_response'], default: null },
  note:          { type: String, default: '', trim: true },
}, { timestamps: true });

chatLabelSchema.index({ customerPhone: 1, businessId: 1 }, { unique: true });

module.exports = mongoose.model('ChatLabel', chatLabelSchema);
